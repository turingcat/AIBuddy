#!/usr/bin/env ruby

require "minitest/autorun"
require "yaml"

class WorkflowPerformanceContractsTest < Minitest::Test
  WORKFLOW_DIRECTORY = ".github/workflows"
  JUSTFILE = "Justfile"
  PR_CONCURRENCY_GROUP = "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}"
  CI_CONCURRENCY_GROUP = "ci-${{ github.event.pull_request.number || github.ref }}"
  MCP_CONCURRENCY_GROUP = "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}"
  BUNDLE_CONCURRENCY_GROUPS = {
    "bundle-macos.yml" => "bundle-macos-${{ inputs.ref || github.ref }}",
    "bundle-windows.yml" => "bundle-windows-${{ inputs.ref || github.ref }}",
  }.freeze
  MCP_CONFORMANCE_MATRIX = [
    {
      "spec-version" => "2025-11-25",
      "conformance-version" => "0.1.16",
      "baseline" => "crates/goose-cli/tests/mcp-conformance/expected-failures-2025-11-25-0.1.16.yaml",
    },
    {
      "spec-version" => "2025-11-25",
      "conformance-version" => "0.2.0-alpha.10",
      "baseline" => "crates/goose-cli/tests/mcp-conformance/expected-failures-2025-11-25-0.2.0-alpha.10.yaml",
    },
    {
      "spec-version" => "2026-07-28",
      "conformance-version" => "0.2.0-alpha.10",
      "baseline" => "crates/goose-cli/tests/mcp-conformance/expected-failures-2026-07-28-0.2.0-alpha.10.yaml",
    },
  ].freeze
  CI_REQUIRED_CHECK_NAMES = {
    "rust-format" => "Check Rust Code Format",
    "rust-build-and-test" => "Build and Test Rust Project",
    "rust-compatibility" => "Check Rust Compatibility Features",
    "rust-build-and-test-tls" => "Build and Test TLS Backends",
    "rust-build-windows" => "Build Rust Project on Windows",
    "rust-msrv" => "Check MSRV",
    "rust-lint" => "Lint Rust Code",
    "schema-check" => "Check Generated Schemas are Up-to-Date",
    "desktop-lint" => "Test and Lint Electron Desktop App",
    "ci-gate" => "CI Gate",
  }.freeze
  CODE_PULL_REQUEST_REQUIRED_JOBS = %w[
    rust-format
    rust-build-and-test
    rust-build-and-test-tls
    rust-lint
  ].freeze

  RUST_CACHE_IDENTITIES = {
    "ci.yml" => {
      "rust-build-and-test" => "ci-default-tests",
      "rust-compatibility" => "ci-compatibility",
      "rust-build-and-test-tls" => "ci-tls",
      "rust-build-windows" => "ci-windows-x86_64-pc-windows-msvc",
      "rust-msrv" => "ci-msrv-${{ steps.msrv.outputs.msrv }}",
      "rust-lint" => "ci-clippy-rustup",
      "schema-check" => "ci-schema",
    },
    "pr-smoke-test.yml" => {
      "build-binary" => "pr-smoke-build",
    },
    "model-toolcall-conformance.yml" => {
      "openrouter-toolcalls" => "model-toolcall-conformance",
    },
  }.freeze
  RUST_CACHE_SAVE_POLICIES = {
    "ci.yml" => "${{ github.ref == 'refs/heads/main' && job.status == 'success' }}",
    "pr-smoke-test.yml" => "${{ env.BUILD_REF == 'main' && job.status == 'success' }}",
    "model-toolcall-conformance.yml" => "${{ github.ref == 'refs/heads/main' && job.status == 'success' }}",
  }.freeze
  DOCUMENTATION_PATHS = ["documentation/**", "docs/**", "*.md"].freeze
  CODE_PATHS = DOCUMENTATION_PATHS.map { |path| "!#{path}" }.freeze
  CI_CHANGE_FILTERS = {
    "rust" => [
      "Cargo.toml",
      "Cargo.lock",
      "rust-toolchain.toml",
      ".cargo/**",
      "clippy.toml",
      "crates/**",
    ],
    "desktop" => [
      "ui/**",
    ],
    "schema" => [
      "Cargo.toml",
      "Cargo.lock",
      "rust-toolchain.toml",
      ".cargo/**",
      "crates/goose/**",
      "crates/goose-acp-macros/**",
      "ui/sdk/**",
      "ui/package.json",
      "ui/pnpm-lock.yaml",
      "ui/pnpm-workspace.yaml",
      "Justfile",
    ],
    "windows" => [
      "Cargo.toml",
      "Cargo.lock",
      "rust-toolchain.toml",
      ".cargo/**",
      "crates/**",
    ],
    "workflow-config" => [
      ".github/actions/**",
      ".github/scripts/**",
      ".github/workflows/**",
      "scripts/test-ci-performance-contracts.rb",
      "bin/**",
      "Justfile",
    ],
  }.freeze
  CI_ALWAYS_REQUIRED_JOBS = %w[changes gdk-api-docs-check].freeze
  CI_FAST_JOBS = CODE_PULL_REQUEST_REQUIRED_JOBS
  CI_CODE_TIER_JOBS = ["dependency-locks", *CI_FAST_JOBS, "schema-check", "desktop-lint"].freeze
  CI_COMPATIBILITY_JOBS = %w[
    rust-compatibility
    rust-build-windows
    rust-msrv
  ].freeze
  CI_GATE_NEEDS = [*CI_ALWAYS_REQUIRED_JOBS, *CI_CODE_TIER_JOBS, *CI_COMPATIBILITY_JOBS].freeze
  CI_DEPENDENCY_TIER_IF = "cancelled() == false && (needs.changes.result != 'success' || github.event_name == 'workflow_dispatch' || needs.changes.outputs.rust == 'true' || needs.changes.outputs.desktop == 'true' || needs.changes.outputs.schema == 'true' || needs.changes.outputs.windows == 'true' || needs.changes.outputs.workflow-config == 'true')"
  CI_RUST_TIER_IF = "cancelled() == false && (needs.changes.result != 'success' || github.event_name == 'workflow_dispatch' || needs.changes.outputs.rust == 'true' || needs.changes.outputs.workflow-config == 'true')"
  CI_DESKTOP_TIER_IF = "cancelled() == false && (needs.changes.result != 'success' || github.event_name == 'workflow_dispatch' || needs.changes.outputs.desktop == 'true' || needs.changes.outputs.workflow-config == 'true')"
  CI_SCHEMA_TIER_IF = "cancelled() == false && (needs.changes.result != 'success' || github.event_name == 'workflow_dispatch' || needs.changes.outputs.schema == 'true' || needs.changes.outputs.workflow-config == 'true')"
  CI_RUST_COMPATIBILITY_TIER_IF = "cancelled() == false && (github.event_name == 'workflow_dispatch' || (github.event_name != 'pull_request' && (needs.changes.result != 'success' || needs.changes.outputs.rust == 'true' || needs.changes.outputs.workflow-config == 'true')))"
  CI_WINDOWS_TIER_IF = "cancelled() == false && (github.event_name == 'workflow_dispatch' || (github.event_name != 'pull_request' && (needs.changes.result != 'success' || needs.changes.outputs.windows == 'true' || needs.changes.outputs.workflow-config == 'true')))"
  MCP_SELECTED_TIER_IF = "cancelled() == false && (needs.changes.result != 'success' || github.event_name == 'workflow_dispatch' || needs.changes.outputs.code == 'true')"
  CI_EVENT_TIER_TRUTH_TABLE = [
    { event: "pull_request", selected: true, fast: "success", compatibility: "skipped" },
    { event: "pull_request", selected: false, fast: "skipped", compatibility: "skipped" },
    { event: "push", selected: true, fast: "success", compatibility: "success" },
    { event: "push", selected: false, fast: "skipped", compatibility: "skipped" },
    { event: "merge_group", selected: true, fast: "success", compatibility: "success" },
    { event: "merge_group", selected: false, fast: "skipped", compatibility: "skipped" },
    { event: "workflow_dispatch", selected: false, fast: "success", compatibility: "success" },
  ].freeze
  MCP_EVENT_TIER_TRUTH_TABLE = [
    { event: "pull_request", code: true, selected: true },
    { event: "pull_request", code: false, selected: false },
    { event: "push", code: true, selected: true },
    { event: "push", code: false, selected: false },
    { event: "merge_group", code: true, selected: true },
    { event: "merge_group", code: false, selected: false },
    { event: "workflow_dispatch", code: false, selected: true },
  ].freeze
  SMOKE_BUILD_REF = "${{ github.event.inputs.branch == 'refs/heads/main' && 'main' || github.event.inputs.branch || github.ref_name }}"

  def test_ci_isolates_pull_request_push_and_merge_group_concurrency
    workflow = load_workflow("ci.yml")

    assert_equal CI_CONCURRENCY_GROUP, workflow.dig("concurrency", "group")
    assert_equal true, workflow.dig("concurrency", "cancel-in-progress")
  end

  def test_ci_cancels_superseded_runs_for_the_same_source
    workflow = load_workflow("ci.yml")

    assert_equal CI_CONCURRENCY_GROUP, workflow.dig("concurrency", "group")
    assert_equal true, workflow.dig("concurrency", "cancel-in-progress")
  end

  def test_bundle_workflows_cancel_only_the_same_platform_and_source
    BUNDLE_CONCURRENCY_GROUPS.each do |workflow_name, expected_group|
      workflow = load_workflow(workflow_name)

      assert_equal expected_group, workflow.dig("concurrency", "group")
      assert_equal true, workflow.dig("concurrency", "cancel-in-progress")
    end
  end

  def test_windows_bundle_is_standard_only
    workflow = load_workflow("bundle-windows.yml")
    text = workflow_text("bundle-windows.yml")
    architectures = workflow.dig("jobs", "build-goose-windows", "strategy", "matrix", "include")

    assert_equal "windows-latest", workflow.dig("jobs", "build-goose-windows", "runs-on")
    assert_equal "ubuntu-latest", workflow.dig("jobs", "package-cli-windows", "runs-on")
    assert_equal "windows-latest", workflow.dig("jobs", "build-desktop-windows", "runs-on")
    assert_equal "windows-latest", workflow.dig("jobs", "package-desktop-windows", "runs-on")
    refute_match(/windows_variant/i, text)
    refute_match(/cuda/i, text)
    assert_equal [
      {
        "name" => "x32",
        "electron_arch" => "ia32",
        "rust_target" => "i686-pc-windows-msvc",
        "cargo_features" => "aws-providers,nostr,otel,rustls-tls,system-keyring",
      },
      {
        "name" => "x64",
        "electron_arch" => "x64",
        "rust_target" => "x86_64-pc-windows-msvc",
        "cargo_features" => "code-mode,aws-providers,nostr,otel,rustls-tls,system-keyring,update",
      },
    ], architectures
    assert_includes text, "cargo build --release --target $env:RUST_TARGET"
    assert_includes text, '--no-default-features'
    assert_includes text, '$env:CARGO_FEATURES'
    refute_includes architectures.first.fetch("cargo_features"), "code-mode"
    refute_includes architectures.first.fetch("cargo_features"), "local-inference"
    refute_includes architectures.first.fetch("cargo_features"), "update"
    assert_includes architectures.last.fetch("cargo_features"), "code-mode"
    refute_includes architectures.last.fetch("cargo_features"), "local-inference"
    assert_includes architectures.last.fetch("cargo_features"), "update"
  end

  def test_windows_desktop_bundle_uses_package_command
    commands = job_run_commands("bundle-windows.yml", "build-desktop-windows")

    assert commands.any? { |command| command.include?("pnpm run package:windows") },
           "Windows desktop bundle must use the package script"
    refute commands.any? { |command| command.include?("pnpm run make") },
           "Windows desktop bundle must not invoke Electron Forge makers"
  end

  def test_mcp_conformance_cancels_superseded_runs_for_the_same_source
    workflow = load_workflow("mcp-conformance.yml")

    assert_equal MCP_CONCURRENCY_GROUP, workflow.dig("concurrency", "group")
    assert_equal true, workflow.dig("concurrency", "cancel-in-progress")
  end

  def test_mcp_conformance_uses_changes_job_instead_of_top_level_path_filters
    workflow = load_workflow("mcp-conformance.yml")
    changes = workflow.fetch("jobs").fetch("changes")
    filter = changes.fetch("steps").find { |step| step["id"] == "filter" }

    %w[push pull_request merge_group workflow_dispatch].each do |event_name|
      assert_match(/^  #{event_name}:/, workflow_text("mcp-conformance.yml"),
                   "mcp-conformance.yml must handle #{event_name} events")
    end
    refute_match(/^\s+paths(?:-ignore)?:/, workflow_text("mcp-conformance.yml"),
                 "mcp-conformance.yml must create required checks for every pull request")
    assert_equal({ "contents" => "read", "pull-requests" => "read" }, changes.fetch("permissions"))
    refute workflow.key?("permissions")
    %w[build conformance].each do |job_name|
      refute workflow.fetch("jobs").fetch(job_name).key?("permissions")
    end
    assert_equal "${{ steps.filter.outputs.code }}", changes.dig("outputs", "code")
    assert_documentation_filter(filter, include_docs_only: false)
  end

  def test_mcp_conformance_has_no_scheduled_trigger
    triggers = load_workflow("mcp-conformance.yml").fetch(true)

    refute triggers.key?("schedule")
  end

  def test_mcp_conformance_event_tier_and_failure_propagation
    workflow = load_workflow("mcp-conformance.yml")
    build = workflow.fetch("jobs").fetch("build")
    conformance = workflow.fetch("jobs").fetch("conformance")

    assert_equal MCP_SELECTED_TIER_IF, build.fetch("if")
    assert_equal MCP_SELECTED_TIER_IF, conformance.fetch("if")
    assert_change_detection_failure_guard(build, "build")

    guard = conformance.fetch("steps").first
    assert_equal "Fail when prerequisites fail", guard.fetch("name")
    assert_equal "needs.changes.result != 'success' || needs.build.result != 'success'", guard.fetch("if")
    assert_equal "exit 1", guard.fetch("run")

    MCP_EVENT_TIER_TRUTH_TABLE.each do |row|
      assert_equal row[:selected], mcp_tier_selected?(row[:event], row[:code]),
        "MCP tier mismatch for #{row[:event]} with code=#{row[:code]}"
    end
  end

  def test_mcp_conformance_preserves_the_existing_specification_matrix
    workflow = load_workflow("mcp-conformance.yml")

    assert_equal MCP_CONFORMANCE_MATRIX,
                 workflow.dig("jobs", "conformance", "strategy", "matrix", "include")
  end

  def test_mcp_conformance_matrix_jobs_download_the_build_artifact
    workflow = load_workflow("mcp-conformance.yml")
    build_steps = workflow.fetch("jobs").fetch("build").fetch("steps")
    conformance_steps = workflow.fetch("jobs").fetch("conformance").fetch("steps")
    upload = build_steps.find { |step| step["uses"].to_s.start_with?("actions/upload-artifact@") }
    downloads = conformance_steps.select { |step| step["uses"].to_s.start_with?("actions/download-artifact@") }

    refute_nil upload
    assert_equal 1, downloads.length
    downloads.each do |download|
      assert_equal upload.dig("with", "name"), download.dig("with", "name")
    end
  end

  def test_direct_cargo_commands_use_locked_rust_dependencies
    %w[ci.yml pr-smoke-test.yml model-toolcall-conformance.yml].each do |workflow_name|
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

  def test_ci_changes_reports_granular_categories_for_every_ci_event
    workflow = load_workflow("ci.yml")
    changes = workflow.fetch("jobs").fetch("changes")
    filter = changes.fetch("steps").find { |step| step["id"] == "filter" }
    filters = YAML.safe_load(filter.dig("with", "filters"), aliases: true)

    %w[push pull_request merge_group workflow_dispatch].each do |event_name|
      assert_match(/^  #{event_name}:/, workflow_text("ci.yml"), "ci.yml must handle #{event_name} events")
    end
    assert_equal "${{ steps.filter.outputs.docs-only }}", changes.dig("outputs", "docs-only")
    assert_equal "${{ steps.filter.outputs.code }}", changes.dig("outputs", "code")
    CI_CHANGE_FILTERS.each do |category, expected_paths|
      assert_equal "${{ steps.filter.outputs.#{category} }}", changes.dig("outputs", category)
      assert_equal expected_paths, filters.fetch(category), "#{category} paths changed"
    end
    assert_documentation_filter(filter, include_docs_only: true)
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

  def test_rust_jobs_run_only_when_rust_or_workflow_configuration_changes
    workflow = load_workflow("ci.yml")

    CODE_PULL_REQUEST_REQUIRED_JOBS.each do |job_name|
      assert_category_event_tier(workflow, job_name, CI_RUST_TIER_IF)
    end
  end

  def test_desktop_and_schema_jobs_use_their_own_change_categories
    workflow = load_workflow("ci.yml")

    assert_category_event_tier(workflow, "desktop-lint", CI_DESKTOP_TIER_IF)
    assert_category_event_tier(workflow, "schema-check", CI_SCHEMA_TIER_IF)
  end

  def test_desktop_lint_and_unit_tests_run_on_ubuntu
    desktop = load_workflow("ci.yml").fetch("jobs").fetch("desktop-lint")

    assert_equal "ubuntu-latest", desktop.fetch("runs-on")
  end

  def test_code_pull_request_required_jobs_fail_explicitly_when_lock_validation_fails
    workflow = load_workflow("ci.yml")

    [*CODE_PULL_REQUEST_REQUIRED_JOBS, "schema-check", "desktop-lint"].each do |job_name|
      job = workflow.fetch("jobs").fetch(job_name)

      assert_includes job.fetch("if"), "cancelled() == false",
        "#{job_name} must propagate dependency-locks failures without defeating cancellation"
      assert_dependency_lock_failure_guard(job, job_name)
    end
  end

  def test_compatibility_jobs_run_only_for_complete_non_pull_request_coverage
    workflow = load_workflow("ci.yml")

    %w[rust-compatibility rust-msrv].each do |job_name|
      assert_non_pull_request_event_tier(workflow, job_name, CI_RUST_COMPATIBILITY_TIER_IF)
    end
    assert_non_pull_request_event_tier(workflow, "rust-build-windows", CI_WINDOWS_TIER_IF)
  end

  def test_rust_compatibility_consolidates_uniffi_and_roaming
    jobs = load_workflow("ci.yml").fetch("jobs")
    commands = job_run_commands("ci.yml", "rust-compatibility").join("\n")

    assert jobs.key?("rust-compatibility")
    refute jobs.key?("goose-sdk-uniffi")
    refute jobs.key?("rust-build-and-test-roaming")
    assert_includes commands, "cargo check -p goose-sdk --features uniffi --locked"
    assert_includes commands, "cargo test -p goose-sdk --features uniffi --locked"
    assert_includes commands, "cargo test --locked -p goose-roaming"
    assert_includes commands, "cargo build --locked -p goose-cli --features roaming"
    assert_includes commands, "cargo test --locked -p goose-cli --features roaming --test roam_acp_client"
  end

  def test_tls_backends_share_one_job_and_target_directory
    job = load_workflow("ci.yml").dig("jobs", "rust-build-and-test-tls")
    commands = job.fetch("steps").map { |step| step["run"] }.compact.join("\n")
    native_step = job.fetch("steps").find { |step| step["name"] == "Build and Test with native-tls" }

    refute job.key?("strategy")
    assert_includes commands, "--features rustls-tls,code-mode"
    refute_nil native_step
    assert_equal "github.event_name != 'pull_request'", native_step.fetch("if")
    assert_includes native_step.fetch("run"), "--features native-tls,code-mode"
  end

  def test_windows_uses_check_on_main_and_full_build_for_complete_tiers
    job = load_workflow("ci.yml").dig("jobs", "rust-build-windows")
    check_step = job.fetch("steps").find { |step| step["name"] == "Check Windows CLI" }
    build_step = job.fetch("steps").find { |step| step["name"] == "Build Windows CLI" }

    refute_nil check_step
    assert_equal "github.event_name == 'push'", check_step.fetch("if")
    assert_includes check_step.fetch("run"), "cargo check --locked -p goose-cli --bin goose --target x86_64-pc-windows-msvc"
    refute_nil build_step
    assert_equal "github.event_name == 'merge_group' || github.event_name == 'workflow_dispatch'", build_step.fetch("if")
    assert_includes build_step.fetch("run"), "cargo build --locked -p goose-cli --bin goose --target x86_64-pc-windows-msvc"
  end

  def test_ci_required_check_names_remain_stable
    jobs = load_workflow("ci.yml").fetch("jobs")

    CI_REQUIRED_CHECK_NAMES.each do |job_name, check_name|
      assert_equal check_name, jobs.fetch(job_name).fetch("name")
    end
  end

  def test_ci_gate_enforces_the_event_tier_truth_table
    gate = load_workflow("ci.yml").fetch("jobs").fetch("ci-gate")
    step = gate.fetch("steps").first
    run = step.fetch("run")
    expected_env = {
      "EVENT_NAME" => "${{ github.event_name }}",
      "RUST_CHANGED" => "${{ needs.changes.outputs.rust }}",
      "DESKTOP_CHANGED" => "${{ needs.changes.outputs.desktop }}",
      "SCHEMA_CHANGED" => "${{ needs.changes.outputs.schema }}",
      "WINDOWS_CHANGED" => "${{ needs.changes.outputs.windows }}",
      "WORKFLOW_CONFIG_CHANGED" => "${{ needs.changes.outputs.workflow-config }}",
      "CHANGES_RESULT" => "${{ needs.changes.result }}",
      "DEPENDENCY_LOCKS_RESULT" => "${{ needs.dependency-locks.result }}",
      "RUST_FORMAT_RESULT" => "${{ needs.rust-format.result }}",
      "RUST_BUILD_AND_TEST_RESULT" => "${{ needs.rust-build-and-test.result }}",
      "RUST_COMPATIBILITY_RESULT" => "${{ needs.rust-compatibility.result }}",
      "TLS_RESULT" => "${{ needs.rust-build-and-test-tls.result }}",
      "WINDOWS_RESULT" => "${{ needs.rust-build-windows.result }}",
      "MSRV_RESULT" => "${{ needs.rust-msrv.result }}",
      "RUST_LINT_RESULT" => "${{ needs.rust-lint.result }}",
      "SCHEMA_RESULT" => "${{ needs.schema-check.result }}",
      "GDK_API_DOCS_RESULT" => "${{ needs.gdk-api-docs-check.result }}",
      "DESKTOP_LINT_RESULT" => "${{ needs.desktop-lint.result }}",
    }

    assert_equal "CI Gate", gate.fetch("name")
    assert_equal "cancelled() == false", gate.fetch("if")
    assert_equal CI_GATE_NEEDS.sort, Array(gate.fetch("needs")).sort
    assert_equal "Verify CI results", step.fetch("name")
    assert_equal expected_env, step.fetch("env")
    assert_includes run, 'if [[ "$actual" != "$expected" ]]'
    assert_includes run, 'require_result changes "$CHANGES_RESULT" success'
    assert_includes run, 'require_result gdk-api-docs-check "$GDK_API_DOCS_RESULT" success'
    assert_includes run, 'if [[ "$CHANGES_RESULT" != "success" || "$EVENT_NAME" == "workflow_dispatch" || "$RUST_CHANGED" == "true" || "$DESKTOP_CHANGED" == "true" || "$SCHEMA_CHANGED" == "true" || "$WINDOWS_CHANGED" == "true" || "$WORKFLOW_CONFIG_CHANGED" == "true" ]]'
    assert_includes run, 'if [[ "$CHANGES_RESULT" != "success" || "$EVENT_NAME" == "workflow_dispatch" || "$RUST_CHANGED" == "true" || "$WORKFLOW_CONFIG_CHANGED" == "true" ]]'
    assert_includes run, 'if [[ "$CHANGES_RESULT" != "success" || "$EVENT_NAME" == "workflow_dispatch" || "$DESKTOP_CHANGED" == "true" || "$WORKFLOW_CONFIG_CHANGED" == "true" ]]'
    assert_includes run, 'if [[ "$CHANGES_RESULT" != "success" || "$EVENT_NAME" == "workflow_dispatch" || "$SCHEMA_CHANGED" == "true" || "$WORKFLOW_CONFIG_CHANGED" == "true" ]]'
    assert_includes run, '( "$CHANGES_RESULT" != "success" || "$WINDOWS_CHANGED" == "true" || "$WORKFLOW_CONFIG_CHANGED" == "true" )'

    {
      "dependency-locks" => "DEPENDENCY_LOCKS_RESULT",
    }.each do |job_name, result_variable|
      assert_includes run, "require_result #{job_name} \"$#{result_variable}\" \"$dependency_tier_result\""
    end

    {
      "rust-format" => "RUST_FORMAT_RESULT",
      "rust-build-and-test" => "RUST_BUILD_AND_TEST_RESULT",
      "rust-build-and-test-tls" => "TLS_RESULT",
      "rust-lint" => "RUST_LINT_RESULT",
    }.each do |job_name, result_variable|
      assert_includes run, "require_result #{job_name} \"$#{result_variable}\" \"$rust_tier_result\""
    end

    assert_includes run, 'require_result schema-check "$SCHEMA_RESULT" "$schema_tier_result"'
    assert_includes run, 'require_result desktop-lint "$DESKTOP_LINT_RESULT" "$desktop_tier_result"'
    assert_includes run, 'require_result rust-compatibility "$RUST_COMPATIBILITY_RESULT" "$rust_compatibility_tier_result"'
    assert_includes run, 'require_result rust-msrv "$MSRV_RESULT" "$rust_compatibility_tier_result"'
    assert_includes run, 'require_result rust-build-windows "$WINDOWS_RESULT" "$windows_tier_result"'

    CI_EVENT_TIER_TRUTH_TABLE.each do |row|
      assert_equal row.values_at(:fast, :compatibility),
        ci_tier_results(row[:event], row[:selected]),
        "CI tier mismatch for #{row[:event]} with selected=#{row[:selected]}"
    end
  end

  def test_all_rust_toolchain_setup_steps_disable_builtin_caching
    workflow_files.each do |workflow_name|
      workflow = load_workflow(workflow_name)

      workflow.fetch("jobs", {}).each do |job_name, job|
        job.fetch("steps", []).each do |step|
          next unless step["uses"].to_s.start_with?("actions-rust-lang/setup-rust-toolchain@")

          assert_equal false, step.dig("with", "cache"),
            "#{workflow_name} #{job_name} must disable setup-rust-toolchain caching"
        end
      end
    end
  end

  def test_no_job_combines_builtin_and_explicit_rust_caches
    workflow_files.each do |workflow_name|
      load_workflow(workflow_name).fetch("jobs", {}).each do |job_name, job|
        steps = job.fetch("steps", [])
        setup_cache_enabled = steps.any? do |step|
          step["uses"].to_s.start_with?("actions-rust-lang/setup-rust-toolchain@") && step.dig("with", "cache") != false
        end
        explicit_cache = steps.any? { |step| step["uses"].to_s.start_with?("Swatinem/rust-cache@") }

        refute setup_cache_enabled && explicit_cache,
          "#{workflow_name} #{job_name} must not combine setup-rust-toolchain and Swatinem/rust-cache"
      end
    end
  end

  def test_large_rust_jobs_only_clean_disk_below_25_gib
    %w[rust-build-and-test rust-build-and-test-tls].each do |job_name|
      cleanup = load_workflow("ci.yml").dig("jobs", job_name, "steps").find do |step|
        step["name"] == "Free disk space when needed"
      end

      refute_nil cleanup, "#{job_name} must retain low-disk cleanup"
      run = cleanup.fetch("run")
      assert_includes run, 'df -Pk "$GITHUB_WORKSPACE"'
      assert_includes run, "25 * 1024 * 1024"
      assert_match(/if \(\( available_kb < threshold_kb \)\)/, run)
      assert_includes run, "sudo rm -rf"
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

  def test_rust_caches_use_distinct_identities_and_safe_save_policies
    expected_caches = RUST_CACHE_IDENTITIES.flat_map do |workflow_name, jobs|
      workflow = load_workflow(workflow_name)

      jobs.map do |job_name, key|
        job = workflow.fetch("jobs").fetch(job_name)
        cache = job.fetch("steps").find do |step|
          step["uses"].to_s.start_with?("Swatinem/rust-cache@")
        end

        refute_nil cache, "#{workflow_name} #{job_name} must restore a Rust cache"
        assert_equal key, cache.dig("with", "key"), "#{workflow_name} #{job_name} cache identity changed"
        assert_equal RUST_CACHE_SAVE_POLICIES.fetch(workflow_name), cache.dig("with", "save-if"),
          "#{workflow_name} #{job_name} must only upload successful protected-ref builds"

        [workflow_name, job_name, cache.dig("with", "key")]
      end
    end

    assert_equal expected_caches.length, expected_caches.map(&:last).uniq.length,
      "Rust jobs must not share target artifact caches across performance workflows"
  end

  def test_smoke_build_cache_uses_the_normalized_checkout_ref
    workflow = load_workflow("pr-smoke-test.yml")
    job = workflow.fetch("jobs").fetch("build-binary")
    filter = workflow.dig("jobs", "changes", "steps").find { |step| step["id"] == "filter" }
    checkout = job.fetch("steps").find do |step|
      step["uses"].to_s.start_with?("actions/checkout@")
    end
    cache = job.fetch("steps").find do |step|
      step["uses"].to_s.start_with?("Swatinem/rust-cache@")
    end
    checkout_refs = workflow.fetch("jobs").values.flat_map do |workflow_job|
      workflow_job.fetch("steps", []).map do |step|
        step.dig("with", "ref") if step["uses"].to_s.start_with?("actions/checkout@")
      end.compact
    end

    refute_nil checkout, "smoke build must check out the selected branch"
    assert_equal SMOKE_BUILD_REF, workflow.dig("env", "BUILD_REF"),
                 "smoke workflow must normalize dispatch refs and default to the current branch name"
    assert_equal "${{ env.BUILD_REF }}", checkout.dig("with", "ref"),
                 "smoke build checkout must use the normalized build ref"
    refute_empty checkout_refs, "smoke workflow must check out the normalized build ref"
    checkout_refs.each do |checkout_ref|
      assert_equal "${{ env.BUILD_REF }}", checkout_ref,
                   "smoke workflow checkout must use the normalized build ref"
    end
    assert_includes workflow_text("pr-smoke-test.yml"), "default: \"main\"",
      "smoke build dispatch input must default to main"
    assert_includes job.fetch("if"), "github.event_name == 'workflow_dispatch'",
      "manual smoke runs must bypass documentation filtering"
    assert_documentation_filter(filter, include_docs_only: false)
    refute_nil cache, "smoke build must restore a Rust cache"
    assert_equal RUST_CACHE_IDENTITIES.fetch("pr-smoke-test.yml").fetch("build-binary"), cache.dig("with", "key")
    assert_equal RUST_CACHE_SAVE_POLICIES.fetch("pr-smoke-test.yml"), cache.dig("with", "save-if"),
                 "smoke build cache writes must follow the normalized checkout ref"
  end

  def test_v8_marker_repair_runs_after_cache_restore_and_before_builds
    workflow = load_workflow("ci.yml")

    %w[rust-build-and-test rust-build-and-test-tls rust-msrv rust-lint].each do |job_name|
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

  def test_desktop_workflows_do_not_cache_node_modules
    %w[ci.yml pr-smoke-test.yml bundle-macos.yml bundle-windows.yml].each do |workflow_name|
      cache_paths(workflow_name).each do |path|
        refute_match(%r{(^|/)node_modules($|/)}, path, "#{workflow_name} must not cache node_modules")
      end
    end
  end

  def test_desktop_pnpm_install_jobs_cache_the_pnpm_store
    {
      "ci.yml" => %w[schema-check desktop-lint],
      "pr-smoke-test.yml" => %w[smoke-tests smoke-tests-code-exec],
      "bundle-macos.yml" => ["package-desktop"],
      "bundle-windows.yml" => ["build-desktop-windows"],
    }.each do |workflow_name, job_names|
      workflow = load_workflow(workflow_name)

      job_names.each do |job_name|
        steps = workflow.fetch("jobs").fetch(job_name).fetch("steps")
        pnpm_store_step = steps.find { |step| step["id"] == "pnpm-store" }
        pnpm_cache_step = steps.find do |step|
          step["uses"].to_s.start_with?("actions/cache@") &&
            step.dig("with", "path") == "${{ steps.pnpm-store.outputs.path }}"
        end

        refute_nil pnpm_store_step, "#{workflow_name} #{job_name} must resolve the pnpm store"
        assert_includes pnpm_store_step.fetch("run"), "pnpm store path",
          "#{workflow_name} #{job_name} must use pnpm to resolve its store"
        if workflow_name == "bundle-windows.yml"
          pnpm_install_step = steps.find { |step| step["name"] == "Install pnpm" }
          refute_nil pnpm_install_step, "#{workflow_name} must install pnpm before resolving its store"
          assert_operator steps.index(pnpm_install_step), :<, steps.index(pnpm_store_step),
            "#{workflow_name} must resolve pnpm store after pnpm is available"
        else
          assert_includes pnpm_store_step.fetch("run"), "activate-hermit",
            "#{workflow_name} #{job_name} must resolve the store using Hermit's pnpm"
        end
        refute_nil pnpm_cache_step, "#{workflow_name} #{job_name} must cache the resolved pnpm store"
        assert_includes pnpm_cache_step.dig("with", "key"), "runner.os",
          "#{workflow_name} #{job_name} pnpm store key must include the OS"
        assert_includes pnpm_cache_step.dig("with", "key"), "hashFiles('ui/pnpm-lock.yaml')",
          "#{workflow_name} #{job_name} pnpm store key must include the lockfile hash"
        assert_operator steps.index(pnpm_store_step), :<, steps.index(pnpm_cache_step),
          "#{workflow_name} #{job_name} must resolve pnpm store before caching it"
      end
    end
  end

  def test_bundle_jobs_cache_electron_downloads_with_platform_specific_keys
    {
      "bundle-macos.yml" => ["package-desktop", "arm64"],
      "bundle-windows.yml" => ["build-desktop-windows", "matrix.electron_arch"],
    }.each do |workflow_name, (job_name, architecture)|
      job = load_workflow(workflow_name).fetch("jobs").fetch(job_name)
      electron_cache = job.fetch("env").fetch("ELECTRON_CACHE")
      electron_cache_step = job.fetch("steps").find do |step|
        step["uses"].to_s.start_with?("actions/cache@") &&
          step.dig("with", "path") == "${{ env.ELECTRON_CACHE }}"
      end

      refute_empty electron_cache, "#{workflow_name} must define ELECTRON_CACHE"
      assert_equal "${{ github.workspace }}/.cache/electron", electron_cache,
                   "#{workflow_name} must use a job-level expression context available before runner assignment"
      refute_nil electron_cache_step, "#{workflow_name} must cache ELECTRON_CACHE"
      electron_cache_key = electron_cache_step.dig("with", "key")
      assert_includes electron_cache_key, "runner.os", "#{workflow_name} Electron cache key must include the OS"
      assert_includes electron_cache_key, architecture,
        "#{workflow_name} Electron cache key must include the architecture"
      assert_includes electron_cache_key, "hashFiles('ui/pnpm-lock.yaml')",
        "#{workflow_name} Electron cache key must include the lockfile hash"
    end
  end

  def test_pnpm_install_jobs_force_github_git_dependencies_to_https
    {
      "ci.yml" => %w[schema-check desktop-lint],
      "pr-smoke-test.yml" => %w[smoke-tests smoke-tests-code-exec],
      "bundle-macos.yml" => ["package-desktop"],
      "bundle-windows.yml" => ["build-desktop-windows"],
    }.each do |workflow_name, job_names|
      workflow = load_workflow(workflow_name)

      job_names.each do |job_name|
        steps = workflow.fetch("jobs").fetch(job_name).fetch("steps")
        rewrite_index = steps.index do |step|
          step["name"] == "Force GitHub HTTPS npm git dependencies"
        end
        install_index = steps.index do |step|
          step.fetch("run", "").include?("pnpm install --frozen-lockfile")
        end

        refute_nil rewrite_index, "#{workflow_name} #{job_name} must rewrite GitHub SSH dependencies"
        refute_nil install_index, "#{workflow_name} #{job_name} must install pnpm dependencies"
        assert_operator rewrite_index, :<, install_index,
                        "#{workflow_name} #{job_name} must rewrite GitHub URLs before pnpm install"

        rewrite = steps.fetch(rewrite_index).fetch("run")
        %w[ssh://git@github.com/ git@github.com: git+ssh://git@github.com/].each do |ssh_prefix|
          assert_includes rewrite, "--add", "#{workflow_name} #{job_name} must retain every rewrite rule"
          assert_includes rewrite, ssh_prefix,
                          "#{workflow_name} #{job_name} must rewrite #{ssh_prefix}"
        end
      end
    end
  end

  def test_schema_check_installs_the_ui_workspace_once
    schema_check = load_workflow("ci.yml").fetch("jobs").fetch("schema-check")
    pnpm_install_steps = schema_check.fetch("steps").select do |step|
      step.fetch("run", "").match?(/\bpnpm install --frozen-lockfile\b/)
    end

    assert_equal 1, pnpm_install_steps.length, "schema check must install dependencies once"
    assert_equal "ui", pnpm_install_steps.first["working-directory"],
      "schema check must install from the UI workspace root"
  end

  def test_release_workflows_retain_macos_arm64_and_both_windows_targets
    macos_workflow = load_workflow("bundle-macos.yml")
    windows_workflow = load_workflow("bundle-windows.yml")
    windows_commands = cargo_commands("bundle-windows.yml")
    windows_targets = windows_workflow.dig(
      "jobs", "build-goose-windows", "strategy", "matrix", "include"
    ).map { |entry| entry.fetch("rust_target") }

    assert_equal "aarch64-apple-darwin", macos_workflow.dig("env", "MACOS_TARGET"),
                 "bundle-macos.yml must retain the macOS ARM64 release target"
    assert cargo_commands("bundle-macos.yml").any? { |command| command.include?("--target \"$MACOS_TARGET\"") },
           "bundle-macos.yml must build with the macOS ARM64 release target"
    assert_equal %w[i686-pc-windows-msvc x86_64-pc-windows-msvc], windows_targets
    assert windows_commands.any? { |command| command.include?("--target $env:RUST_TARGET") },
           "bundle-windows.yml must build the selected Windows matrix target"
  end

  def test_bundle_workflows_bound_final_artifact_retention
    {
      "bundle-macos.yml" => %w[package-cli package-desktop],
      "bundle-windows.yml" => %w[package-cli-windows package-desktop-windows],
    }.each do |workflow_name, job_names|
      workflow = load_workflow(workflow_name)

      %w[workflow_dispatch workflow_call].each do |trigger|
        retention = workflow.fetch(true).fetch(trigger).dig("inputs", "artifact_retention_days")
        assert_equal "number", retention.fetch("type"), "#{workflow_name} #{trigger} retention input type"
        assert_equal 7, retention.fetch("default"), "#{workflow_name} #{trigger} retention default"
      end

      job_names.each do |job_name|
        uploads = workflow.dig("jobs", job_name, "steps").select do |step|
          step["uses"].to_s.start_with?("actions/upload-artifact@")
        end
        refute_empty uploads, "#{workflow_name} #{job_name} must upload a final artifact"
        uploads.each do |upload|
          assert_equal "${{ inputs.artifact_retention_days }}", upload.dig("with", "retention-days")
        end
      end
    end
  end

  def test_release_candidate_keeps_artifacts_for_fourteen_days
    caller = load_workflow("release-branches.yml").dig("jobs", "bundle-desktop", "with")

    assert_equal 14, caller.fetch("artifact_retention_days")
  end

  def test_release_and_canary_bundle_artifacts_default_to_seven_days
    {
      "release.yml" => %w[bundle-macos-arm64 bundle-windows],
      "canary.yml" => %w[bundle-macos-arm64 bundle-windows],
    }.each do |workflow_name, jobs|
      workflow = load_workflow(workflow_name)
      jobs.each do |job_name|
        assert_equal 7, workflow.dig("jobs", job_name, "with", "artifact_retention_days")
      end
    end
  end

  def test_linux_final_cli_artifacts_expire_after_seven_days
    upload = load_workflow("build-cli-linux.yml").dig("jobs", "build-cli-linux", "steps").find do |step|
      step["name"] == "Upload CLI artifact"
    end

    assert_equal 7, upload.dig("with", "retention-days")
  end

  def test_release_install_script_artifacts_expire_after_seven_days
    %w[release.yml canary.yml].each do |workflow_name|
      upload = load_workflow(workflow_name).dig("jobs", "install-script", "steps").find do |step|
        step["uses"].to_s.start_with?("actions/upload-artifact@")
      end

      assert_equal 7, upload.dig("with", "retention-days"), "#{workflow_name} install script retention"
    end
  end

  def test_internal_transfer_artifacts_expire_after_one_day
    {
      "bundle-macos.yml" => ["internal-goose-aarch64-apple-darwin"],
      "bundle-windows.yml" => [
        "internal-goose-${{ matrix.rust_target }}",
        "internal-windows-unsigned-${{ matrix.name }}",
      ],
      "build-cli-linux.yml" => ["internal-goose-${{ matrix.architecture }}-${{ matrix.target-suffix }}${{ matrix.variant == 'vulkan' && '-vulkan' || '' }}"],
    }.each do |workflow_name, artifact_names|
      uploads = load_workflow(workflow_name).fetch("jobs").values.flat_map do |job|
        job.fetch("steps", []).select { |step| step["uses"].to_s.start_with?("actions/upload-artifact@") }
      end

      artifact_names.each do |artifact_name|
        upload = uploads.find { |step| step.dig("with", "name") == artifact_name }
        refute_nil upload, "#{workflow_name} must upload #{artifact_name}"
        assert_equal 1, upload.dig("with", "retention-days"), "#{workflow_name} #{artifact_name} retention"
      end
    end
  end

  private

  def load_workflow(workflow_name)
    YAML.safe_load(workflow_text(workflow_name), aliases: true)
  end

  def workflow_files
    Dir.glob(File.join(WORKFLOW_DIRECTORY, "*.{yml,yaml}")).map { |path| File.basename(path) }.sort
  end

  def workflow_text(workflow_name)
    File.read(File.join(WORKFLOW_DIRECTORY, workflow_name))
  end

  def cargo_commands(workflow_name)
    workflow_text(workflow_name).lines.map do |line|
      command = line.strip
      command if command.match?(/\bcargo\s+(build|check|clippy|test|fetch)\b/)
    end.compact
  end

  def job_run_commands(workflow_name, job_name)
    load_workflow(workflow_name).dig("jobs", job_name, "steps").map { |step| step["run"] }.compact
  end

  def just_recipe(recipe_name)
    pattern = /^#{Regexp.escape(recipe_name)}:.*?(?=^\S.*?:|\z)/m
    justfile = File.read(JUSTFILE)

    assert_match pattern, justfile, "justfile must define #{recipe_name}"
    justfile.match(pattern)[0]
  end

  def assert_code_change_event_tier(workflow, job_name, requires_dependency_locks: true)
    job = workflow.fetch("jobs").fetch(job_name)

    assert_includes Array(job["needs"]), "changes", "#{job_name} must depend on changes"
    assert_equal CI_DEPENDENCY_TIER_IF, job.fetch("if"), "#{job_name} must use the failure-aware dependency tier"
    if requires_dependency_locks
      assert_includes Array(job["needs"]), "dependency-locks", "#{job_name} must depend on dependency-locks"
      assert_dependency_lock_failure_guard(job, job_name)
    else
      assert_change_detection_failure_guard(job, job_name)
    end
  end


  def assert_category_event_tier(workflow, job_name, expected_condition)
    job = workflow.fetch("jobs").fetch(job_name)

    assert_includes Array(job["needs"]), "changes", "#{job_name} must depend on changes"
    assert_includes Array(job["needs"]), "dependency-locks", "#{job_name} must depend on dependency-locks"
    assert_equal expected_condition, job.fetch("if"), "#{job_name} must use its category tier"
    assert_dependency_lock_failure_guard(job, job_name)
  end

  def assert_non_pull_request_event_tier(workflow, job_name, expected_condition)
    job = workflow.fetch("jobs").fetch(job_name)

    assert_includes Array(job["needs"]), "changes", "#{job_name} must depend on changes"
    assert_includes Array(job["needs"]), "dependency-locks", "#{job_name} must depend on dependency-locks"
    assert_equal expected_condition, job.fetch("if"), "#{job_name} must use the compatibility tier"
    assert_dependency_lock_failure_guard(job, job_name)
  end

  def assert_change_detection_failure_guard(job, job_name)
    guard = job.fetch("steps").first

    assert_equal "Fail when change detection fails", guard.fetch("name"),
      "#{job_name} must check change detection before expensive steps"
    assert_equal "needs.changes.result != 'success'", guard.fetch("if"),
      "#{job_name} must fail when change detection fails or is cancelled"
    assert_equal "exit 1", guard.fetch("run"),
      "#{job_name} must fail explicitly when change detection fails or is cancelled"
  end

  def assert_dependency_lock_failure_guard(job, job_name)
    guard = job.fetch("steps").first

    assert_equal "Fail when dependency lock validation fails", guard.fetch("name"), "#{job_name} must check dependency locks before expensive steps"
    assert_equal "needs.dependency-locks.result != 'success'", guard.fetch("if"), "#{job_name} must fail when dependency-locks fails"
    assert_equal "exit 1", guard.fetch("run"), "#{job_name} must fail explicitly when dependency-locks fails"
  end

  def assert_documentation_filter(filter, include_docs_only:)
    filters = YAML.safe_load(filter.dig("with", "filters"), aliases: true)

    assert_equal CODE_PATHS, filters.fetch("code")
    if include_docs_only
      assert_equal DOCUMENTATION_PATHS, filters.fetch("docs-only")
    else
      refute filters.key?("docs-only")
    end
  end

  def ci_tier_results(event_name, selected)
    code_tier = event_name == "workflow_dispatch" || selected
    compatibility_tier = event_name == "workflow_dispatch" || (event_name != "pull_request" && selected)

    [code_tier ? "success" : "skipped", compatibility_tier ? "success" : "skipped"]
  end

  def mcp_tier_selected?(event_name, code_changed)
    event_name == "workflow_dispatch" || code_changed
  end

  def cache_paths(workflow_name)
    load_workflow(workflow_name).fetch("jobs").values.flat_map do |job|
      job.fetch("steps", []).map do |step|
        next unless step["uses"].to_s.start_with?("actions/cache@")

        step.dig("with", "path")
      end.compact
    end.flat_map { |path| path.lines.map(&:strip) }.reject(&:empty?)
  end

  def rust_cache_entries
    %w[ci.yml mcp-conformance.yml pr-smoke-test.yml model-toolcall-conformance.yml bundle-macos.yml bundle-windows.yml build-cli-linux.yml].flat_map do |workflow_name|
      workflow = load_workflow(workflow_name)

      workflow.fetch("jobs").flat_map do |job_name, job|
        job.fetch("steps", []).map do |step|
          next unless step["uses"].to_s.start_with?("Swatinem/rust-cache@")

          {
            workflow: workflow_name,
            job: job_name,
            job_definition: job,
            key: step.dig("with", "key"),
          }
        end.compact
      end
    end
  end

  def assert_semantic_rust_cache_contexts(entries)
    assert_standard_cache_context(entries)
    assert_cache_context(entries, :msrv, /msrv/i)
    assert_cache_context(
      entries,
      :target,
      /aarch64-apple-darwin|i686-pc-windows-msvc|x86_64-pc-windows-msvc|MACOS_TARGET|matrix\.rust_target/
    )
  end

  def assert_standard_cache_context(entries)
    context_entries = entries.select { |entry| cache_context?(entry, :standard) }
    incompatible_contexts = /msrv|aarch64-apple-darwin|i686-pc-windows-msvc|x86_64-pc-windows-msvc|matrix\.rust_target/i

    refute_empty context_entries, "Rust cache must cover the standard compiler context"
    context_entries.each do |entry|
      refute_match incompatible_contexts, entry[:key].to_s,
        "#{entry[:workflow]} #{entry[:job]} standard Rust cache must not use a specialized context key"
    end
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
      default_rust_toolchain?(entry) && cargo_build_or_test?(job) && !msrv_job?(job) && !target_job?(job)
    when :msrv
      msrv_job?(job)
    when :target
      target_job?(job)
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
    job.match?(/rustup target add|--target/) &&
      job.match?(/aarch64-apple-darwin|i686-pc-windows-msvc|x86_64-pc-windows-msvc|MACOS_TARGET|matrix\.rust_target/)
  end

  def job_yaml(entry)
    YAML.dump(entry[:job_definition])
  end
end
