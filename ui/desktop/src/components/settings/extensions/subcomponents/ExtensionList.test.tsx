import { render, screen } from '@testing-library/react';
import { createIntl, IntlProvider } from 'react-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const searchableExtensions = [
  {
    name: 'computercontroller',
    display_name: 'Computer Controller',
    description: 'General computer control tools.',
    enabled: true,
    type: 'builtin',
  },
  {
    name: 'autovisualiser',
    display_name: 'Auto Visualiser',
    description: 'Visual data tools.',
    enabled: true,
    type: 'builtin',
  },
  {
    name: 'legacy-build-helper',
    display_name: 'Legacy Build Helper',
    configKey: 'memory',
    description: 'Legacy build support.',
    enabled: true,
    type: 'builtin',
  },
  {
    name: 'custom-search-toolbox',
    description: 'Fallback-only extension description.',
    cmd: 'acme-search-command',
    args: [],
    env_keys: [],
    enabled: true,
    type: 'stdio',
  },
] as FixedExtensionEntry[];

describe('ExtensionList', () => {
  // This suite asserts exact Chinese copy, some of which embeds the product
  // name, so pin the edition instead of tracking whichever one runs the suite.
  beforeEach(() => {
    vi.stubEnv('APP_EDITION', 'heybuddy');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    expect(screen.getByText('让 HeyBuddy 在使用过程中记住你的偏好。')).toBeInTheDocument();
    expect(screen.getByText('提供交互式教程和使用指南。')).toBeInTheDocument();
  });

  it.each([
    ['an English friendly title', 'Computer Controller', '电脑控制'],
    ['an original English description', 'UI generation', '自动可视化'],
    ['a config key', 'memory', '记忆'],
    ['a stable name', 'legacy-build-helper', '记忆'],
    ['a Chinese title', '电脑控制', '电脑控制'],
    ['a Chinese description', '无需开发经验', '电脑控制'],
    ['a custom command', 'acme-search-command', 'Custom Search Toolbox'],
    ['a custom title', 'Custom Search Toolbox', 'Custom Search Toolbox'],
    ['a custom description', 'Fallback-only extension description', 'Custom Search Toolbox'],
  ])('matches an extension by %s', (_aliasType, searchTerm, expectedTitle) => {
    render(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ExtensionList
          extensions={searchableExtensions}
          onToggle={vi.fn()}
          searchTerm={searchTerm}
        />
      </IntlProvider>
    );

    expect(screen.getByRole('heading', { name: '默认扩展（1）' })).toBeInTheDocument();
    expect(screen.getByText(expectedTitle)).toBeInTheDocument();
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
      intl.formatMessage(extensionsViewMessages.description, {
        appName: 'HeyBuddy',
        searchShortcut: 'Cmd+K',
      })
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
