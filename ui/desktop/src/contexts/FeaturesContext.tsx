import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { getAcpFeatureCapabilities } from '../acp/capabilities';

interface FeaturesContextValue {
  localInference: boolean;
  isLoading: boolean;
}

const FeaturesContext = createContext<FeaturesContextValue | null>(null);

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  // 阶段一：桌面版不提供本地推理，强制关闭
  const localInference = false;
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await getAcpFeatureCapabilities();
      } catch (error) {
        console.warn('[FeaturesContext] Failed to fetch features:', error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const value = useMemo<FeaturesContextValue>(
    () => ({
      localInference,
      isLoading,
    }),
    [localInference, isLoading]
  );

  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

export function useFeatures(): FeaturesContextValue {
  const context = useContext(FeaturesContext);
  if (!context) {
    throw new Error('useFeatures must be used within a FeaturesProvider');
  }
  return context;
}
