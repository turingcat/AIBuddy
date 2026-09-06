#!/usr/bin/env ruby

require "yaml"
require "open3"

def normalize_powershell_value(value, aliases)
  normalized = value.strip.tr("\\", "/")
  8.times do
    expanded = normalized.gsub(/\$([A-Za-z_]\w*)/) do |match|
      aliases.fetch(Regexp.last_match(1).downcase, match)
    end
    break if expanded == normalized

    normalized = expanded
  end
  normalized.downcase
end

def powershell_aliases(scripts)
  aliases = {}
  scripts.each do |script|
    script.lines.each do |line|
      assignment = line.match(/^\s*\$([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/)
      next unless assignment

      aliases[assignment[1].downcase] = normalize_powershell_value(assignment[2], aliases)
    end
  end
  aliases
end

def powershell_copy_destinations(script, aliases)
  script.lines.filter_map do |line|
    command = line.strip.match(/\A(?:Copy-Item|Move-Item)\b(.*)/i)
    next unless command

    arguments = command[1]
    named = arguments.match(/-Destination\s+("[^"]*"|'[^']*'|\$[A-Za-z_]\w*)/i)
    destination = if named
      named[1]
    else
      arguments.scan(/"[^"]*"|'[^']*'|\S+/).reject { |token| token.start_with?("-") }[1]
    end
    normalize_powershell_value(destination, aliases) if destination
  end
end

def approved_runtime_copy?(script)
  normalized = script.tr("\\", "/")
  normalized.match?(/^\s*\$srcBin\s*=\s*Join-Path\s+\$env:BUILD_SOURCESDIRECTORY\s+["']ui\/desktop\/src\/bin["']\s*$/i) &&
    normalized.match?(/^\s*\$resourcesBin\s*=\s*Join-Path\s+\$packaged\s+["']resources\/bin["']\s*$/i) &&
    normalized.match?(/^\s*Copy-Item\s+-Path\s+["']\$srcBin\/\*["']\s+-Destination\s+\$resourcesBin\s+-Recurse\s+-Force\s*$/i)
end

def approved_installer_validation?(script)
  script.match?(/if\s*\(\s*-not\s*\(Test-Path\s+\$installer\)\s*-or\s*\(Get-Item\s+\$installer\)\.Length\s+-eq\s+0\s*\)\s*\{[^}]*throw/mi)
end

workflow_paths = {
  bundle_macos: ".github/workflows/bundle-macos.yml",
  bundle_windows: ".github/workflows/bundle-windows.yml",
  release: ".github/workflows/release.yml",
  canary: ".github/workflows/canary.yml",
  recovery: ".github/workflows/publish-existing-release.yml",
  release_branches: ".github/workflows/release-branches.yml",
}

workflows = workflow_paths.transform_values do |path|
  abort "missing release workflow #{path}" unless File.exist?(path)

  content = File.read(path)
  YAML.parse(content)
  content
end

attestation_steps = workflows.fetch(:release).scan(
  /- name: Attest build provenance.*?(?=\n\s*- name:|\z)/m
)
abort "expected one build-provenance attestation step" unless attestation_steps.length == 1
unless attestation_steps.first.include?("github.event.repository.owner.type == 'Organization'")
  abort "attestation must be limited to organization-owned repositories"
end

obsolete_updater_fragments = [
  "ENABLE_MAC_NATIVE_AUTO_UPDATE",
  "generate-mac-update-manifest.js",
  "verify-mac-update-resources.js",
  "latest-mac.yml",
]
obsolete_updater_fragments.each do |fragment|
  workflows.each do |name, workflow|
    abort "#{name} workflow retains obsolete updater fragment #{fragment}" if workflow.include?(fragment)
  end
end

mac_verification = "pnpm run verify:package -- darwin out/AIBuddy-darwin-arm64"
unless workflows.fetch(:bundle_macos).include?(mac_verification)
  abort "macOS workflow does not run AIBuddy package verification"
end

release_consumers = workflows.values_at(:release, :canary, :recovery)
release_consumers.each do |workflow|
  ["AIBuddy*.zip"].each do |artifact_glob|
    abort "release consumer missing #{artifact_glob}" unless workflow.include?(artifact_glob)
  end
  unless workflow.include?("AIBuddy*.exe") || workflow.include?("AIBuddy-windows-*-setup.exe")
    abort "release consumer missing AIBuddy Windows installers"
  end
  abort "release consumer retains HeyBuddy artifact names" if workflow.include?("HeyBuddy")
  abort "release consumer retains CLI install artifacts" if workflow.include?("download_cli.sh")
end

abort "Linux packaging workflow still exists" if File.exist?(".github/workflows/build-cli-linux.yml")
workflows.each do |name, workflow|
  if workflow.match?(/package_cli|package-cli|Package CLI/i)
    abort "#{name} workflow still packages CLI artifacts"
  end
end

windows = workflows.fetch(:bundle_windows)
%w[i686-pc-windows-msvc x86_64-pc-windows-msvc electron_arch:\ ia32 electron_arch:\ x64].each do |fragment|
  abort "Windows workflow missing #{fragment}" unless windows.include?(fragment.gsub("\\ ", " "))
end

recovery = workflows.fetch(:recovery)
required_recovery_fragments = [
  "workflow_dispatch:",
  "release_tag:",
  "source_run_id:",
  "run-id: ${{ inputs.source_run_id }}",
  "merge-multiple: true",
  "tag: ${{ inputs.release_tag }}",
  "name: AIBuddy ${{ inputs.release_tag }}",
]
required_recovery_fragments.each do |fragment|
  abort "recovery workflow missing #{fragment}" unless recovery.include?(fragment)
end

recovery_steps = YAML.load(recovery).fetch("jobs").fetch("publish").fetch("steps")
download = recovery_steps.find { |step| step["uses"].to_s.start_with?("actions/download-artifact@") }
abort "recovery must exclude internal artifacts" unless download.dig("with", "pattern") == "!internal-*"

{ release: "release", recovery: "publish" }.each do |name, job_id|
  job = YAML.load(workflows.fetch(name)).fetch("jobs").fetch(job_id)
  abort "stable publication must be serialized" unless job.fetch("concurrency") == {
    "group" => "publish-aibuddy-stable", "cancel-in-progress" => false,
  }
  steps = job.fetch("steps")
  upload = steps.find { |step| step["name"] == "Upload Windows installers to COS" }
  abort "release must upload AIBuddy Windows installers to COS" unless upload &&
    upload["run"] == "bash .github/scripts/upload-windows-installers-to-cos.sh"
  checkout = steps.find { |step| step["uses"].to_s.start_with?("actions/checkout@") }
  abort "release scripts need credential-free checkout" unless checkout.dig("with", "persist-credentials") == false
end

release_job = YAML.load(workflows.fetch(:release)).fetch("jobs").fetch("release")
abort "COS publication must wait for desktop builds" unless release_job.fetch("needs").sort ==
  %w[bundle-macos-arm64 bundle-windows].sort
abort "branch builds must not publish stable" unless release_job.fetch("if") == "startsWith(github.ref, 'refs/tags/')"
version_check = release_job.fetch("steps").first.fetch("run")
{ "v1.2.3" => true, "v1.2.3-rc.1" => false, "v1.2.3+build" => false,
  "stable" => false, "release/1.2.3" => false, "" => false }.each do |tag, expected|
  _, status = Open3.capture2e({ "GITHUB_REF_NAME" => tag }, "bash", "-c", version_check)
  abort "unexpected stable publication eligibility for #{tag.inspect}" unless status.success? == expected
end

azure_path = "azure-pipelines.yml"
azure = YAML.load_file(azure_path)
azure_text = File.read(azure_path)

abort "Azure pipeline must remain manual-only" unless azure["trigger"] == "none" && azure["pr"] == "none"
azure_strategy = azure.fetch("strategy", {})
abort "Azure matrix must be serial" unless azure_strategy["maxParallel"] == 1

azure_matrix = azure_strategy.fetch("matrix", {})
abort "Azure matrix must define exactly x32 and x64" unless azure_matrix.keys.sort == %w[x32 x64]

expected_azure_matrix = {
  "x32" => {
    "ARTIFACT_ARCH" => "x32",
    "ELECTRON_ARCH" => "ia32",
    "RUST_TARGET" => "i686-pc-windows-msvc",
    "CARGO_FEATURES" => "aws-providers,nostr,otel,rustls-tls,system-keyring",
  },
  "x64" => {
    "ARTIFACT_ARCH" => "x64",
    "ELECTRON_ARCH" => "x64",
    "RUST_TARGET" => "x86_64-pc-windows-msvc",
    "CARGO_FEATURES" => "code-mode,aws-providers,nostr,otel,rustls-tls,system-keyring,update",
  },
}
expected_azure_matrix.each do |leg, expected|
  actual = azure_matrix.fetch(leg, {}).slice(*expected.keys)
  abort "Azure #{leg} matrix mapping is incorrect" unless actual == expected
end

azure_steps = azure.fetch("steps", [])
azure_powershell = azure_steps.filter_map { |step| step["powershell"] if step.is_a?(Hash) }

release_build = azure_powershell.find { |script| script.include?("cargo build") && script.include?("--release") }
abort "Azure pipeline must build the matrix Rust target in release mode" unless release_build &&
  release_build.include?("--target $env:RUST_TARGET") &&
  release_build.include?("--features $env:CARGO_FEATURES") &&
  release_build.include?('target\$env:RUST_TARGET\release\goose.exe') &&
  release_build.match?(/Copy-Item\s+\$binary\s+["']ui\\desktop\\src\\bin\\goose\.exe["']\s+-Force/i)

desktop_build = azure_powershell.find do |script|
  normalized = script.tr("\\", "/")
  normalized.match?(/(?:Set-Location|cd)\s+["']?(?:\.\/)?ui\/desktop["']?/i) &&
    normalized.include?("prepare-platform-binaries.js") &&
    normalized.include?("pnpm run package:windows -- --arch=$env:ELECTRON_ARCH") &&
    normalized.include?("resolveWindowsPackage") &&
    normalized.include?("ARTIFACT_ARCH") &&
    approved_runtime_copy?(script)
end
abort "Azure pipeline must prepare and package the matching Electron architecture" unless desktop_build &&
  desktop_build.include?("pnpm run package:windows -- --arch=$env:ELECTRON_ARCH")
abort "Azure pipeline must use the approved src/bin to resources/bin copy" unless approved_runtime_copy?(desktop_build)

artifact_name = "AIBuddy-windows-$(ARTIFACT_ARCH)-setup"
resolved_artifacts = azure_matrix.values.map do |leg|
  artifact_name.sub("$(ARTIFACT_ARCH)", leg.fetch("ARTIFACT_ARCH", ""))
end
unless resolved_artifacts.sort == %w[AIBuddy-windows-x32-setup AIBuddy-windows-x64-setup]
  abort "Azure matrix must resolve x32 and x64 setup artifact names"
end

publish_shorthand = azure_steps.select { |step| step.is_a?(Hash) && step.key?("publish") }
abort "Azure pipeline must not use publish shorthand" unless publish_shorthand.empty?

publish_tasks = azure_steps.select do |step|
  step.is_a?(Hash) && step["task"].to_s.match?(/PublishPipelineArtifact/i)
end
abort "Azure pipeline must define exactly one PublishPipelineArtifact@1 task" unless publish_tasks.length == 1 &&
  publish_tasks.first["task"] == "PublishPipelineArtifact@1"

forbidden_tasks = azure_steps.select do |step|
  step.is_a?(Hash) && step["task"].to_s.match?(/PublishBuildArtifacts|UniversalPackages|CopyFiles|ArchiveFiles/i)
end
abort "Azure pipeline contains a forbidden publication or archive task" unless forbidden_tasks.empty?

publish = publish_tasks.first
publish_inputs = publish.fetch("inputs", {})
target_path = publish_inputs["targetPath"].to_s.tr("\\", "/")
expected_target_path = "$(Build.ArtifactStagingDirectory)/#{artifact_name}"
unless publish_inputs["artifact"] == artifact_name && target_path == expected_target_path
  abort "Azure pipeline must publish only the staged setup directory"
end

installer = azure_powershell.find { |script| script.include?("desktop-setup.iss") }
abort "Azure pipeline must stage only the architecture-specific installer" unless installer &&
  installer.include?('$outputDir = Join-Path $env:BUILD_ARTIFACTSTAGINGDIRECTORY "AIBuddy-windows-$env:ARTIFACT_ARCH-setup"') &&
  installer.match?(/windows-package\.js.*\$env:ARTIFACT_ARCH.*\$outputDir/) &&
  installer.match?(/&\s+\$iscc\s+@\(\$pkg\.isccArgs\)\s+["']ui[\\\/]desktop[\\\/]desktop-setup\.iss["']/i) &&
  installer.include?('$installer = Join-Path $outputDir $pkg.setupFileName') &&
  approved_installer_validation?(installer)

aliases = powershell_aliases(azure_powershell)
staged_payload_copy = azure_powershell.any? do |script|
  powershell_copy_destinations(script, aliases).any? do |destination|
    destination.include?("artifactstagingdirectory") ||
      destination.include?("$outputdir") ||
      destination.include?("aibuddy-windows-$env:artifact_arch-setup")
  end
end
abort "Azure pipeline must not copy standalone payloads into setup staging" if staged_payload_copy

forbidden_step_output = azure_steps.any? do |step|
  next false unless step.is_a?(Hash)

  step.to_s.match?(/artifact\.upload|\baz\s+artifacts\b|Compress-Archive|\btar(?:\.exe)?\s+-a\b|7z(?:\.exe)?\s+a\b.*(?:-tzip|\.zip)|portableFileName|\.zip\b/i)
end
abort "Azure pipeline contains a forbidden publication or archive path" if forbidden_step_output
abort "Azure pipeline must not dispatch GitHub Actions" if azure_text.include?("gh workflow run") || azure_text.include?("workflow_dispatch")

release_branches = workflows.fetch(:release_branches)
abort "release candidate instructions missing AIBuddy.app" unless release_branches.include?("AIBuddy.app")

puts "release workflow contracts pass"
