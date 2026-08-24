/**
 * @author logic
 * @date 2026-08-11
 * 登录态 IPC 通道类型断言：确认 ElectronAPI 上暴露了登录凭证相关方法，
 * loginViaOA 返回 result 模式类型 OaLoginResult。
 * 该文件仅参与 tsc 类型检查（typecheck），不参与 vitest 运行时测试。
 * 2026-08-24 增补 getUserBalance（余额查询，返回 BalanceResult）。
 */
import { expectTypeOf } from 'vitest';
import type { ElectronAPI } from './preload';
import type { OaLoginResult } from './oaLogin';
import type { BalanceResult } from './balance';

expectTypeOf<ElectronAPI>().toHaveProperty('getLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('isLoggedIn').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('setLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('clearLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('loginViaOA').toBeFunction();
expectTypeOf<ElectronAPI['loginViaOA']>().returns.toEqualTypeOf<Promise<OaLoginResult>>();
expectTypeOf<ElectronAPI>().toHaveProperty('getUserBalance').toBeFunction();
expectTypeOf<ElectronAPI['getUserBalance']>().returns.toEqualTypeOf<Promise<BalanceResult>>();
