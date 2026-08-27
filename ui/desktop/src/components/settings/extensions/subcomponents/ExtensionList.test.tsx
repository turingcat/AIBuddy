import { render, screen } from '@testing-library/react';
import { createIntl, IntlProvider } from 'react-intl';
import { describe, expect, it, vi } from 'vitest';
import zhCatalog from '../../../../i18n/messages/zh-CN.json';
import type { FixedExtensionEntry } from '../../../ConfigContext';
import { extensionsViewMessages } from '../../../extensions/ExtensionsView';
import ExtensionList from './ExtensionList';

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);
const intl = createIntl({ locale: 'zh-CN', messages: zhMessages });

const builtIns = [
  {
    name: 'developer',
    display_name: 'Developer',
    description: 'General development tools useful for software engineering.',
    enabled: true,
    type: 'builtin',
  },
  {
    name: 'computercontroller',
    display_name: 'Computer Controller',
    description: 'General computer control tools.',
    enabled: false,
    type: 'builtin',
  },
  {
    name: 'autovisualiser',
    display_name: 'Auto Visualiser',
    description: 'Data visualization and UI generation tools.',
    enabled: false,
    type: 'builtin',
  },
  {
    name: 'memory',
    display_name: 'Memory',
    description: 'Teach goose your preferences as you go.',
    enabled: false,
    type: 'builtin',
  },
  {
    name: 'tutorial',
    display_name: 'Tutorial',
    description: 'Access interactive tutorials and guides.',
    enabled: false,
    type: 'builtin',
  },
] as FixedExtensionEntry[];

describe('ExtensionList', () => {
  it('localizes headings and built-in extension copy by stable ID', () => {
    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ExtensionList extensions={builtIns} onToggle={vi.fn()} />
      </IntlProvider>
    );

    expect(screen.getByRole('heading', { name: '默认扩展（1）' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '可用扩展（4）' })).toBeInTheDocument();
    expect(screen.getByText('开发工具')).toBeInTheDocument();
    expect(screen.getByText('电脑控制')).toBeInTheDocument();
    expect(screen.getByText('自动可视化')).toBeInTheDocument();
    expect(screen.getByText('记忆')).toBeInTheDocument();
    expect(screen.getByText('教程')).toBeInTheDocument();
    expect(screen.getByText('提供软件开发和工程相关的通用工具。')).toBeInTheDocument();
    expect(screen.getByText('提供无需开发经验的通用电脑操作工具。')).toBeInTheDocument();
    expect(screen.getByText('自动将数据呈现为可视化界面。')).toBeInTheDocument();
    expect(screen.getByText('在使用过程中记住你的偏好。')).toBeInTheDocument();
    expect(screen.getByText('提供交互式教程和使用指南。')).toBeInTheDocument();
  });

  it('matches built-in extensions by their English friendly titles', () => {
    const { rerender } = render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ExtensionList extensions={builtIns} onToggle={vi.fn()} searchTerm="Computer Controller" />
      </IntlProvider>
    );

    expect(screen.getByText('电脑控制')).toBeInTheDocument();
    expect(screen.queryByText('自动可视化')).not.toBeInTheDocument();

    rerender(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ExtensionList extensions={builtIns} onToggle={vi.fn()} searchTerm="Auto Visualiser" />
      </IntlProvider>
    );

    expect(screen.getByText('自动可视化')).toBeInTheDocument();
    expect(screen.queryByText('电脑控制')).not.toBeInTheDocument();
  });

  it('preserves custom extension copy when no stable built-in ID matches', () => {
    const custom = {
      name: 'team_tools',
      description: 'Internal team tools',
      enabled: true,
      type: 'stdio',
      cmd: 'team-tools',
      args: [],
      env_keys: [],
    } as FixedExtensionEntry;

    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ExtensionList extensions={[custom]} onToggle={vi.fn()} />
      </IntlProvider>
    );

    expect(screen.getByText('Team Tools')).toBeInTheDocument();
    expect(screen.getByText('Internal team tools')).toBeInTheDocument();
  });

  it('uses Chinese extension-view and configuration copy', () => {
    const custom = {
      name: 'team_tools',
      description: 'Internal team tools',
      enabled: true,
      type: 'stdio',
      cmd: 'team-tools',
      args: [],
      env_keys: [],
    } as FixedExtensionEntry;

    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ExtensionList extensions={[custom]} onToggle={vi.fn()} onConfigure={vi.fn()} />
      </IntlProvider>
    );

    expect(
      intl.formatMessage(extensionsViewMessages.description, { searchShortcut: 'Cmd+K' })
    ).toBe(
      '这些扩展使用模型上下文协议（MCP）。它们可以通过三大组件扩展 HeyBuddy 的能力：提示词、资源和工具。按 Cmd+K 搜索。'
    );
    expect(screen.getByRole('button', { name: '配置 Team Tools 扩展' })).toBeInTheDocument();
  });

  it('shows the localized empty state', () => {
    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ExtensionList extensions={[]} onToggle={vi.fn()} />
      </IntlProvider>
    );

    expect(screen.getByText('暂无可用扩展')).toBeInTheDocument();
  });
});
