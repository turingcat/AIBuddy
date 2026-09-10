import { afterEach, expect, it, vi } from 'vitest';

const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
const originalElectron = Object.getOwnPropertyDescriptor(process.versions, 'electron');
afterEach(() => {
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
  else Reflect.deleteProperty(globalThis, 'fetch');
  if (originalElectron) Object.defineProperty(process.versions, 'electron', originalElectron);
  else Reflect.deleteProperty(process.versions, 'electron');
  vi.resetModules();
});

it('installs missing web APIs on Electron 22 and preserves available APIs', async () => {
  Object.defineProperty(process.versions, 'electron', { value: '22.3.27', configurable: true });
  Reflect.deleteProperty(globalThis, 'fetch');
  const response = globalThis.Response;
  await import('./legacyWebGlobals');
  expect(typeof globalThis.fetch).toBe('function');
  expect(globalThis.Response).toBe(response);
});

it('leaves modern Electron APIs unchanged', async () => {
  Object.defineProperty(process.versions, 'electron', { value: '43.4.0', configurable: true });
  const fetch = globalThis.fetch;
  await import('./legacyWebGlobals');
  expect(globalThis.fetch).toBe(fetch);
});
