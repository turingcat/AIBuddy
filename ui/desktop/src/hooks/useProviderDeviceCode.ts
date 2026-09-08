import { useEffect, useState } from 'react';
import type { ProviderDeviceCodeNotification_unstable } from '@heybuddy/heybuddy-sdk';

export function useProviderDeviceCode(providerId: string) {
  const [deviceCode, setDeviceCode] = useState<ProviderDeviceCodeNotification_unstable | null>(
    null
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ProviderDeviceCodeNotification_unstable>).detail;
      if (detail.providerId === providerId) {
        setDeviceCode(detail);
      }
    };
    window.addEventListener('heybuddy:device-code', handler);
    return () => window.removeEventListener('heybuddy:device-code', handler);
  }, [providerId]);

  return {
    deviceCode: deviceCode?.providerId === providerId ? deviceCode : null,
    clearDeviceCode: () => setDeviceCode(null),
  };
}
