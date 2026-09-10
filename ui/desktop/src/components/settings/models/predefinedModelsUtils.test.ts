/**
 * @author logic
 * @date 2026-08-11
 * 单元测试：getPredefinedModelsFromEnv 必须接受 appConfig 返回的「已解析数组」，
 * 而不是旧契约下的字符串（Task 6 已将 main.ts 的 getBundledConfig 改为返回数组）。
 * 该测试用真实（非 mock）路径驱动被测函数，覆盖 C1 回归。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getPredefinedModelsFromEnv,
  shouldShowPredefinedModels,
} from './predefinedModelsUtils';

function setAppConfig(value: unknown) {
  (window as unknown as { appConfig: { get: (k: string) => unknown } }).appConfig = {
    get: (key: string) => (key === 'AIBUDDY_PREDEFINED_MODELS' ? value : undefined),
  };
}

function clearAppConfig() {
  delete (window as unknown as { appConfig?: unknown }).appConfig;
}

describe('getPredefinedModelsFromEnv', () => {
  afterEach(() => {
    clearAppConfig();
    vi.restoreAllMocks();
  });

  it('当 appConfig 返回数组时直接返回该数组（C1 回归）', () => {
    const models = [{ name: 'glm-5.2', provider: 'zai' }];
    setAppConfig(models);

    const result = getPredefinedModelsFromEnv();

    expect(result).toEqual(models);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('glm-5.2');
  });

  it('当 appConfig 未定义时返回空数组', () => {
    setAppConfig(undefined);

    expect(getPredefinedModelsFromEnv()).toEqual([]);
  });

  it('当 appConfig.get 抛错时返回空数组', () => {
    (window as unknown as { appConfig: { get: (k: string) => unknown } }).appConfig = {
      get: () => {
        throw new Error('boom');
      },
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getPredefinedModelsFromEnv()).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('shouldShowPredefinedModels 在有数组配置时返回 true', () => {
    setAppConfig([{ name: 'glm-5.2' }]);

    expect(shouldShowPredefinedModels()).toBe(true);
  });
});
