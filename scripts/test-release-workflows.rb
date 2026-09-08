#!/usr/bin/env ruby

require "yaml"

release_workflow = File.read(".github/workflows/release.yml")
recovery_path = ".github/workflows/publish-existing-release.yml"

YAML.parse(release_workflow)

attestation_steps = release_workflow.scan(
  /- name: Attest(?: macOS update manifest| build provenance).*?(?=\n\s*- name:|\z)/m
)

abort "expected two attestation steps" unless attestation_steps.length == 2

attestation_steps.each do |step|
  unless step.include?("github.event.repository.owner.type == 'Organization'")
    abort "attestation must be limited to organization-owned repositories"
  end
end

abort "missing release recovery workflow" unless File.exist?(recovery_path)

recovery_workflow = File.read(recovery_path)
YAML.parse(recovery_workflow)
recovery_document = YAML.safe_load(recovery_workflow, aliases: true)

required_fragments = [
  "workflow_dispatch:",
  "release_tag:",
  "source_run_id:",
  "run-id: ${{ inputs.source_run_id }}",
  "pattern: '!internal-*'",
  "merge-multiple: true",
  "tag: ${{ inputs.release_tag }}",
]

required_fragments.each do |fragment|
  abort "recovery workflow missing #{fragment}" unless recovery_workflow.include?(fragment)
end

publish_step = recovery_document.fetch("jobs").fetch("publish").fetch("steps").find do |step|
  step["name"] == "Publish versioned release"
end
abort "recovery workflow missing release publish step" unless publish_step

release_artifacts = publish_step.fetch("with").fetch("artifacts").lines.map(&:strip)
required_artifacts = [
  "HeyBuddy*.zip",
  "HeyBuddy-windows-*-setup.exe",
]

required_artifacts.each do |artifact|
  abort "recovery workflow missing #{artifact}" unless release_artifacts.include?(artifact)
end

puts "release workflow contracts pass"
