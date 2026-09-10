import path from 'node:path';
import os from 'node:os';

/**
 * Expands tilde (~) to the user's home directory
 * @param filePath - The file path that may contain tilde
 * @returns The expanded path with tilde replaced by home directory
 */
export function expandTilde(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') return filePath;
  // Support "~", "~/..." and "~\\..." on Windows
  if (filePath === '~') {
    return os.homedir();
  }
  if (filePath.startsWith('~/') || (process.platform === 'win32' && filePath.startsWith('~\\'))) {
    // Remove the leading "~" and any separator that follows, then join
    const remainder = filePath.slice(2);
    return path.join(os.homedir(), remainder);
  }
  if (filePath.startsWith('~')) {
    // Generic fallback: replace only the first leading tilde
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

export function resolveAIBuddyPathRoot(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const expanded = expandTilde(trimmed);
  return isAbsoluteAIBuddyPath(expanded) ? expanded : undefined;
}

export function isAbsoluteAIBuddyPath(
  filePath: string,
  platform: 'win32' | 'posix' = process.platform === 'win32' ? 'win32' : 'posix'
): boolean {
  if (platform !== 'win32') {
    return path.posix.isAbsolute(filePath);
  }

  const root = path.win32.parse(filePath).root;
  return path.win32.isAbsolute(filePath) && root.length > 1;
}

export function sanitizeAIBuddyPathRoot(env: { AIBUDDY_PATH_ROOT?: string }): string | undefined {
  const pathRoot = resolveAIBuddyPathRoot(env.AIBUDDY_PATH_ROOT);
  if (pathRoot) {
    env.AIBUDDY_PATH_ROOT = pathRoot;
  } else {
    delete env.AIBUDDY_PATH_ROOT;
  }
  return pathRoot;
}
