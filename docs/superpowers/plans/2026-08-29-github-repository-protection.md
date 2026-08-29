# GitHub Repository Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply and verify branch, tag, and GitHub Actions protections for `turingcat/HeyBuddy` after the new Desktop CI is live on `main`.

**Architecture:** A checked-in idempotent shell script owns the repository policy payloads and uses `gh api` for application and read-back verification. It refuses to apply protection until a successful `CI Gate` exists on the default branch, preventing an accidental repository lockout. A tag ruleset allows initial `v*` creation but blocks updates, non-fast-forward changes, and deletion.

**Tech Stack:** Bash, GitHub CLI, GitHub REST API, jq, Minitest contract checks.

## Global Constraints

- Repository is `turingcat/HeyBuddy`; resolve and verify it at runtime rather than relying only on the current git remote string.
- Run this plan only after the CI/CD PR from Plan 2 is merged and `CI Gate` has succeeded on `main`.
- `main` requires PRs, one approval, stale-approval dismissal, resolved conversations, strict `CI Gate`, administrator enforcement, CODEOWNER review, and disallows force pushes and deletion.
- Tag ruleset target is `refs/tags/v*`; initial creation remains allowed, while update, non-fast-forward change, and deletion are blocked.
- Actions policy is `selected`, GitHub-owned actions are allowed, approved third-party actions are allowlisted, and full-SHA pinning is required.
- Deleted historical workflows are disabled if GitHub still exposes them in the Actions registry.
- All mutations require an explicit `--apply`; default mode is read-only verification.

---

### Task 1: Add an Auditable Repository Policy Script

**Files:**
- Create: `scripts/github-repository-policy.sh`
- Create: `scripts/test-github-repository-policy.rb`
- Consume: `.github/retired-workflows.txt`

**Interfaces:**
- `scripts/github-repository-policy.sh` defaults to `--check`; `--apply` performs mutations then runs the same read-back checks.
- Optional `--repo owner/name` defaults to `gh repo view --json nameWithOwner --jq .nameWithOwner` and must equal `turingcat/HeyBuddy` before mutation.
- Preflight aborts unless default branch is `main` and its latest successful CI run contains a successful job named exactly `CI Gate`.
- Temporary JSON files use `mktemp -d` and a trap; no broad or unresolved deletion target is used.

- [ ] Write static Minitest contracts for default read-only mode, explicit `--apply`, repository/default-branch guard, CI Gate preflight, exact branch payload, tag rules, Actions allowlist, SHA pinning, and retired-workflow loop.

```bash
ruby scripts/test-github-repository-policy.rb
```

Expected: FAIL because the script does not exist.

- [ ] Implement argument parsing, authenticated-repo resolution, and the preflight. Require `gh auth status` and fail with an actionable message if the token lacks Administration write permission.

- [ ] Implement Actions policy application:

```json
{
  "enabled": true,
  "allowed_actions": "selected",
  "sha_pinning_required": true
}
```

Use `/repos/{owner}/{repo}/actions/permissions`, then configure `/actions/permissions/selected-actions` with `github_owned_allowed: true`, `verified_allowed: false`, and only the third-party owners/actions still present in the ten retained workflows (for example `actions-rust-lang/setup-rust-toolchain`, `dorny/paths-filter`, `mozilla-actions/sccache-action`, and `peter-evans/create-pull-request`). Generate this list from the final workflow inventory and keep it exact.

- [ ] Implement `main` branch protection with this payload shape:

```json
{
  "required_status_checks": {"strict": true, "contexts": ["CI Gate"]},
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "block_creations": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
```

- [ ] Implement an idempotent active repository ruleset named `Protect version tags`. Its condition includes only `refs/tags/v*`; its rules are `update`, `deletion`, and `non_fast_forward`; it has no bypass actors and no `creation` rule.

- [ ] Implement retired workflow cleanup: for each filename in `.github/retired-workflows.txt`, query the workflow ID and call the disable endpoint only when it still exists.

- [ ] Implement read-back checks that compare semantic values, not raw JSON ordering.

- [ ] Run tests and shell syntax validation.

```bash
ruby scripts/test-github-repository-policy.rb
bash -n scripts/github-repository-policy.sh
scripts/github-repository-policy.sh --check --repo turingcat/HeyBuddy
```

Expected: unit contracts and syntax PASS. The initial live check reports current policy drift and performs no mutation.

- [ ] Commit the policy script before applying it.

```bash
git add scripts/github-repository-policy.sh scripts/test-github-repository-policy.rb
git commit -m "chore(github): codify repository protections"
```

