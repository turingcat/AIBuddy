import { describe, it, expect } from 'vitest';
import { resolvePredefinedModels } from './bundledConfig';

describe('resolvePredefinedModels', () => {
  it('环境变量为 undefined 时返回空数组', () => {
    expect(resolvePredefinedModels(undefined)).toEqual([]);
  });

  it('环境变量为空字符串时返回空数组', () => {
    expect(resolvePredefinedModels('')).toEqual([]);
  });

  it('环境变量为合法 JSON 数组时解析返回', () => {
    expect(resolvePredefinedModels('[{"name":"glm-5.2"}]')).toEqual([
      { name: 'glm-5.2' },
    ]);
  });

  it('环境变量为多元素 JSON 数组时完整解析', () => {
    const input = '[{"name":"a"},{"name":"b","alias":"B"}]';
    expect(resolvePredefinedModels(input)).toEqual([
      { name: 'a' },
      { name: 'b', alias: 'B' },
    ]);
  });

  it('环境变量为空 JSON 数组时返回空数组', () => {
    expect(resolvePredefinedModels('[]')).toEqual([]);
  });

  it('环境变量为非法 JSON 时返回空数组', () => {
    expect(resolvePredefinedModels('not-json')).toEqual([]);
  });

  it('环境变量为合法 JSON 但非数组（对象）时返回空数组', () => {
    expect(resolvePredefinedModels('{"name":"x"}')).toEqual([]);
  });

  it('环境变量为合法 JSON 但非数组（数字）时返回空数组', () => {
    expect(resolvePredefinedModels('42')).toEqual([]);
  });
});
