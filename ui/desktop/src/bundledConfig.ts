/**
 * 预定义模型解析：阶段一为占位空数组，阶段三由服务端下发模型列表替代。
 *
 * @author: logic
 * @date: 2026-08-11
 */

export interface PredefinedModel {
  name: string;
}

export function resolvePredefinedModels(envValue: string | undefined): PredefinedModel[] {
  if (!envValue) return [];
  try {
    const parsed = JSON.parse(envValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
