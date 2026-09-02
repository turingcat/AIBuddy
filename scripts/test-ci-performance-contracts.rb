#!/usr/bin/env ruby

require "minitest/autorun"
require "yaml"

class WorkflowPerformanceContractsTest < Minitest::Test
  WORKFLOW_DIRECTORY = ".github/workflows"
  PR_CONCURRENCY_GROUP = "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}"
  CI_CONCURRENCY_GROUP = "${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}"
  CI_REQUIRED_CHECK_NAMES = {
    "rust-format" => "Check Rust Code Format",
    "rust-build-and-test" => "Build and Test Rust Project",
    "goose-sdk-uniffi" => "Check goose-sdk UniFFI",
    "rust-build-and-test-tls" => "Build and Test TLS Backend (${{ matrix.tls-feature }})",
    "rust-build-and-test-roaming" => "Build and Test Roaming Feature",
    "rust-build-windows" => "Build Rust Project on Windows",
    "rust-msrv" => "Check MSRV",
    "rust-lint" => "Lint Rust Code",
    "schema-check" => "Check Generated Schemas are Up-to-Date",
    "desktop-lint" => "Test and Lint Electron Desktop App",
  }.freeze
  CODE_PULL_REQUEST_REQUIRED_JOBS = %w[
    rust-format
    rust-build-and-test
    rust-build-and-test-tls
    rust-lint
    schema-check
    desktop-lint
  ].freeze

  RUST_CACHE_IDENTITIES = {
    "ci.yml" => {
      "rust-build-and-test" => "ci-default-tests",
      "goose-sdk-uniffi" => "ci-uniffi",
      "rust-build-and-test-tls" => "ci-tls-${{ matrix.tls-feature }}",
      "rust-build-and-test-roaming" => "ci-roaming",
      "rust-build-windows" => "ci-windows-x86_64-pc-windows-msvc",
      "rust-msrv" => "ci-msrv-${{ steps.msrv.outputs.msrv }}",
      "rust-lint" => "ci-clippy-rustup",
    },
  }.freeze

  def test_ci_isolates_pull_request_push_and_merge_group_concurrency
    workflow = load_workflow("ci.yml")

    assert_equal CI_CONCURRENCY_GROUP, workflow.dig("concurrency", "group")
    assert_equal "${{ github.event_name == 'pull_request' }}", workflow.dig("concurrency", "cancel-in-progress")
  end

  def test_mcp_conformance_cancels_superseded_pull_request_runs
    workflow = load_workflow("mcp-conformance.yml")

    assert_equal PR_CONCURRENCY_GROUP, workflow.dig("concurrency", "group")
    assert_equal true, workflow.dig("concurrency", "cancel-in-progress")
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

  def test_ci_changes_reports_code_and_docs_only_state_for_every_ci_event
    workflow = load_workflow("ci.yml")
    changes = workflow.fetch("jobs").fetch("changes")
    filter = changes.fetch("steps").find { |step| step["id"] == "filter" }

    %w[push pull_request merge_group workflow_dispatch].each do |event_name|
      assert_match(/^  #{event_name}:/, workflow_text("ci.yml"), "ci.yml must handle #{event_name} events")
    end
    assert_equal "${{ steps.filter.outputs.docs-only }}", changes.dig("outputs", "docs-only")
    assert_equal "${{ steps.filter.outputs.code }}", changes.dig("outputs", "code")
    assert_includes filter.dig("with", "filters"), "docs-only:"
    assert_includes filter.dig("with", "filters"), "code:"
    assert_includes filter.dig("with", "filters"), "!documentation/**"
  end

  def test_dependency_locks_skip_docs_only_pull_requests_without_compiling
    workflow = load_workflow("ci.yml")
    job = workflow.fetch("jobs").fetch("dependency-locks")
    commands = job_run_commands("ci.yml", "dependency-locks").join("\n")
    pnpm_step = job.fetch("steps").find { |step| step["name"] == "Validate pnpm lockfiles" }

    assert_code_change_event_tier(workflow, "dependency-locks", requires_dependency_locks: false)
    assert_includes commands, "cargo metadata --locked --format-version 1 --no-deps"
    assert_equal "ui", pnpm_step.fetch("working-directory")
    assert_includes pnpm_step.fetch("run"), "pnpm install --lockfile-only --frozen-lockfile --ignore-scripts"
    assert_equal 1, commands.scan("pnpm install").length, "pnpm lock validation must run once from the UI workspace root"
    refute_match(/cargo\s+(build|check|test)\b/, commands)
  end

  def test_pull_requests_only_run_standard_ci_jobs_when_code_changes
    workflow = load_workflow("ci.yml")

    CODE_PULL_REQUEST_REQUIRED_JOBS.each do |job_name|
      assert_code_change_event_tier(workflow, job_name)
    end
  end

  def test_code_pull_request_required_jobs_fail_explicitly_when_lock_validation_fails
    workflow = load_workflow("ci.yml")

    CODE_PULL_REQUEST_REQUIRED_JOBS.each do |job_name|
      job = workflow.fetch("jobs").fetch(job_name)

      assert_includes job.fetch("if"), "always()", "#{job_name} must evaluate when dependency-locks fails"
      assert_dependency_lock_failure_guard(job, job_name)
    end
  end

  def test_compatibility_jobs_run_only_for_complete_non_pull_request_coverage
    workflow = load_workflow("ci.yml")

    %w[goose-sdk-uniffi rust-build-and-test-roaming rust-build-windows rust-msrv].each do |job_name|
      assert_non_pull_request_event_tier(workflow, job_name)
    end
  end

  def test_tls_matrix_uses_one_backend_for_pull_requests_and_both_otherwise
    matrix = load_workflow("ci.yml").dig("jobs", "rust-build-and-test-tls", "strategy", "matrix", "tls-feature")

    assert_includes matrix, "github.event_name == 'pull_request'"
    assert_includes matrix, '"rustls-tls"'
    assert_includes matrix, '"native-tls"'
  end

  def test_ci_required_check_names_remain_stable
    jobs = load_workflow("ci.yml").fetch("jobs")

    CI_REQUIRED_CHECK_NAMES.each do |job_name, check_name|
      assert_equal check_name, jobs.fetch(job_name).fetch("name")
    end
  end

  def test_mcp_conformance_uses_the_code_change_event_tier
    workflow = load_workflow("mcp-conformance.yml")

    %w[build conformance].each do |job_name|
      assert_code_change_event_tier(workflow, job_name, requires_dependency_locks: false)
    end
  end

  def test_rust_caches_are_isolated_across_all_performance_workflows
    entries = rust_cache_entries

    refute_empty entries, "performance workflows must define Rust cache keys"
    entries.each do |entry|
      refute_empty entry[:key].to_s.strip, "#{entry[:workflow]} #{entry[:job]} Rust cache key"
    end
    assert_equal entries.length, entries.map { |entry| entry[:key] }.uniq.length,
                 "Rust cache keys must be unique across performance workflows"

    assert_semantic_rust_cache_contexts(entries)
  end

  def test_ci_rust_caches_use_distinct_identities_and_save_only_successful_main_builds
    expected_caches = RUST_CACHE_IDENTITIES.flat_map do |workflow_name, jobs|
      workflow = load_workflow(workflow_name)

      jobs.map do |job_name, key|
        job = workflow.fetch("jobs").fetch(job_name)
        cache = job.fetch("steps").find do |step|
          step["uses"].to_s.start_with?("Swatinem/rust-cache@")
        end

        refute_nil cache, "#{workflow_name} #{job_name} must restore a Rust cache"
        assert_equal key, cache.dig("with", "key"), "#{workflow_name} #{job_name} cache identity changed"
        assert_equal "${{ github.ref == 'refs/heads/main' && job.status == 'success' }}", cache.dig("with", "save-if"),
                     "#{workflow_name} #{job_name} must not upload failed or pull request builds"

        [workflow_name, job_name, cache.dig("with", "key")]
      end
    end

    assert_equal expected_caches.length, expected_caches.map(&:last).uniq.length,
                 "CI Rust jobs must not share target artifact caches"
  end

  def test_smoke_build_cache_saves_only_for_the_checked_out_main_input
    workflow = load_workflow("pr-smoke-test.yml")
    job = workflow.fetch("jobs").fetch("build-binary")
    checkout = job.fetch("steps").find do |step|
      step["uses"].to_s.start_with?("actions/checkout@")
    end
    cache = job.fetch("steps").find do |step|
      step["uses"].to_s.start_with?("Swatinem/rust-cache@")
    end

    refute_nil checkout, "smoke build must check out the selected branch"
    assert_equal "${{ github.event.inputs.branch || github.ref }}", checkout.dig("with", "ref"),
                 "smoke build checkout must be controlled by the dispatch branch input"
    assert_includes workflow_text("pr-smoke-test.yml"), "default: \"main\"",
                    "smoke build dispatch input must default to main"
    refute_nil cache, "smoke build must restore a Rust cache"
    assert_equal "pr-smoke-build", cache.dig("with", "key")
    assert_equal "${{ github.event.inputs.branch == 'main' && job.status == 'success' }}", cache.dig("with", "save-if"),
                 "smoke build cache writes must follow the checked out branch input"
  end

  def test_v8_marker_repair_runs_after_cache_restore_and_before_builds
    workflow = load_workflow("ci.yml")

    %w[rust-build-and-test rust-msrv rust-lint].each do |job_name|
      steps = workflow.fetch("jobs").fetch(job_name).fetch("steps")
      cache_index = steps.index { |step| step["uses"].to_s.start_with?("Swatinem/rust-cache@") }
      repair_index = steps.index { |step| step["run"] == ".github/scripts/repair-v8-prebuilt.sh" }
      build_index = steps.index { |step| step["run"].to_s.match?(/\bcargo\s+(build|check|test|clippy)\b/) }

      refute_nil cache_index, "#{job_name} must restore target artifacts before repair"
      refute_nil repair_index, "#{job_name} must repair stale V8 markers"
      refute_nil build_index, "#{job_name} must run a Rust build command"
      assert_operator cache_index, :<, repair_index, "#{job_name} must repair restored target artifacts"
      assert_operator repair_index, :<, build_index, "#{job_name} must repair V8 before building"
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

  def assert_code_change_event_tier(workflow, job_name, requires_dependency_locks: true)
    job = workflow.fetch("jobs").fetch(job_name)
    condition = job.fetch("if")

    assert_includes Array(job["needs"]), "changes", "#{job_name} must depend on changes"
    if requires_dependency_locks
      assert_includes Array(job["needs"]), "dependency-locks", "#{job_name} must depend on dependency-locks"
      assert_includes condition, "always()", "#{job_name} must evaluate after dependency-locks fails"
      assert_dependency_lock_failure_guard(job, job_name)
    end
    assert_includes condition, "github.event_name != 'pull_request'", job_name
    assert_includes condition, "needs.changes.outputs.code == 'true'", job_name
    assert_includes condition, "||", "#{job_name} must run for non-PR events or code changes"
  end

  def assert_non_pull_request_event_tier(workflow, job_name)
    job = workflow.fetch("jobs").fetch(job_name)
    condition = job.fetch("if")

    assert_includes Array(job["needs"]), "changes", "#{job_name} must depend on changes"
    assert_includes Array(job["needs"]), "dependency-locks", "#{job_name} must depend on dependency-locks"
    assert_includes condition, "always()", "#{job_name} must evaluate after dependency-locks fails"
    assert_includes condition, "github.event_name != 'pull_request'", "#{job_name} must retain full non-PR coverage"
    assert_dependency_lock_failure_guard(job, job_name)
  end

  def assert_dependency_lock_failure_guard(job, job_name)
    guard = job.fetch("steps").first

    assert_equal "Fail when dependency lock validation fails", guard.fetch("name"), "#{job_name} must check dependency locks before expensive steps"
    assert_equal "needs.dependency-locks.result != 'success'", guard.fetch("if"), "#{job_name} must fail when dependency-locks fails"
    assert_equal "exit 1", guard.fetch("run"), "#{job_name} must fail explicitly when dependency-locks fails"
  end

  def cache_paths(workflow_name)
    load_workflow(workflow_name).fetch("jobs").values.flat_map do |job|
      job.fetch("steps", []).filter_map do |step|
        next unless step["uses"].to_s.start_with?("actions/cache@")

        step.dig("with", "path")
      end
    end.flat_map { |path| path.lines.map(&:strip) }.reject(&:empty?)
  end

  def rust_cache_entries
    %w[ci.yml mcp-conformance.yml bundle-macos.yml bundle-windows.yml].flat_map do |workflow_name|
      workflow = load_workflow(workflow_name)

      workflow.fetch("jobs").flat_map do |job_name, job|
        job.fetch("steps", []).filter_map do |step|
          next unless step["uses"].to_s.start_with?("Swatinem/rust-cache@")

          {
            workflow: workflow_name,
            job: job_name,
            job_definition: job,
            key: step.dig("with", "key"),
          }
        end
      end
    end
  end

  def assert_semantic_rust_cache_contexts(entries)
    assert_cache_context(entries, :standard, /standard/i)
    assert_cache_context(entries, :msrv, /msrv/i)
    assert_cache_context(entries, :target, /aarch64-apple-darwin|x86_64-pc-windows-msvc|MACOS_TARGET/)
    assert_cache_context(entries, :cuda, /inputs\.windows_variant/)
  end

  def assert_cache_context(entries, context, pattern)
    context_entries = entries.select { |entry| cache_context?(entry, context) }

    refute_empty context_entries, "Rust cache must cover the #{context} compiler context"
    context_entries.each do |entry|
      assert entry[:key].to_s.match?(pattern),
             "#{entry[:workflow]} #{entry[:job]} Rust cache key must include #{pattern.inspect} for #{context}"
    end
  end

  def cache_context?(entry, context)
    job = job_yaml(entry)

    case context
    when :standard
      default_rust_toolchain?(entry) && cargo_build_or_test?(job) && !msrv_job?(job) && !target_job?(job) && !cuda_job?(job)
    when :msrv
      msrv_job?(job)
    when :target
      target_job?(job)
    when :cuda
      cuda_job?(job)
    end
  end

  def default_rust_toolchain?(entry)
    entry[:job_definition].fetch("steps", []).any? do |step|
      step["uses"].to_s.start_with?("actions-rust-lang/setup-rust-toolchain@") && step.dig("with", "toolchain").to_s.empty?
    end
  end

  def cargo_build_or_test?(job)
    job.match?(/\bcargo\s+(build|test)\b/)
  end

  def msrv_job?(job)
    job.match?(/rust-version/) && job.match?(/toolchain:.*steps\./m)
  end

  def target_job?(job)
    job.match?(/rustup target add|--target/) && job.match?(/aarch64-apple-darwin|x86_64-pc-windows-msvc|MACOS_TARGET/)
  end

  def cuda_job?(job)
    job.match?(/cuda-toolkit|--features cuda|windows_variant.*cuda/i)
  end

  def job_yaml(entry)
    YAML.dump(entry[:job_definition])
  end
end
