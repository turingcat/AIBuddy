import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { describe, expect, it, vi } from 'vitest';
import zhCatalog from '../../i18n/messages/zh-CN.json';
import type { FixedExtensionEntry } from '../ConfigContext';
import { ExtensionMenu } from './ExtensionMenu';

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

const builtIn = {
  type: 'builtin',
  name: 'developer',
  display_name: 'Developer',
  description: 'General development tools useful for software engineering.',
  enabled: true,
} as FixedExtensionEntry;

function renderMenu(extensions: FixedExtensionEntry[]) {
  return render(
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      <ExtensionMenu
        extensions={extensions}
        title="扩展"
        searchPlaceholder="搜索扩展"
        description="选择扩展"
        emptyMessage="暂无扩展"
        noResultsMessage="未找到扩展"
        triggerLabel="扩展"
        hidden={false}
        isTransitioning={false}
        isSortPending={false}
        togglingExtensionName={null}
        onToggle={vi.fn()}
      />
    </IntlProvider>
  );
}

describe('ExtensionMenu', () => {
  it('renders localized built-in names and descriptions', async () => {
    const user = userEvent.setup();
    renderMenu([builtIn]);

    await user.click(screen.getByRole('button', { name: '扩展' }));

    expect(screen.getByText('开发工具')).toBeInTheDocument();
    expect(screen.getByText('提供软件开发和工程相关的通用工具。')).toBeInTheDocument();
  });

  it('keeps original aliases searchable while rendering localized copy', async () => {
    const user = userEvent.setup();
    renderMenu([builtIn]);

    await user.click(screen.getByRole('button', { name: '扩展' }));
    await user.type(screen.getByPlaceholderText('搜索扩展'), 'software engineering');

    expect(screen.getByText('开发工具')).toBeInTheDocument();
  });

  it('preserves unknown custom extension fallback copy', async () => {
    const user = userEvent.setup();
    renderMenu([
      {
        type: 'stdio',
        name: 'team_tools',
        description: 'Internal team tools',
        cmd: 'team-tools',
        args: [],
        env_keys: [],
        enabled: true,
      } as FixedExtensionEntry,
    ]);

    await user.click(screen.getByRole('button', { name: '扩展' }));

    expect(screen.getByText('Team Tools')).toBeInTheDocument();
    expect(screen.getByText('Internal team tools')).toBeInTheDocument();
  });
});
