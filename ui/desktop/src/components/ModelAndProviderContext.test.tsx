/** @vitest-environment jsdom */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../i18n/test-utils';
import { ModelAndProviderProvider, useModelAndProvider } from './ModelAndProviderContext';
import type Model from './settings/models/modelInterface';

const mocks = vi.hoisted(() => ({
  readDefaults: vi.fn(),
  saveDefaults: vi.fn(),
  listModelsViaApi: vi.fn(),
  appConfigGet: vi.fn(),
  setSessionProviderModel: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  getProviderMetadata: vi.fn(),
  getModelDisplayName: vi.fn(),
  getProviderDisplayName: vi.fn(),
  getSnapshot: vi.fn(),
  setSessionMetadata: vi.fn(),
}));
const originalAppConfig = window.appConfig;
const originalElectron = window.electron;

vi.mock('../acp/providers', () => ({
  acpReadDefaults: mocks.readDefaults,
  acpSaveDefaults: mocks.saveDefaults,
  acpSetSessionProviderModel: mocks.setSessionProviderModel,
}));

vi.mock('../toasts', () => ({
  toastError: mocks.toastError,
  toastSuccess: mocks.toastSuccess,
}));

vi.mock('./settings/models/modelInterface', () => ({
  getProviderMetadata: mocks.getProviderMetadata,
}));

vi.mock('./settings/models/predefinedModelsUtils', () => ({
  getModelDisplayName: mocks.getModelDisplayName,
  getProviderDisplayName: mocks.getProviderDisplayName,
}));

vi.mock('../acp/chatSessionStore', () => ({
  acpChatSessionActions: { setSessionMetadata: mocks.setSessionMetadata },
  acpChatSessionStore: { getSnapshot: mocks.getSnapshot },
}));

function ContextConsumer() {
  const { currentModel, currentProvider } = useModelAndProvider();
  return (
    <>
      <output data-testid="current-provider">{currentProvider}</output>
      <output data-testid="current-model">{currentModel}</output>
    </>
  );
}

function renderContext() {
  return render(
    <IntlTestWrapper>
      <ModelAndProviderProvider>
        <ContextConsumer />
      </ModelAndProviderProvider>
    </IntlTestWrapper>
  );
}

function ContextWrapper({ children }: { children: ReactNode }) {
  return (
    <IntlTestWrapper>
      <ModelAndProviderProvider>{children}</ModelAndProviderProvider>
    </IntlTestWrapper>
  );
}

function renderContextHook() {
  return renderHook(() => useModelAndProvider(), { wrapper: ContextWrapper });
}

function testModel(overrides: Record<string, unknown> = {}): Model {
  return {
    name: 'new-model',
    provider: 'aibuddy',
    alias: 'New Model',
    subtext: 'AIBuddy',
    ...overrides,
  } as unknown as Model;
}

describe('ModelAndProviderProvider fallback defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readDefaults.mockResolvedValue({ providerId: null, modelId: null });
    mocks.saveDefaults.mockResolvedValue(undefined);
    mocks.listModelsViaApi.mockResolvedValue([]);
    mocks.setSessionProviderModel.mockResolvedValue({
      providerId: 'aibuddy',
      modelId: 'new-model',
    });
    mocks.getProviderMetadata.mockResolvedValue({ display_name: 'AIBuddy Cloud' });
    mocks.getModelDisplayName.mockReturnValue('');
    mocks.getProviderDisplayName.mockReturnValue('');
    mocks.getSnapshot.mockReturnValue(undefined);
    mocks.appConfigGet.mockImplementation((key: string) =>
      key === 'AIBUDDY_DEFAULT_PROVIDER' ? 'aibuddy' : undefined
    );

    (window as unknown as { appConfig: { get: typeof mocks.appConfigGet } }).appConfig = {
      get: mocks.appConfigGet,
    };
    (window as unknown as { electron: Record<string, unknown> }).electron = {
      ...(window as unknown as { electron: Record<string, unknown> }).electron,
      listModelsViaApi: mocks.listModelsViaApi,
    };
  });

  afterEach(() => {
    window.appConfig = originalAppConfig;
    window.electron = originalElectron;
  });

  it('keeps a complete persisted default without loading or saving another model', async () => {
    mocks.readDefaults.mockResolvedValue({
      providerId: 'existing-provider',
      modelId: 'existing-model',
    });

    renderContext();

    await waitFor(() => {
      expect(screen.getByTestId('current-provider')).toHaveTextContent('existing-provider');
      expect(screen.getByTestId('current-model')).toHaveTextContent('existing-model');
    });
    expect(mocks.listModelsViaApi).not.toHaveBeenCalled();
    expect(mocks.saveDefaults).not.toHaveBeenCalled();
  });

  it('persists the first loaded model when no complete default exists', async () => {
    mocks.listModelsViaApi.mockResolvedValue([
      { id: 'first-model', name: 'First model', contextLimit: 128000, reasoning: true },
      { id: 'second-model', name: 'Second model', contextLimit: 128000, reasoning: false },
    ]);

    renderContext();

    await waitFor(() => {
      expect(mocks.saveDefaults).toHaveBeenCalledWith('aibuddy', 'first-model');
      expect(screen.getByTestId('current-model')).toHaveTextContent('first-model');
    });
    expect(mocks.listModelsViaApi).toHaveBeenCalledTimes(1);
    expect(mocks.saveDefaults).toHaveBeenCalledTimes(1);
  });

  it('uses AIBuddy for the first loaded model when the configured provider is missing', async () => {
    mocks.appConfigGet.mockReturnValue(undefined);
    mocks.listModelsViaApi.mockResolvedValue([
      { id: 'first-model', name: 'First model', contextLimit: 128000, reasoning: true },
    ]);

    renderContext();

    await waitFor(() => {
      expect(mocks.saveDefaults).toHaveBeenCalledWith('aibuddy', 'first-model');
      expect(screen.getByTestId('current-provider')).toHaveTextContent('aibuddy');
      expect(screen.getByTestId('current-model')).toHaveTextContent('first-model');
    });
  });

  it('keeps the existing incomplete fallback when the model list is empty', async () => {
    renderContext();

    await waitFor(() => expect(mocks.listModelsViaApi).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('current-provider')).toHaveTextContent('aibuddy');
    expect(screen.getByTestId('current-model')).toBeEmptyDOMElement();
    expect(mocks.saveDefaults).not.toHaveBeenCalled();
  });

  it('keeps the existing incomplete fallback when loading the model list fails', async () => {
    mocks.listModelsViaApi.mockRejectedValue(new Error('network unavailable'));

    renderContext();

    await waitFor(() => expect(mocks.listModelsViaApi).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('current-provider')).toHaveTextContent('aibuddy');
    expect(screen.getByTestId('current-model')).toBeEmptyDOMElement();
    expect(mocks.saveDefaults).not.toHaveBeenCalled();
  });
});

