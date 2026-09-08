/**
 * @author: logic
 * @date: 2026-08-11
 * 阶段一：验证 ModelsSection 不再渲染 ResetProviderSection，
 * 进而「Reset Provider and Model」按钮在设置页不可见，
 * 避免用户清空受控注入的 provider/model 配置。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlTestWrapper } from '../../../i18n/test-utils';

vi.mock('../../../acp/providers', () => ({
  acpListProviderDetails: vi.fn().mockResolvedValue([]),
  acpReadDefaults: vi.fn().mockResolvedValue({
    providerId: 'aibuddy',
    modelId: 'glm-5.2',
  }),
}));

vi.mock('../../ModelAndProviderContext', () => ({
  useModelAndProvider: () => ({
    currentModel: 'glm-5.2',
    currentProvider: 'aibuddy',
    getCurrentModelDisplayName: vi.fn().mockResolvedValue('glm-5.2'),
    getCurrentProviderDisplayName: vi.fn().mockResolvedValue('AIBuddy'),
  }),
  modelAndProviderMessages: {
    unknownProviderTitle: { id: 'x', defaultMessage: 'x' },
    unknownProviderMsg: { id: 'y', defaultMessage: 'y' },
  },
}));

import ModelsSection from './ModelsSection';

const renderSection = () =>
  render(
    <IntlTestWrapper>
      <ModelsSection setView={vi.fn()} />
    </IntlTestWrapper>
  );

describe('ModelsSection Reset Provider 隐藏', () => {
  it('不渲染 Reset Provider 按钮', () => {
    renderSection();
    expect(
      screen.queryByRole('button', { name: /Reset Provider/i })
    ).not.toBeInTheDocument();
  });
});
