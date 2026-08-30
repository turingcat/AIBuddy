# Final Authentication Review Fix Report

## Status

Complete. The final review's two Important findings and one Minor test-quality finding were fixed without expanding the production scope.

Planned commit: `fix(auth): preserve actionable authentication errors` (implementation, tests, and this report).

## TDD Evidence

### HTTP error envelopes

- RED: `pnpm test:run src/sub2apiAuth.test.ts` ran 19 tests; exactly 2 new tests failed. HTTP 400 and HTTP 401 responses returned `认证服务不可用（HTTP N）` instead of preserving the protocol `message` and `reason`.
- GREEN: after changing `requestEnvelope` to parse a valid envelope before applying the HTTP fallback, the same file passed 19/19 tests.
- Additional boundary mutation RED: the non-2xx/non-JSON and non-2xx/malformed-envelope fallbacks were temporarily changed to return the format error. Both new HTTP fallback tests failed with the expected 502/503 mismatch.
- Boundary GREEN: the correct fallback was restored and `src/sub2apiAuth.test.ts` passed 22/22 tests.

### Aliyun captcha initialization failure

- RED: `pnpm test:run src/components/auth/AliyunCaptcha.test.tsx` ran 11 tests; the new programmatic verification test timed out after 5 seconds without advancing the virtual 8-second popup timeout. This reproduced the unsettled pending verification.
- GREEN: initialization failure handling is attached once to the shared initialization promise. It stops the popup watcher, resolves pending verification with `null`, returns state to `idle`, and invokes `onError` once. The component and form focused run passed 19/19 tests.

### Login form error handling

- RED: `pnpm test:run src/components/auth/AIBuddyLoginForm.test.tsx` ran 8 tests; the new real-form test could not find an alert after the captcha component invoked `onError`.
- GREEN: the form now retains an actionable captcha load error in state/ref, passes `onError` and `onVerify`, prefers that error when verification resolves `null`, and keeps submission available for retry. The component and form focused run passed 19/19 tests.

### SDK config rollback coverage

- The SDK load-failure rollback test now executes before the first successful initialization.
- It reserves `sgp/prefix-failed`, triggers a real script error, then mounts the default `cn/prefix-1` component successfully.
- No production test reset hook was added. Without the existing rollback, the second configuration is incompatible and the test fails.

## Implementation

- `requestEnvelope` now attempts JSON/envelope parsing before handling a non-2xx response. A valid nonzero protocol `code` takes precedence and preserves `message`/`reason`; invalid non-2xx responses use `认证服务不可用（HTTP N）`; invalid 2xx responses remain format errors. Network and timeout classification was unchanged.
- `AliyunCaptcha` centralizes initialization failure settlement on the single shared initialization promise, preventing duplicate `onError` notifications from multiple callers.
- `AIBuddyLoginForm` surfaces `Unable to load captcha. Please try again.`, retains it across a `null` proof, clears it on successful verification, and does not permanently disable retry.

## Files

- `ui/desktop/src/sub2apiAuth.ts`
- `ui/desktop/src/sub2apiAuth.test.ts`
- `ui/desktop/src/components/auth/AliyunCaptcha.tsx`
- `ui/desktop/src/components/auth/AliyunCaptcha.test.tsx`
- `ui/desktop/src/components/auth/AIBuddyLoginForm.tsx`
- `ui/desktop/src/components/auth/AIBuddyLoginForm.test.tsx`
- `.superpowers/sdd/2026-08-30-aibuddy-sub2api-login/final-fix-report.md`

No Rust, agent-loop, generated API, dependency, or lock files were changed.

## Verification

| Check                                    | Result                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Updated 10-file focused suite            | 10 files passed, 119 tests passed                                  |
| Three-module coverage suite              | 3 files passed, 41 tests passed                                    |
| Coverage total                           | 91.07% statements, 83.40% branches, 81.33% functions, 91.07% lines |
| `sub2apiAuth.ts`                         | 91.56% statements, 84.00% branches, 93.33% functions, 91.56% lines |
| `AIBuddyLoginForm.tsx`                   | 88.23% statements, 81.01% branches, 88.88% functions, 88.23% lines |
| `AliyunCaptcha.tsx`                      | 95.26% statements, 85.54% branches, 87.09% functions, 95.26% lines |
| `pnpm run typecheck`                     | Passed (`tsc --noEmit`)                                            |
| Full feature changed-file Prettier check | Passed (`All matched files use Prettier code style!`)              |
| `git diff --check`                       | Passed                                                             |

`cargo fmt` was not run because this fix contains no Rust and the task explicitly excluded it.

## Self-Review

- Confirmed protocol errors from HTTP 400/401 retain both user-facing `message` and machine-readable `reason`.
- Confirmed invalid non-2xx JSON and malformed envelopes fall back to HTTP status, while invalid 2xx responses retain the format-error behavior.
- Confirmed the existing network and timeout branches were not changed and remain covered.
- Confirmed a script load error settles programmatic verification immediately, clears the watcher, restores `idle`, and emits one error for the shared initialization attempt.
- Confirmed the form does not overwrite a captcha load error with the generic completion message and permits another submission.
- Confirmed rollback coverage is order-sensitive and uses incompatible failed/success configurations.
- Confirmed the diff is restricted to the agreed auth modules/tests plus this report.

## Warnings

- The environment uses Node `v26.5.0`; the package requests `^24.10.0`.
- Vitest reports the existing CommonJS loading warning for ESM syntax in `vitest.config.ts`.
- Both warnings predate this fix and did not affect exit status.
