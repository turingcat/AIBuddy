/**
 * @author: logic
 * @date: 2026-08-11
 * 阶段一：验证 ModelSettingsButtons 不再渲染「Configure providers」按钮，
 * 从而摘掉跳转到 /configure-providers 的入口。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlTestWrapper } from '../../../../i18n/test-utils';

vi.mock('../predefinedModelsUtils', () => ({
  shouldShowPredefinedModels: () => false,
}));

vi.mock('./SwitchModelModal', () => ({
  SwitchModelModal: () => null,
}));

import ModelSettingsButtons from './ModelSettingsButtons';

const renderButtons = () =>
  render(
    <IntlTestWrapper>
      <ModelSettingsButtons setView={vi.fn()} />
    </IntlTestWrapper>
  );

describe('ModelSettingsButtons 配置入口隐藏', () => {
  it('不渲染 Configure providers 按钮', () => {
    renderButtons();
    expect(
      screen.queryByRole('button', { name: /Configure providers/i })
    ).not.toBeInTheDocument();
  });
});
