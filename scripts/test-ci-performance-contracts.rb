#!/usr/bin/env ruby

require "minitest/autorun"
require "yaml"

class WorkflowPerformanceContractsTest < Minitest::Test
  WORKFLOW_DIRECTORY = ".github/workflows"
  PR_CONCURRENCY_GROUP = "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}"
  PR_TIER_CONDITION = "github.event_name != 'pull_request' || needs.changes.outputs.code == 'true'"

  def test_ci_and_mcp_conformance_cancel_superseded_pull_request_runs
    %w[ci.yml mcp-conformance.yml].each do |workflow_name|
      workflow = load_workflow(workflow_name)

      assert_equal PR_CONCURRENCY_GROUP, workflow.dig("concurrency", "group"), workflow_name
      assert_equal true, workflow.dig("concurrency", "cancel-in-progress"), workflow_name
    end
  end

  def test_performance_workflows_use_locked_rust_dependencies
    %w[ci.yml mcp-conformance.yml bundle-macos.yml bundle-windows.yml].each do |workflow_name|
      cargo_commands(workflow_name).each do |command|
        assert_includes command, "--locked", "#{workflow_name} command must lock dependencies: #{command}"
      end
    end
  end

  def test_pull_requests_only_run_code_dependent_ci_jobs_when_code_changes
    workflow = load_workflow("ci.yml")

    %w[rust-build-and-test goose-sdk-uniffi rust-build-and-test-tls rust-build-and-test-roaming rust-msrv rust-lint].each do |job_name|
      assert_equal PR_TIER_CONDITION, workflow.dig("jobs", job_name, "if"), job_name
    end
  end

  def test_mcp_conformance_uses_the_code_change_event_tier
    workflow = load_workflow("mcp-conformance.yml")

    %w[build conformance].each do |job_name|
      assert_equal PR_TIER_CONDITION, workflow.dig("jobs", job_name, "if"), job_name
    end
  end

  def test_rust_caches_are_scoped_to_their_workflow
    assert_rust_cache_key_prefix("ci.yml", "ci-")
    assert_rust_cache_key_prefix("mcp-conformance.yml", "mcp-conformance-")
    assert_rust_cache_key_prefix("bundle-macos.yml", "macos-")
    assert_rust_cache_key_prefix("bundle-windows.yml", "windows-")
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

  def cache_paths(workflow_name)
    load_workflow(workflow_name).fetch("jobs").values.flat_map do |job|
      job.fetch("steps", []).filter_map do |step|
        next unless step["uses"].to_s.start_with?("actions/cache@")

        step.dig("with", "path")
      end
    end.flat_map { |path| path.lines.map(&:strip) }.reject(&:empty?)
  end

  def assert_rust_cache_key_prefix(workflow_name, prefix)
    keys = load_workflow(workflow_name).fetch("jobs").values.flat_map do |job|
      job.fetch("steps", []).filter_map do |step|
        next unless step["uses"].to_s.start_with?("Swatinem/rust-cache@")

        step.dig("with", "key")
      end
    end

    refute_empty keys, "#{workflow_name} must define Rust cache keys"
    keys.each { |key| assert key.start_with?(prefix), "#{workflow_name} Rust cache key: #{key}" }
  end
end
