/**
 * @author logic
 * @date 2026-08-11
 * 登录态 IPC 通道类型断言：确认 ElectronAPI 上暴露了 4 个登录凭证相关方法。
 * 该文件仅参与 tsc 类型检查（typecheck），不参与 vitest 运行时测试。
 */
import { expectTypeOf } from 'vitest';
import type { ElectronAPI } from './preload';

expectTypeOf<ElectronAPI>().toHaveProperty('getLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('isLoggedIn').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('setLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('clearLoginCredentials').toBeFunction();