describe('ModelAndProviderProvider actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readDefaults.mockResolvedValue({
      providerId: 'existing-provider',
      modelId: 'existing-model',
    });
    mocks.saveDefaults.mockResolvedValue(undefined);
    mocks.listModelsViaApi.mockResolvedValue([]);
    mocks.appConfigGet.mockReturnValue(undefined);
    mocks.setSessionProviderModel.mockResolvedValue({
      providerId: 'aibuddy',
      modelId: 'new-model',
    });
    mocks.getProviderMetadata.mockResolvedValue({ display_name: 'AIBuddy Cloud' });
    mocks.getModelDisplayName.mockReturnValue('Model Five');
    mocks.getProviderDisplayName.mockReturnValue('AIBuddy');
    mocks.getSnapshot.mockReturnValue(undefined);

    (window as unknown as { appConfig: { get: typeof mocks.appConfigGet } }).appConfig = {
      get: mocks.appConfigGet,
    };
    (window as unknown as { electron: Record<string, unknown> }).electron = {
      ...(window as unknown as { electron: Record<string, unknown> }).electron,
      listModelsViaApi: mocks.listModelsViaApi,
    };
  });

  afterEach(() => {
    window.appConfig = originalAppConfig;
    window.electron = originalElectron;
  });

  it('rejects use outside the provider', () => {
    expect(() => renderHook(() => useModelAndProvider())).toThrow(
      'useModelAndProvider must be used within a ModelAndProviderProvider'
    );
  });

  it('changes the global default and updates the displayed selection', async () => {
    const { result } = renderContextHook();
    await waitFor(() => expect(result.current.currentModel).toBe('existing-model'));

    let changed = false;
    await act(async () => {
      changed = await result.current.changeModel(null, testModel());
    });

    expect(changed).toBe(true);
    expect(mocks.saveDefaults).toHaveBeenCalledWith('aibuddy', 'new-model');
    expect(result.current.currentProvider).toBe('aibuddy');
    expect(result.current.currentModel).toBe('new-model');
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('changes only the active session and patches its metadata', async () => {
    mocks.getSnapshot.mockReturnValue({
      session: { provider_name: 'old-provider', model_config: null },
    });
    const { result } = renderContextHook();
    await waitFor(() => expect(result.current.currentModel).toBe('existing-model'));

    let changed = false;
    await act(async () => {
      changed = await result.current.changeModel(
        'session-1',
        testModel({ request_params: { thinking_effort: 'high' } })
      );
    });

    expect(changed).toBe(true);
    expect(mocks.setSessionProviderModel).toHaveBeenCalledWith(
      'session-1',
      'aibuddy',
      'new-model',
      'high'
    );
    expect(mocks.setSessionMetadata).toHaveBeenCalledWith('session-1', {
      provider_name: 'aibuddy',
      model_config: { toolshim: false, model_name: 'new-model' },
    });
    expect(mocks.saveDefaults).not.toHaveBeenCalled();
    expect(result.current.currentModel).toBe('existing-model');
  });

  it('reports a failed global model change without changing state', async () => {
    mocks.saveDefaults.mockRejectedValueOnce(new Error('write failed'));
    const { result } = renderContextHook();
    await waitFor(() => expect(result.current.currentModel).toBe('existing-model'));

    let changed = true;
    await act(async () => {
      changed = await result.current.changeModel(null, testModel());
    });

    expect(changed).toBe(false);
    expect(result.current.currentModel).toBe('existing-model');
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it('resolves model, provider, and metadata display names', async () => {
    const { result } = renderContextHook();
    await waitFor(() => expect(result.current.currentModel).toBe('existing-model'));

    await expect(result.current.getCurrentModelDisplayName()).resolves.toBe('Model Five');
    await expect(result.current.getCurrentProviderDisplayName()).resolves.toBe('AIBuddy');
    await expect(result.current.getCurrentModelAndProviderForDisplay()).resolves.toEqual({
      model: 'existing-model',
      provider: 'AIBuddy Cloud',
    });

    mocks.getProviderMetadata.mockRejectedValueOnce(new Error('unknown provider'));
    await expect(result.current.getCurrentModelAndProviderForDisplay()).resolves.toEqual({
      model: 'existing-model',
      provider: 'existing-provider',
    });
  });
});
