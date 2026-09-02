/**
 * @author: logic
 * @date: 2026-08-12
 * SwitchModelModal 动态模型列表单测：模型来自主进程 fetch new-api /v1/models（listModelsViaApi IPC）。
 * 路径覆盖：P1 有模型→显示 / P2 无凭证→空列表 / P3 currentModel匹配→选中
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlTestWrapper } from '../../../../i18n/test-utils';

const mockState = vi.hoisted(() => ({
  currentProvider: 'aibuddy' as string | null,
  currentModel: null as string | null,
  changeModel: vi.fn().mockResolvedValue(true),
}));

const mockListModels = vi.fn();

vi.mock('../../../../acp/providers', () => ({
  acpListProviderDetails: vi.fn().mockResolvedValue([]),
  acpReadThinkingEffort: vi.fn().mockResolvedValue(null),
  acpSaveThinkingEffort: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../ModelAndProviderContext', () => ({
  useModelAndProvider: () => ({
    currentModel: mockState.currentModel,
    currentProvider: mockState.currentProvider,
    changeModel: mockState.changeModel,
  }),
}));

import { SwitchModelModal } from './SwitchModelModal';

const renderModal = () =>
  render(
    <IntlTestWrapper>
      <SwitchModelModal sessionId={null} onClose={() => {}} setView={() => {}} />
    </IntlTestWrapper>
  );

const reset = (provider: string | null = 'aibuddy', model: string | null = null) => {
  vi.clearAllMocks();
  mockState.currentProvider = provider;
  mockState.currentModel = model;
  (window as unknown as { electron: Record<string, unknown> }).electron = {
    ...(window as unknown as { electron: Record<string, unknown> }).electron,
    listModelsViaApi: mockListModels,
  };
};

describe('SwitchModelModal 动态模型列表（new-api /v1/models）', () => {
  it('P1: 渲染 listModelsViaApi 返回的所有模型', async () => {
    reset('aibuddy');
    mockListModels.mockResolvedValue([
      { id: 'glm-5.2', name: 'glm-5.2', contextLimit: 131072, reasoning: true },
      { id: 'glm-4.6', name: 'glm-4.6', contextLimit: 204800, reasoning: null },
    ]);
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('glm-5.2')).toBeInTheDocument();
      expect(screen.getByText('glm-4.6')).toBeInTheDocument();
    });
  });

  it('P2: listModelsViaApi 返回空时列表为空', async () => {
    reset('aibuddy');
    mockListModels.mockResolvedValue([]);
    renderModal();
    await waitFor(() => expect(mockListModels).toHaveBeenCalled());
    expect(screen.queryByText('glm-5.2')).not.toBeInTheDocument();
  });

  it('P3: currentModel 匹配时选中对应 radio', async () => {
    reset('aibuddy', 'glm-4.6');
    mockListModels.mockResolvedValue([
      { id: 'glm-5.2', name: 'glm-5.2', contextLimit: null, reasoning: null },
      { id: 'glm-4.6', name: 'glm-4.6', contextLimit: null, reasoning: null },
    ]);
    renderModal();
    await waitFor(() => expect(screen.getByDisplayValue('glm-4.6')).toBeChecked());
  });

  it('uses AIBuddy when a listed model has no provider metadata', async () => {
    reset(null);
    mockListModels.mockResolvedValue([
      { id: 'glm-5.2', name: 'glm-5.2', contextLimit: 131072, reasoning: true },
    ]);
    renderModal();

    await userEvent.click(await screen.findByDisplayValue('glm-5.2'));
    await userEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(mockState.changeModel).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ name: 'glm-5.2', provider: 'aibuddy' })
    );
  });
});