### Task 2: Verify the New CI Is Live on `main`

**Files:**
- No file changes.

- [ ] Confirm local branch work is merged and the default branch contains the exact `CI Gate` job.

```bash
gh repo view turingcat/HeyBuddy --json defaultBranchRef --jq .defaultBranchRef.name
gh run list --repo turingcat/HeyBuddy --workflow CI --branch main --status success --limit 1 --json databaseId,headSha,conclusion
```

Expected: default branch `main` and at least one successful CI run after the workflow merge.

- [ ] Read the run jobs and confirm `CI Gate` succeeded.

```bash
RUN_ID=$(gh run list --repo turingcat/HeyBuddy --workflow CI --branch main --status success --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN_ID" --repo turingcat/HeyBuddy --json jobs --jq '.jobs[] | select(.name == "CI Gate") | [.name, .conclusion] | @tsv'
```

Expected: `CI Gate<TAB>success`. Stop here if absent; do not apply protection.

### Task 3: Apply Actions, Branch, Tag, and Workflow Registry Policies

**Files:**
- No file changes unless live API behavior exposes a script bug; fix and recommit before retrying.

- [ ] Record the current settings for rollback evidence without changing them.

```bash
gh api repos/turingcat/HeyBuddy/actions/permissions
gh api repos/turingcat/HeyBuddy/branches/main/protection || true
gh api repos/turingcat/HeyBuddy/rulesets
gh workflow list --repo turingcat/HeyBuddy --all
```

- [ ] Apply the checked-in policy.

```bash
scripts/github-repository-policy.sh --apply --repo turingcat/HeyBuddy
```

Expected: selected Actions and SHA pinning are enabled; `main` and `v*` protections are active; any retired workflows still registered are disabled.

- [ ] Immediately run read-only verification separately.

```bash
scripts/github-repository-policy.sh --check --repo turingcat/HeyBuddy
```

Expected: PASS with no drift.

### Task 4: Exercise the Protection Boundaries

**Files:**
- No file changes.

- [ ] Verify branch protection values directly.

```bash
gh api repos/turingcat/HeyBuddy/branches/main/protection --jq '{strict: .required_status_checks.strict, contexts: .required_status_checks.contexts, admins: .enforce_admins.enabled, approvals: .required_pull_request_reviews.required_approving_review_count, stale: .required_pull_request_reviews.dismiss_stale_reviews, codeowners: .required_pull_request_reviews.require_code_owner_reviews, conversations: .required_conversation_resolution.enabled, force_push: .allow_force_pushes.enabled, deletion: .allow_deletions.enabled}'
```

Expected: strict/admins/stale/codeowners/conversations true; approvals 1; force_push/deletion false; contexts contain only `CI Gate`.

- [ ] Verify Actions policy and selected allowlist directly.

```bash
gh api repos/turingcat/HeyBuddy/actions/permissions
gh api repos/turingcat/HeyBuddy/actions/permissions/selected-actions
```

Expected: `allowed_actions=selected`, `sha_pinning_required=true`, GitHub-owned allowed, verified marketplace actions not broadly allowed, and no obsolete action pattern.

- [ ] Verify the active tag ruleset.

```bash
gh api repos/turingcat/HeyBuddy/rulesets --jq '.[] | select(.name == "Protect version tags") | {enforcement, target, conditions, rules, bypass_actors}'
```

Expected: active tag target for `refs/tags/v*`, rules include update/deletion/non-fast-forward, no creation rule, no bypass actors.

- [ ] Create a normal test PR that changes only documentation and confirm direct main updates are rejected, the PR requires approval and `CI Gate`, and stale approvals dismiss after a new commit. Do not attempt a force push or tag deletion against a production tag solely as a test.

- [ ] Run final repository policy and workflow inventory checks.

```bash
scripts/github-repository-policy.sh --check --repo turingcat/HeyBuddy
gh workflow list --repo turingcat/HeyBuddy --all
```

Expected: only the ten approved workflows are active and all policy checks pass.

### Task 5: Record Operational Result

**Files:**
- Modify only if the project keeps an operations record: `docs/superpowers/specs/2026-08-29-desktop-cicd-design.md`

- [ ] Add a short dated verification note to the design document containing the successful main CI run ID and the tag ruleset ID. Do not include tokens or full API dumps.

- [ ] Commit the verification note through a protected PR.

```bash
git add docs/superpowers/specs/2026-08-29-desktop-cicd-design.md
git commit -m "docs: record repository protection rollout"
git push
```

- [ ] Confirm the documentation PR itself demonstrates the required review and `CI Gate` behavior before merging.
