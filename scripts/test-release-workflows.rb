#!/usr/bin/env ruby

require "yaml"
require "open3"

def analyze_powershell(script)
  code = +""
  executable_semicolon = false
  quote = nil
  block_comment = false
  index = 0

  while index < script.length
    character = script[index]
    following = script[index + 1]

    if block_comment
      if character == "#" && following == ">"
        block_comment = false
        index += 2
      else
        code << character if character == "\n"
        index += 1
      end
    elsif quote
      code << character
      if character == "`" && quote == '"' && following
        code << following
        index += 2
      elsif character == quote
        if quote == "'" && following == "'"
          code << following
          index += 2
        else
          quote = nil
          index += 1
        end
      else
        index += 1
      end
    elsif character == "#"
      index += 1
      index += 1 while index < script.length && script[index] != "\n"
    elsif character == "<" && following == "#"
      block_comment = true
      index += 2
    elsif character == "'" || character == '"'
      quote = character
      code << character
      index += 1
    elsif character == "`" && following
      code << character << following
      index += 2
    else
      executable_semicolon = true if character == ";"
      code << character
      index += 1
    end
  end

  [code, executable_semicolon]
end

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

def powershell_copy_destinations(scripts)
  aliases = {}
  destinations = []
  scripts.each do |script|
    script.lines.each do |line|
      assignment = line.match(/^\s*\$([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/)
      if assignment
        aliases[assignment[1].downcase] = normalize_powershell_value(assignment[2], aliases)
        next
      end

      command = line.strip.match(/\A(?:Copy-Item|Move-Item)\b(.*)/i)
      next unless command

      arguments = command[1]
      named = arguments.match(/-Destination\s+("[^"]*"|'[^']*'|\$[A-Za-z_]\w*)/i)
      destination = if named
        named[1]
      else
        arguments.scan(/"[^"]*"|'[^']*'|\S+/).reject { |token| token.start_with?("-") }[1]
      end
      destinations << normalize_powershell_value(destination, aliases) if destination
    end
  end
  destinations
end

def approved_runtime_copy?(script)
  normalized = script.tr("\\", "/")
  src_bin_approved = false
  packaged_approved = false
  resources_bin_approved = false

  normalized.lines.each do |line|
    if line.match?(/^\s*\$srcBin\s*=/i)
      src_bin_approved = line.match?(/^\s*\$srcBin\s*=\s*Join-Path\s+\$env:BUILD_SOURCESDIRECTORY\s+["']ui\/desktop\/src\/bin["']\s*$/i)
    elsif line.match?(/^\s*\$packaged\s*=/i)
      packaged_approved = line.match?(/^\s*\$packaged\s*=\s*Join-Path\s+["']out["']\s+\(\s*&\s+node\s+-p\s+.*resolveWindowsPackage\(\s*process\.argv\[1\]\s*,[^)]*\)\.packagedDirName["']\s+\$env:ARTIFACT_ARCH\s*\)\s*$/i)
    elsif line.match?(/^\s*\$resourcesBin\s*=/i)
      resources_bin_approved = packaged_approved &&
        line.match?(/^\s*\$resourcesBin\s*=\s*Join-Path\s+\$packaged\s+["']resources\/bin["']\s*$/i)
    elsif line.match?(/^\s*Copy-Item\s+-Path\s+["']\$srcBin\/\*["']\s+-Destination\s+\$resourcesBin\s+-Recurse\s+-Force\s*$/i)
      return src_bin_approved && resources_bin_approved
    end
  end

  false
end

def approved_installer_validation?(script)
  validation = script.match(/if\s*\(\s*-not\s*\(Test-Path\s+\$installer\)\s*-or\s*\(Get-Item\s+\$installer\)\.Length\s+-eq\s+0\s*\)\s*\{(?<body>[^}]*)\}/mi)
  return false unless validation

  body = validation[:body]
  code, = analyze_powershell(body)
  expected = 'throw "Installer missing or empty: $installer"'
  body.lines.zip(code.lines).any? do |raw_line, code_line|
    raw_line.strip.casecmp?(expected) && code_line&.strip&.casecmp?(expected)
  end
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
architecture = azure.fetch("parameters", []).find { |parameter| parameter["name"] == "architecture" }
abort "Azure pipeline must expose a both/x32/x64 architecture parameter" unless architecture &&
  architecture["type"] == "string" &&
  architecture["default"] == "both" &&
  architecture["values"] == %w[both x32 x64]
azure_jobs = azure.fetch("jobs", [])
abort "Azure pipeline must define one shared matrix job" unless azure_jobs.length == 1 && azure_jobs.first["job"] == "build_windows"
azure_job = azure_jobs.first
expected_condition = "or(eq('${{ parameters.architecture }}', 'both'), eq(variables['ARTIFACT_ARCH'], '${{ parameters.architecture }}'))"
abort "Azure matrix job must skip unselected architectures" unless azure_job["condition"] == expected_condition
azure_strategy = azure_job.fetch("strategy", {})
abort "Azure matrix must be serial" unless azure_strategy["maxParallel"] == 1

azure_matrix = azure_strategy.fetch("matrix", {})
azure_matrix_legs = azure_matrix
abort "Azure matrix must define exactly x32 and x64" unless azure_matrix_legs.keys.sort == %w[x32 x64]

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
  actual = azure_matrix_legs.fetch(leg, {}).slice(*expected.keys)
  abort "Azure #{leg} matrix mapping is incorrect" unless actual == expected
end

azure_steps = azure_job.fetch("steps", [])
azure_powershell = azure_steps.each_with_object([]) do |step, scripts|
  scripts << step["powershell"] if step.is_a?(Hash) && step["powershell"]
end
abort "Azure PowerShell must use one executable statement per line" if azure_powershell.any? do |script|
  _, executable_semicolon = analyze_powershell(script)
  executable_semicolon
end

release_build = azure_powershell.find { |script| script.include?("cargo build") && script.include?("--release") }
abort "Azure pipeline must build the matrix Rust target in release mode" unless release_build &&
  release_build.include?("--target $env:RUST_TARGET") &&
  release_build.include?("--features $env:CARGO_FEATURES") &&
  release_build.include?('$env:CARGO_TARGET_I686_PC_WINDOWS_MSVC_LINKER = "lld-link"') &&
  release_build.include?('$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = "lld-link"') &&
  !release_build.include?("$env:RUSTFLAGS") &&
  release_build.include?('target\$env:RUST_TARGET\release\goose.exe') &&
  release_build.match?(/Copy-Item\s+\$binary\s+["']ui\\desktop\\src\\bin\\goose\.exe["']\s+-Force/i)

runtime_preparation = {
  cleanup: /Remove-Item\s+["']ui\\desktop\\src\\bin["']\s+-Recurse\s+-Force/i,
  recreate: /New-Item\s+-ItemType\s+Directory\s+-Force\s+["']ui\\desktop\\src\\bin["']\s*\|\s*Out-Null/i,
  inject: /Copy-Item\s+\$binary\s+["']ui\\desktop\\src\\bin\\goose\.exe["']\s+-Force/i,
  helper_copy: /Copy-Item\s+\$helper\.FullName\s+["']ui\\desktop\\src\\bin\\\$\(\$helper\.Name\)["']\s+-Force/i,
  goose_npm_copy: /Copy-Item\s+-Path\s+["']\$gooseNpmSource\\\*["']\s+-Destination\s+\$gooseNpmDestination\s+-Recurse\s+-Force/i,
}.transform_values { |pattern| release_build&.match(pattern)&.begin(0) }
runtime_order = runtime_preparation.values
approved_helper_filter = /^\s*\$authoredHelpers\s*=\s*Get-ChildItem\s+-Path\s+\$platformBin\s+-File\s*\|\s*Where-Object\s*\{\s*\$_\.Name\s+-ne\s+"goose\.exe"\s+-and\s+\$_\.Extension\s+-in\s+"\.exe"\s*,\s*"\.dll"\s*,\s*"\.cmd"\s*\}\s*$/i
abort "Azure release runtime preparation order is unsafe" unless runtime_order.none?(&:nil?) &&
  runtime_preparation.values_at(:cleanup, :recreate, :inject).each_cons(2).all? { |first, second| first < second } &&
  runtime_preparation.values_at(:helper_copy, :goose_npm_copy).all? { |helper| runtime_preparation[:inject] < helper } &&
  release_build.scan(/^\s*Copy-Item\b[^\r\n]*$/i).length == 3 &&
  release_build.match?(approved_helper_filter)

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
resolved_artifacts = azure_matrix_legs.values.map do |leg|
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

staged_payload_copy = powershell_copy_destinations(azure_powershell).any? do |destination|
  destination.include?("artifactstagingdirectory") ||
    destination.include?("$outputdir") ||
    destination.include?("aibuddy-windows-$env:artifact_arch-setup")
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
