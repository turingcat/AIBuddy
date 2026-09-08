import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAbsoluteHeyBuddyPath, resolveHeyBuddyPathRoot, sanitizeHeyBuddyPathRoot } from './pathUtils';

describe('resolveHeyBuddyPathRoot', () => {
  it('rejects empty and relative values', () => {
    expect(resolveHeyBuddyPathRoot(undefined)).toBeUndefined();
    expect(resolveHeyBuddyPathRoot('   ')).toBeUndefined();
    expect(resolveHeyBuddyPathRoot('relative/root')).toBeUndefined();
  });

  it('retains absolute paths without requiring them to exist', () => {
    const absolute = path.resolve('nonexistent-heybuddy-root');
    expect(resolveHeyBuddyPathRoot(`  ${absolute}  `)).toBe(absolute);
  });

  it('expands a home-relative root before validation', () => {
    expect(resolveHeyBuddyPathRoot('~')).toBe(os.homedir());
  });

  it('removes a rejected value from the child-process environment', () => {
    const env = { HEYBUDDY_PATH_ROOT: 'relative/root' };
    expect(sanitizeHeyBuddyPathRoot(env)).toBeUndefined();
    expect(env).not.toHaveProperty('HEYBUDDY_PATH_ROOT');
  });

  it('matches Rust absolute-path handling on Windows', () => {
    expect(isAbsoluteHeyBuddyPath('C:\\heybuddy\\root', 'win32')).toBe(true);
    expect(isAbsoluteHeyBuddyPath('\\\\server\\share\\heybuddy', 'win32')).toBe(true);
    expect(isAbsoluteHeyBuddyPath('C:heybuddy\\root', 'win32')).toBe(false);
    expect(isAbsoluteHeyBuddyPath('\\heybuddy\\root', 'win32')).toBe(false);
    expect(isAbsoluteHeyBuddyPath('/heybuddy/root', 'win32')).toBe(false);
  });
});
