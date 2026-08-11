/**
 * @author: logic
 * @date: 2026-08-11
 * 阶段一：验证 SwitchModelModal 已锁定 predefined 分支，
 * 即使 shouldShowPredefinedModels 返回 false（env 未配置），
 * 也只渲染预定义模型名 radio 列表，不渲染 provider 下拉与 custom 模型输入。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlTestWrapper } from '../../../../i18n/test-utils';

vi.mock('../../../../acp/providers', () => ({
  acpListProviderDetails: vi.fn().mockResolvedValue([]),
  acpReadThinkingEffort: vi.fn().mockResolvedValue(null),
  acpSaveThinkingEffort: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../ModelAndProviderContext', () => ({
  useModelAndProvider: () => ({
    currentModel: null,
    currentProvider: null,
    changeModel: vi.fn().mockResolvedValue(true),
  }),
}));

// 故意让 shouldShowPredefinedModels 返回 false，验证「锁定」语义：
// 即使 env 未配置，组件仍应渲染 predefined 分支。
vi.mock('../predefinedModelsUtils', () => ({
  shouldShowPredefinedModels: () => false,
  getPredefinedModelsFromEnv: () => [
    { id: 'glm-5.2', name: 'glm-5.2', provider: 'zai', subtext: 'ZAI' },
    { id: 'glm-4.6', name: 'glm-4.6', provider: 'zai', subtext: 'ZAI' },
  ],
}));

import { SwitchModelModal } from './SwitchModelModal';

const renderModal = () =>
  render(
    <IntlTestWrapper>
      <SwitchModelModal sessionId={null} onClose={() => {}} setView={() => {}} />
    </IntlTestWrapper>
  );

describe('SwitchModelModal 锁定 predefined', () => {
  it('只渲染预定义模型名，不渲染 provider 下拉与 custom 输入', () => {
    renderModal();

    // predefined 分支独有：模型名 radio 列表
    expect(screen.getByText('glm-5.2')).toBeInTheDocument();
    expect(screen.getByText('glm-4.6')).toBeInTheDocument();
    expect(screen.getByText('Choose a model:')).toBeInTheDocument();

    // 非 predefined 分支的 UI 不应出现
    expect(screen.queryByPlaceholderText('Provider, type to search')).not.toBeInTheDocument();
    expect(screen.queryByText('Enter a model not listed...')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom model name')).not.toBeInTheDocument();
    expect(screen.queryByText('Back to model list')).not.toBeInTheDocument();
  });
});
