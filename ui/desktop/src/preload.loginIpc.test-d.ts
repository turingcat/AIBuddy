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
import type { AIBuddyAuthResult } from './aibuddyAuthIpc';
import type { AIBuddySettingsResult } from './sub2apiAuth';

expectTypeOf<ElectronAPI>().toHaveProperty('getLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('isLoggedIn').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('setLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('clearLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('loginViaOA').toBeFunction();
expectTypeOf<ElectronAPI['loginViaOA']>().returns.toEqualTypeOf<Promise<OaLoginResult>>();
expectTypeOf<ElectronAPI>().toHaveProperty('getAIBuddyAuthSettings').toBeFunction();
expectTypeOf<ElectronAPI['getAIBuddyAuthSettings']>().returns.toEqualTypeOf<
  Promise<AIBuddySettingsResult>
>();
expectTypeOf<ElectronAPI>().toHaveProperty('loginViaAIBuddy').toBeFunction();
expectTypeOf<ElectronAPI['loginViaAIBuddy']>().returns.toEqualTypeOf<Promise<AIBuddyAuthResult>>();
expectTypeOf<ElectronAPI>().toHaveProperty('completeAIBuddy2FA').toBeFunction();
expectTypeOf<ElectronAPI['completeAIBuddy2FA']>().returns.toEqualTypeOf<
  Promise<AIBuddyAuthResult>
>();
expectTypeOf<ElectronAPI>().toHaveProperty('provisionAIBuddyGroup').toBeFunction();
expectTypeOf<ElectronAPI['provisionAIBuddyGroup']>().returns.toEqualTypeOf<
  Promise<AIBuddyAuthResult>
>();
expectTypeOf<ElectronAPI>().toHaveProperty('getUserBalance').toBeFunction();
expectTypeOf<ElectronAPI['getUserBalance']>().returns.toEqualTypeOf<Promise<BalanceResult>>();
