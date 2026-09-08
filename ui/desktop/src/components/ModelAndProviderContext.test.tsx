/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../i18n/test-utils';
import { ModelAndProviderProvider, useModelAndProvider } from './ModelAndProviderContext';

const mocks = vi.hoisted(() => ({
  readDefaults: vi.fn(),
  saveDefaults: vi.fn(),
  listModelsViaApi: vi.fn(),
  appConfigGet: vi.fn(),
}));
const originalAppConfig = window.appConfig;
const originalElectron = window.electron;

vi.mock('../acp/providers', () => ({
  acpReadDefaults: mocks.readDefaults,
  acpSaveDefaults: mocks.saveDefaults,
  acpSetSessionProviderModel: vi.fn(),
}));

vi.mock('../toasts', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('./settings/models/modelInterface', () => ({
  getProviderMetadata: vi.fn(),
}));

vi.mock('./settings/models/predefinedModelsUtils', () => ({
  getModelDisplayName: vi.fn(),
  getProviderDisplayName: vi.fn(),
}));

vi.mock('../acp/chatSessionStore', () => ({
  acpChatSessionActions: { setSessionMetadata: vi.fn() },
  acpChatSessionStore: { getSnapshot: vi.fn() },
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

describe('ModelAndProviderProvider fallback defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readDefaults.mockResolvedValue({ providerId: null, modelId: null });
    mocks.saveDefaults.mockResolvedValue(undefined);
    mocks.listModelsViaApi.mockResolvedValue([]);
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
    mocks.readDefaults.mockResolvedValue({ providerId: 'existing-provider', modelId: 'existing-model' });

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
