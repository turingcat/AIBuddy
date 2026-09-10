export const LEGACY_AIBUDDY_ENV_ALIASES = [
  ['GOOSE_ALLOWLIST', 'AIBUDDY_ALLOWLIST'],
  ['GOOSE_ALLOWLIST_WARNING', 'AIBUDDY_ALLOWLIST_WARNING'],
  ['GOOSE_BINARY', 'AIBUDDY_BINARY'],
  ['GOOSE_DEFAULT_MODEL', 'AIBUDDY_DEFAULT_MODEL'],
  ['GOOSE_DEFAULT_PROVIDER', 'AIBUDDY_DEFAULT_PROVIDER'],
  ['GOOSE_DISABLE_NOSTR_SHARING', 'AIBUDDY_DISABLE_NOSTR_SHARING'],
  ['GOOSE_EXTERNAL_BACKEND', 'AIBUDDY_EXTERNAL_BACKEND'],
  ['GOOSE_EXTERNAL_BACKEND_URL', 'AIBUDDY_EXTERNAL_BACKEND_URL'],
  ['GOOSE_LOCALE', 'AIBUDDY_LOCALE'],
  ['GOOSE_PATH_ROOT', 'AIBUDDY_PATH_ROOT'],
  ['GOOSE_PORT', 'AIBUDDY_PORT'],
  ['GOOSE_SERVER__SECRET_KEY', 'AIBUDDY_SERVER__SECRET_KEY'],
  ['GOOSE_VERSION', 'AIBUDDY_VERSION'],
] as const;

type Environment = Record<string, string | undefined>;

export function applyLegacyAIBuddyEnvironment(environment: Environment): void {
  for (const [legacyKey, canonicalKey] of LEGACY_AIBUDDY_ENV_ALIASES) {
    if (environment[canonicalKey] === undefined && environment[legacyKey] !== undefined) {
      environment[canonicalKey] = environment[legacyKey];
    }
  }
}
