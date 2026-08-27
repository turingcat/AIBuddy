# HeyBuddy Remote Server Build Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `executing-plans` (inline execution is appropriate for this focused change)

**Goal:** Make every production HeyBuddy desktop build embed `https://ai.linyeyun.cn` as the login service base URL without requiring a command-line explanation each time, while preserving explicit environment-variable overrides and the localhost development fallback.

**Architecture:** Store the production value in `ui/desktop/.env.production`. The main-process Vite config will load Vite environment files and merge them with the shell environment, giving `HEYBUDDY_AUTH_API_BASE_URL` explicit environment values priority. A small resolver in `src/authConfig.ts` will keep runtime and build-time fallback behavior testable and consistent.

**Tech Stack:** Electron Forge, Vite, TypeScript, Vitest, PowerShell Windows build script.

## Global Constraints

- Use the valid HTTPS scheme `https://ai.linyeyun.cn`; the user-provided `htttps://` is treated as a typo.
- Keep local development defaulting to `http://localhost:3001` when no build/runtime value is supplied.
- Do not overwrite the existing uncommitted `Justfile` change.
- Keep the change on branch `feat-remote-server-config`.
- Functional code changes require unit tests; run formatting and the requested packaging verification before claiming completion.

## Task 1: Define and verify URL resolution behavior

**Files:**

- Modify: `ui/desktop/src/authConfig.ts`
- Create: `ui/desktop/src/authConfig.test.ts`

**Interfaces:**

- Produces `resolveAuthApiBaseUrl(environment, fallback)` for the Vite config and runtime config.

- [ ] **Step 1: Write the failing tests**

  Add tests that require explicit environment values to win, blank values to use the fallback, and an omitted value to use the local development fallback:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { resolveAuthApiBaseUrl } from './authConfig';

  describe('resolveAuthApiBaseUrl', () => {
    it('uses HEYBUDDY_AUTH_API_BASE_URL when supplied', () => {
      expect(
        resolveAuthApiBaseUrl({ HEYBUDDY_AUTH_API_BASE_URL: 'https://ai.linyeyun.cn' }),
      ).toBe('https://ai.linyeyun.cn');
    });

    it('uses the fallback when the environment value is blank', () => {
      expect(resolveAuthApiBaseUrl({ HEYBUDDY_AUTH_API_BASE_URL: '   ' })).toBe(
        'http://localhost:3001',
      );
    });

    it('uses the fallback when the environment value is absent', () => {
      expect(resolveAuthApiBaseUrl({})).toBe('http://localhost:3001');
    });
  });
  ```

- [ ] **Step 2: Run the focused test and verify it fails for the missing export**

  Run `cd ui/desktop && pnpm exec vitest run src/authConfig.test.ts`.

  Expected result: the test fails because `resolveAuthApiBaseUrl` is not yet exported.

- [ ] **Step 3: Implement the minimal resolver**

  Export a `resolveAuthApiBaseUrl` function from `authConfig.ts`, use `trim()` to treat whitespace-only values as absent, and use it for the existing runtime `authConfig` initialization with `process.env`.

- [ ] **Step 4: Run the focused test and verify it passes**

  Run `cd ui/desktop && pnpm exec vitest run src/authConfig.test.ts`.

  Expected result: all resolver tests pass.

## Task 2: Load the production value during desktop builds

**Files:**

- Modify: `ui/desktop/vite.main.config.mts`
- Create: `ui/desktop/.env.production`

**Interfaces:**

- Consumes `resolveAuthApiBaseUrl` from Task 1.
- Produces a main-process bundle containing `process.env.HEYBUDDY_AUTH_API_BASE_URL` set to the production value by default.

- [x] **Step 1: Add a build-config test before changing the Vite config**

  Extend `ui/desktop/src/authConfig.test.ts` with a test that resolves a Vite-loaded production value while retaining an explicit shell override:

  ```ts
  it('gives the explicit shell value priority over the production env file', () => {
    expect(
      resolveAuthApiBaseUrl(
        {
          HEYBUDDY_AUTH_API_BASE_URL: 'https://override.example.com',
        },
        'https://ai.linyeyun.cn',
      ),
    ).toBe('https://override.example.com');
  });
  ```

- [x] **Step 2: Run the focused test and verify the new case fails with the current function signature**

  Run `cd ui/desktop && pnpm exec vitest run src/authConfig.test.ts`.

  Expected result: the new test fails because the fallback parameter is not yet supported.

- [x] **Step 3: Implement Vite environment-file loading**

  Update `vite.main.config.mts` to call `loadEnv(mode, process.cwd(), '')`, merge the loaded values first and `process.env` second, and pass the merged environment to `resolveAuthApiBaseUrl` with `http://localhost:3001` as its final fallback. Add `.env.production` containing:

  ```dotenv
  HEYBUDDY_AUTH_API_BASE_URL=https://ai.linyeyun.cn
  ```

  Keep the existing `define` key so the resolved value is compiled into the Electron main process.

- [x] **Step 4: Run focused tests and inspect Vite’s resolved production define**

  Run `cd ui/desktop && pnpm exec vitest run src/authConfig.test.ts` and then `CI=true node scripts/build-main.js`.

  Expected result: the test passes and the main-process build exits with code 0; `.vite/build/main.js` contains `https://ai.linyeyun.cn`.

## Task 3: Package and verify HeyBuddy

**Files:**

- No additional source files; preserve the user’s existing `Justfile` modification.

- [x] **Step 1: Run UI typecheck and focused/full unit tests**

  Run `cd ui/desktop && pnpm run typecheck` and `pnpm run test:run`.

- [x] **Step 2: Run the requested macOS package task**

  Run `just package-ui` from the repository root. This builds the release Goose binary, packages the arm64 Electron app, and applies the existing ad-hoc signing step.

- [x] **Step 3: Verify the package and configuration source**

  Confirm the package command exits successfully, the expected `HeyBuddy.app` exists under `ui/desktop/out/`, and `git status --short` shows only the intended configuration/test changes plus the pre-existing `Justfile` edit.

- [x] **Step 4: Run final formatting and verification**

  Run `cargo fmt --all -- --check`, `cd ui/desktop && pnpm run typecheck`, and `cd ui/desktop && pnpm run test:run`; report any pre-existing failure separately from changes in this branch.
