import { safeStorage } from 'electron';

/**
 * @author: logic
 * @date: 2026-08-27
 * 登录凭证的加解密编解码：经 Electron safeStorage 使用系统级加密
 * （Windows DPAPI / macOS Keychain），Linux 上系统加密不可用时回退明文。
 * 本模块是凭证链路中唯一触碰 electron API 的位置，惰性初始化保证
 * 首次调用发生在 app ready 之后。
 */

let cachedCodec: CredentialsCodec | null = null;
let warnedNoEncryption = false;

export interface CredentialsCodec {
  encrypt(plain: string): string;
  decrypt(blob: string): string | null;
}

export function getCredentialsCodec(): CredentialsCodec {
  if (cachedCodec) return cachedCodec;

  if (!safeStorage.isEncryptionAvailable()) {
    if (!warnedNoEncryption) {
      console.warn('系统加密不可用（safeStorage.isEncryptionAvailable=false），登录凭证将以明文存储（权限 0o600）');
      warnedNoEncryption = true;
    }
    cachedCodec = {
      encrypt: (plain) => plain,
      decrypt: (blob) => blob,
    };
    return cachedCodec;
  }

  cachedCodec = {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (blob) => {
      try {
        return safeStorage.decryptString(Buffer.from(blob, 'base64'));
      } catch {
        return null;
      }
    },
  };
  return cachedCodec;
}
