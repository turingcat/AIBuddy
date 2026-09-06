#!/usr/bin/env ruby

require "yaml"
require "open3"

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
abort "Azure matrix must be serial" unless azure.dig("strategy", "maxParallel") == 1

[
  "i686-pc-windows-msvc",
  "x86_64-pc-windows-msvc",
  "ELECTRON_ARCH: ia32",
  "ELECTRON_ARCH: x64",
  "AIBuddy-windows-$(ARTIFACT_ARCH)-setup",
].each do |fragment|
  abort "Azure pipeline missing #{fragment}" unless azure_text.include?(fragment)
end

abort "Azure pipeline must not create portable ZIPs" if azure_text.include?("portableFileName") || azure_text.match?(/7z\s+a\s+-tzip/)
abort "Azure pipeline must not dispatch GitHub Actions" if azure_text.include?("gh workflow run") || azure_text.include?("workflow_dispatch")

release_branches = workflows.fetch(:release_branches)
abort "release candidate instructions missing AIBuddy.app" unless release_branches.include?("AIBuddy.app")

puts "release workflow contracts pass"
