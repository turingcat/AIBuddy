import { expectTypeOf } from 'vitest';
import type { AIBuddyAuthResult } from './aibuddyAuthIpc';
import type { BalanceResult } from './balance';
import type { ElectronAPI } from './preload';
import type { AIBuddySettingsResult } from './sub2apiAuth';

expectTypeOf<ElectronAPI>().toHaveProperty('getLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('isLoggedIn').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('setLoginCredentials').toBeFunction();
expectTypeOf<ElectronAPI>().toHaveProperty('clearLoginCredentials').toBeFunction();
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
