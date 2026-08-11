import Model from './modelInterface';

export function getPredefinedModelsFromEnv(): Model[] {
  try {
    const envModels = window.appConfig.get('GOOSE_PREDEFINED_MODELS');
    if (Array.isArray(envModels)) return envModels as Model[];
  } catch (error) {
    console.warn('Failed to parse GOOSE_PREDEFINED_MODELS:', error);
  }
  return [];
}

export function shouldShowPredefinedModels(): boolean {
  return getPredefinedModelsFromEnv().length > 0;
}

export function getModelDisplayName(modelName: string): string {
  const predefinedModels = getPredefinedModelsFromEnv();
  const matchingModel = predefinedModels.find((model) => model.name === modelName);
  return matchingModel?.alias || modelName;
}

export function getProviderDisplayName(modelName: string): string {
  const predefinedModels = getPredefinedModelsFromEnv();
  const matchingModel = predefinedModels.find((model) => model.name === modelName);
  return matchingModel?.subtext || '';
}
