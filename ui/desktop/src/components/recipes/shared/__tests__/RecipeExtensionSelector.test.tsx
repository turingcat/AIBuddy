import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, type RenderOptions, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';

import { RecipeExtensionSelector } from '../RecipeExtensionSelector';
import { IntlTestWrapper } from '../../../../i18n/test-utils';
import type { FixedExtensionEntry } from '../../../ConfigContext';
import zhCatalog from '../../../../i18n/messages/zh-CN.json';

const configContextMock = vi.hoisted(() => ({
  extensionsList: [] as FixedExtensionEntry[],
}));

vi.mock('../../../ConfigContext', () => ({
  useConfig: () => ({
    extensionsList: configContextMock.extensionsList,
  }),
}));

const renderWithIntl = (ui: React.ReactElement, options?: RenderOptions) =>
  render(ui, { wrapper: IntlTestWrapper, ...options });

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

const renderWithChinese = (ui: React.ReactElement) =>
  render(
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      {ui}
    </IntlProvider>
  );

describe('RecipeExtensionSelector', () => {
  beforeEach(() => {
    configContextMock.extensionsList = [];
  });

  it('preserves non-empty available tools when selecting a configured extension', async () => {
    const user = userEvent.setup();
    const onExtensionsChange = vi.fn();
    configContextMock.extensionsList = [
      {
        type: 'builtin',
        name: 'developer',
        description: 'Developer tools',
        enabled: true,
        available_tools: ['shell', 'read_file'],
      },
    ];

    renderWithIntl(
      <RecipeExtensionSelector selectedExtensions={[]} onExtensionsChange={onExtensionsChange} />
    );

    await user.click(screen.getByText('Developer'));

    expect(onExtensionsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'builtin',
        name: 'developer',
        available_tools: ['shell', 'read_file'],
      }),
    ]);
  });

  it('renders localized built-in copy while preserving the extension ID on selection', async () => {
    const user = userEvent.setup();
    const onExtensionsChange = vi.fn();
    configContextMock.extensionsList = [
      {
        type: 'builtin',
        name: 'developer',
        display_name: 'Developer',
        description: 'General development tools useful for software engineering.',
        enabled: true,
      },
    ];

    renderWithChinese(
      <RecipeExtensionSelector selectedExtensions={[]} onExtensionsChange={onExtensionsChange} />
    );

    expect(screen.getByText('开发工具')).toBeInTheDocument();
    expect(screen.getByText('提供软件开发和工程相关的通用工具。')).toBeInTheDocument();
    await user.click(screen.getByText('开发工具'));
    expect(onExtensionsChange).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'builtin', name: 'developer' }),
    ]);
  });

  it('preserves unknown custom extension name and description fallback', () => {
    configContextMock.extensionsList = [
      {
        type: 'stdio',
        name: 'team_tools',
        description: 'Internal team tools',
        cmd: 'team-tools',
        args: [],
        env_keys: [],
        enabled: true,
      },
    ];

    renderWithChinese(
      <RecipeExtensionSelector selectedExtensions={[]} onExtensionsChange={vi.fn()} />
    );

    expect(screen.getByText('Team Tools')).toBeInTheDocument();
    expect(screen.getByText('Internal team tools')).toBeInTheDocument();
  });

  it('preserves static OAuth fields when selecting a configured extension', async () => {
    const user = userEvent.setup();
    const onExtensionsChange = vi.fn();
    configContextMock.extensionsList = [
      {
        type: 'streamable_http',
        name: 'google_workspace',
        description: 'Google Workspace',
        uri: 'https://example.com/mcp',
        client_id: 'registered-client',
        client_secret_key: 'GOOGLE_OAUTH_SECRET',
        scopes: ['drive.readonly'],
        enabled: true,
      },
    ];

    renderWithIntl(
      <RecipeExtensionSelector selectedExtensions={[]} onExtensionsChange={onExtensionsChange} />
    );

    await user.click(screen.getByTitle('HTTP: Google Workspace'));

    expect(onExtensionsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'streamable_http',
        name: 'google_workspace',
        client_id: 'registered-client',
        client_secret_key: 'GOOGLE_OAUTH_SECRET',
        scopes: ['drive.readonly'],
      }),
    ]);
  });
});
