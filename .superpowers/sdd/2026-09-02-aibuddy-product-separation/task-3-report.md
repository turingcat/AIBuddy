# Task 3 Report: Remove OA Authentication

## RED

- `authConfig.test.ts` was changed first to require the TFlow default, AIBuddy-only override, and local fallback.
- The focused Vitest run failed all three assertions because the resolver still returned `https://ai.linyeyun.cn`.
- The preload type check also failed because `ElectronAPI` still exposed `loginViaOA`.

## GREEN

- Removed the OA request implementation, renderer login helper, OA IPC handler, preload bridge, and dead HeyBuddy login form.
- Collapsed auth configuration to AIBuddy/Sub2API and retained the TFlow environment override.
- Focused verification passed: 25 tests across auth configuration, LoginView, AIBuddy login form, AIBuddy IPC, Vite configuration, and product-boundary tests.
- `pnpm run typecheck` and Prettier checks passed. The targeted scan found no OA auth identifiers, legacy OA host, or HeyBuddy auth environment variable.

## Files

- Deleted: `ui/desktop/src/oaLogin.ts`, `ui/desktop/src/oaLogin.test.ts`, `ui/desktop/src/login.ts`, and `ui/desktop/src/login.test.ts`.
- Updated auth configuration, LoginView, main IPC, preload API/type test, Vite configuration/test, and production environment configuration.

## Self Review

- The existing AIBuddy/Sub2API IPC channels and credential persistence flow are unchanged.
- `ui/desktop/src/types/electron.d.ts` does not exist in this worktree; `ElectronAPI` is declared in `src/preload.ts` and was updated there.
- The actual `check-product-boundary` command still reports pre-existing provider and legacy-data-migration references outside this task's allowed auth scope.

## Commit

Implementation commit: `27367811a feat(aibuddy): remove OA authentication`

## Review Fix Round 1

- RED: Windows wrapper contract tests found both scripts defaulted to `https://ai.linyeyun.cn` and emitted `HEYBUDDY_AUTH_API_BASE_URL`; a root PowerShell fixture also bypassed the boundary CLI.
- GREEN: both wrappers now default to `https://tflow.online` and emit `AIBUDDY_AUTH_API_BASE_URL`; the boundary checker explicitly scans the two active root wrappers.
- Verified: `pnpm exec vitest run src/authConfig.test.ts scripts/windows-auth-contract.test.js scripts/check-product-boundary.test.js` passed 13 tests.
- The actual boundary CLI reports only the pre-existing, out-of-scope provider and legacy-data-migration references.
