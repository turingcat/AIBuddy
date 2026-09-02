#!/usr/bin/env ruby

require "minitest/autorun"
require "yaml"

class WorkflowPerformanceContractsTest < Minitest::Test
  WORKFLOW_DIRECTORY = ".github/workflows"
  PR_CONCURRENCY_GROUP = "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}"

  def test_ci_and_mcp_conformance_cancel_superseded_pull_request_runs
    %w[ci.yml mcp-conformance.yml].each do |workflow_name|
      workflow = load_workflow(workflow_name)

      assert_equal PR_CONCURRENCY_GROUP, workflow.dig("concurrency", "group"), workflow_name
      assert_equal true, workflow.dig("concurrency", "cancel-in-progress"), workflow_name
    end
  end

  def test_direct_cargo_commands_use_locked_rust_dependencies
    %w[ci.yml bundle-macos.yml bundle-windows.yml].each do |workflow_name|
      cargo_commands(workflow_name).each do |command|
        assert_includes command, "--locked", "#{workflow_name} command must lock dependencies: #{command}"
      end
    end
  end

  def test_mcp_conformance_build_recipe_uses_locked_rust_dependencies
    build_commands = job_run_commands("mcp-conformance.yml", "build")

    assert build_commands.any? { |command| command.include?("just mcp-conformance-build") },
           "mcp-conformance.yml must invoke the mcp-conformance-build recipe"
    assert_includes just_recipe("mcp-conformance-build"), "cargo build --locked",
                    "mcp-conformance-build must lock Rust dependencies"
  end

  def test_pull_requests_only_run_code_dependent_ci_jobs_when_code_changes
    workflow = load_workflow("ci.yml")

    %w[rust-build-and-test goose-sdk-uniffi rust-build-and-test-tls rust-build-and-test-roaming rust-msrv rust-lint].each do |job_name|
      assert_code_change_event_tier(workflow, job_name)
    end
  end

  def test_mcp_conformance_uses_the_code_change_event_tier
    workflow = load_workflow("mcp-conformance.yml")

    %w[build conformance].each do |job_name|
      assert_code_change_event_tier(workflow, job_name)
    end
  end

  def test_rust_caches_are_scoped_to_their_workflow
    %w[ci.yml mcp-conformance.yml bundle-macos.yml bundle-windows.yml].each do |workflow_name|
      assert_rust_cache_keys_are_isolated(workflow_name)
    end
  end

  def test_desktop_builds_cache_the_pnpm_store_without_node_modules
    %w[bundle-macos.yml bundle-windows.yml].each do |workflow_name|
      cache_paths(workflow_name).each do |path|
        refute_match(%r{(^|/)node_modules($|/)}, path, "#{workflow_name} must not cache node_modules")
      end

      assert cache_paths(workflow_name).any? { |path| path.match?(%r{pnpm.*store|store.*pnpm}i) },
             "#{workflow_name} must cache the pnpm store"
    end
  end

  def test_desktop_builds_cache_electron_artifacts
    %w[bundle-macos.yml bundle-windows.yml].each do |workflow_name|
      assert cache_paths(workflow_name).any? { |path| path.match?(/electron/i) },
             "#{workflow_name} must cache Electron artifacts"
    end
  end

  def test_release_workflows_retain_macos_arm64_and_windows_x64_targets
    macos_workflow = load_workflow("bundle-macos.yml")
    windows_commands = cargo_commands("bundle-windows.yml")

    assert_equal "aarch64-apple-darwin", macos_workflow.dig("env", "MACOS_TARGET"),
                 "bundle-macos.yml must retain the macOS ARM64 release target"
    assert cargo_commands("bundle-macos.yml").any? { |command| command.include?("--target \"$MACOS_TARGET\"") },
           "bundle-macos.yml must build with the macOS ARM64 release target"
    assert windows_commands.any? { |command| command.include?("--target x86_64-pc-windows-msvc") },
           "bundle-windows.yml must retain the Windows x64 release target"
  end

  private

  def load_workflow(workflow_name)
    YAML.safe_load(workflow_text(workflow_name), aliases: true)
  end

  def workflow_text(workflow_name)
    File.read(File.join(WORKFLOW_DIRECTORY, workflow_name))
  end

  def cargo_commands(workflow_name)
    workflow_text(workflow_name).lines.filter_map do |line|
      command = line.strip
      command if command.match?(/\bcargo\s+(build|check|test|fetch)\b/)
    end
  end

  def job_run_commands(workflow_name, job_name)
    load_workflow(workflow_name).dig("jobs", job_name, "steps").filter_map { |step| step["run"] }
  end

  def just_recipe(recipe_name)
    pattern = /^#{Regexp.escape(recipe_name)}:.*?(?=^\S.*?:|\z)/m
    justfile = File.read("justfile")

    assert_match pattern, justfile, "justfile must define #{recipe_name}"
    justfile.match(pattern)[0]
  end

  def assert_code_change_event_tier(workflow, job_name)
    job = workflow.fetch("jobs").fetch(job_name)
    condition = job.fetch("if")

    assert_includes Array(job["needs"]), "changes", "#{job_name} must depend on changes"
    assert_includes condition, "github.event_name != 'pull_request'", job_name
    assert_includes condition, "needs.changes.outputs.code == 'true'", job_name
    assert_includes condition, "||", "#{job_name} must run for non-PR events or code changes"
  end

  def cache_paths(workflow_name)
    load_workflow(workflow_name).fetch("jobs").values.flat_map do |job|
      job.fetch("steps", []).filter_map do |step|
        next unless step["uses"].to_s.start_with?("actions/cache@")

        step.dig("with", "path")
      end
    end.flat_map { |path| path.lines.map(&:strip) }.reject(&:empty?)
  end

  def assert_rust_cache_keys_are_isolated(workflow_name)
    entries = load_workflow(workflow_name).fetch("jobs").flat_map do |job_name, job|
      job.fetch("steps", []).filter_map do |step|
        next unless step["uses"].to_s.start_with?("Swatinem/rust-cache@")

        [job_name, step.dig("with", "key")]
      end
    end

    refute_empty entries, "#{workflow_name} must define Rust cache keys"
    entries.each { |job_name, key| refute_empty key.to_s.strip, "#{workflow_name} #{job_name} Rust cache key" }
    assert_equal entries.length, entries.map(&:last).uniq.length,
                 "#{workflow_name} Rust cache keys must be isolated"
  end
end
