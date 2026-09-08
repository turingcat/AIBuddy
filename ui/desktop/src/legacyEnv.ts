export const LEGACY_HEYBUDDY_ENV_ALIASES = [
  ['GOOSE_ALLOWLIST', 'HEYBUDDY_ALLOWLIST'],
  ['GOOSE_ALLOWLIST_WARNING', 'HEYBUDDY_ALLOWLIST_WARNING'],
  ['GOOSE_BINARY', 'HEYBUDDY_BINARY'],
  ['GOOSE_DEFAULT_MODEL', 'HEYBUDDY_DEFAULT_MODEL'],
  ['GOOSE_DEFAULT_PROVIDER', 'HEYBUDDY_DEFAULT_PROVIDER'],
  ['GOOSE_DISABLE_NOSTR_SHARING', 'HEYBUDDY_DISABLE_NOSTR_SHARING'],
  ['GOOSE_EXTERNAL_BACKEND', 'HEYBUDDY_EXTERNAL_BACKEND'],
  ['GOOSE_EXTERNAL_BACKEND_URL', 'HEYBUDDY_EXTERNAL_BACKEND_URL'],
  ['GOOSE_LOCALE', 'HEYBUDDY_LOCALE'],
  ['GOOSE_PATH_ROOT', 'HEYBUDDY_PATH_ROOT'],
  ['GOOSE_PORT', 'HEYBUDDY_PORT'],
  ['GOOSE_SERVER__SECRET_KEY', 'HEYBUDDY_SERVER__SECRET_KEY'],
  ['GOOSE_VERSION', 'HEYBUDDY_VERSION'],
] as const;

type Environment = Record<string, string | undefined>;

export function applyLegacyHeyBuddyEnvironment(environment: Environment): void {
  for (const [legacyKey, canonicalKey] of LEGACY_HEYBUDDY_ENV_ALIASES) {
    if (environment[canonicalKey] === undefined && environment[legacyKey] !== undefined) {
      environment[canonicalKey] = environment[legacyKey];
    }
  }
}
