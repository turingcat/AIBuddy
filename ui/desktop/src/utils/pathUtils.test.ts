import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAbsoluteAIBuddyPath, resolveAIBuddyPathRoot, sanitizeAIBuddyPathRoot } from './pathUtils';

describe('resolveAIBuddyPathRoot', () => {
  it('rejects empty and relative values', () => {
    expect(resolveAIBuddyPathRoot(undefined)).toBeUndefined();
    expect(resolveAIBuddyPathRoot('   ')).toBeUndefined();
    expect(resolveAIBuddyPathRoot('relative/root')).toBeUndefined();
  });

  it('retains absolute paths without requiring them to exist', () => {
    const absolute = path.resolve('nonexistent-aibuddy-root');
    expect(resolveAIBuddyPathRoot(`  ${absolute}  `)).toBe(absolute);
  });

  it('expands a home-relative root before validation', () => {
    expect(resolveAIBuddyPathRoot('~')).toBe(os.homedir());
  });

  it('removes a rejected value from the child-process environment', () => {
    const env = { AIBUDDY_PATH_ROOT: 'relative/root' };
    expect(sanitizeAIBuddyPathRoot(env)).toBeUndefined();
    expect(env).not.toHaveProperty('AIBUDDY_PATH_ROOT');
  });

  it('matches Rust absolute-path handling on Windows', () => {
    expect(isAbsoluteAIBuddyPath('C:\\aibuddy\\root', 'win32')).toBe(true);
    expect(isAbsoluteAIBuddyPath('\\\\server\\share\\aibuddy', 'win32')).toBe(true);
    expect(isAbsoluteAIBuddyPath('C:aibuddy\\root', 'win32')).toBe(false);
    expect(isAbsoluteAIBuddyPath('\\aibuddy\\root', 'win32')).toBe(false);
    expect(isAbsoluteAIBuddyPath('/aibuddy/root', 'win32')).toBe(false);
  });
});
