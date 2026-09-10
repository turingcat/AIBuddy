/**
 * @author: logic
 * @date: 2026-08-11
 * 阶段一：验证 SettingsView 不再渲染 Auth / Local Inference / Configuration 分区。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlTestWrapper } from '../../i18n/test-utils';

vi.mock('../../contexts/FeaturesContext', () => ({
  useFeatures: () => ({ localInference: false, isLoading: false }),
}));

vi.mock('../../utils/analytics', () => ({
  trackSettingsTabViewed: vi.fn(),
}));

vi.mock('./models/ModelsSection', () => ({
  __esModule: true,
  default: () => <div data-testid="models-section" />,
}));
vi.mock('./chat/ChatSettingsSection', () => ({
  __esModule: true,
  default: () => <div data-testid="chat-section" />,
}));
vi.mock('./keyboard/KeyboardShortcutsSection', () => ({
  __esModule: true,
  default: () => <div data-testid="keyboard-section" />,
}));
vi.mock('./PromptsSettingsSection', () => ({
  __esModule: true,
  default: () => <div data-testid="prompts-section" />,
}));
vi.mock('./app/ExternalBackendSection', () => ({
  __esModule: true,
  default: () => <div data-testid="external-backend-section" />,
}));
vi.mock('./app/AppSettingsSection', () => ({
  __esModule: true,
  default: () => <div data-testid="app-section" />,
}));
vi.mock('./config/ConfigSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="config-settings" />,
}));

import SettingsView from './SettingsView';

const renderSettingsView = () =>
  render(
    <IntlTestWrapper>
      <SettingsView
        onClose={() => {}}
        setView={() => {}}
        viewOptions={{}}
      />
    </IntlTestWrapper>
  );

describe('SettingsView 配置类分区隐藏', () => {
  it('不渲染 Auth / Local Inference 标签', () => {
    renderSettingsView();
    expect(screen.queryByRole('tab', { name: /Auth/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Local Inference/i })).not.toBeInTheDocument();
  });

  it('不渲染 ConfigSettings 原始 config 编辑器', async () => {
    const user = userEvent.setup();
    renderSettingsView();
    await user.click(screen.getByTestId('settings-app-tab'));
    expect(screen.queryByTestId('config-settings')).not.toBeInTheDocument();
  });
});
