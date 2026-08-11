import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCredentials, writeCredentials, clearCredentials } from './credentials';

describe('credentials 读写', () => {
  let tmpFile: string;
  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `creds-${Math.random().toString(36).slice(2)}.json`);
  });
  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('文件不存在时 read 返回 null', () => {
    expect(readCredentials(tmpFile)).toBeNull();
  });
  it('write 后 read 能读回', () => {
    const creds = { token: 't', baseUrl: 'https://gw', apiKey: 'k' };
    writeCredentials(tmpFile, creds);
    expect(readCredentials(tmpFile)).toEqual(creds);
  });
  // Windows 上 Unix 权限位不生效，仅在 Linux/macOS 校验 0o600
  it.skipIf(process.platform === 'win32')('write 后文件权限为 0o600', () => {
    writeCredentials(tmpFile, { token: 't', baseUrl: 'u', apiKey: 'k' });
    const mode = fs.statSync(tmpFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });
  it('clear 删除文件', () => {
    writeCredentials(tmpFile, { token: 't', baseUrl: 'u', apiKey: 'k' });
    clearCredentials(tmpFile);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });
  it('clear 文件不存在时不抛异常', () => {
    expect(() => clearCredentials(tmpFile)).not.toThrow();
  });
  it('read 损坏文件返回 null', () => {
    fs.writeFileSync(tmpFile, 'not json');
    expect(readCredentials(tmpFile)).toBeNull();
  });
  it('read 字段类型不匹配返回 null', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ token: 1, baseUrl: 'u', apiKey: 'k' }));
    expect(readCredentials(tmpFile)).toBeNull();
  });
});
