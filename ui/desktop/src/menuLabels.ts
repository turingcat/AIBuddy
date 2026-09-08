// Electron's main process can't use react-intl (which runs in the renderer),
// so the native menu bar is translated here with a small hand-maintained
// dictionary. Only Simplified Chinese is filled in right now; other locales
// fall through to the original English labels. Keep the keys in sync with
// the raw label strings used below.
// =======================================================================

const MENU_TRANSLATIONS_ZH_CN: Record<string, string> = {
  // Top-level
  File: '文件',
  Edit: '编辑',
  View: '视图',
  Window: '窗口',
  Help: '帮助',
  // Context menu
  'Add to dictionary': '添加到词典',
  Cut: '剪切',
  Copy: '复制',
  Paste: '粘贴',
  // Edition-added items
  'New Window': '新建窗口',
  Settings: '设置',
  'Find…': '查找…',
  'Find Next': '查找下一个',
  'Find Previous': '查找上一个',
  'Use Selection for Find': '用所选内容查找',
  Find: '查找',
  'New Chat': '新建聊天',
  'New Chat Window': '新建聊天窗口',
  'Open Directory...': '打开目录…',
  'Recent Directories': '最近的目录',
  'Focus {app} Window': '聚焦 {app} 窗口',
  'Quick Launcher': '快速启动器',
  'Always on Top': '窗口置顶',
  'Toggle Navigation': '切换导航',
  'About {app}': '关于 {app}',
  // Electron's default role-based labels we want to translate as well.
  // (The menu role itself still provides the correct behaviour; only the
  // display string is overridden.)
  Undo: '撤销',
  Redo: '重做',
  'Select All': '全选',
  Delete: '删除',
  Speech: '语音',
  Reload: '重新加载',
  'Force Reload': '强制重新加载',
  'Toggle Developer Tools': '切换开发者工具',
  'Actual Size': '实际大小',
  'Reset Zoom': '重置缩放',
  'Zoom In': '放大',
  'Zoom Out': '缩小',
  'Toggle Full Screen': '切换全屏',
  'Toggle Fullscreen': '切换全屏',
  Minimize: '最小化',
  Close: '关闭',
  'Close Window': '关闭窗口',
  Quit: '退出',
  Exit: '退出',
  'Bring All to Front': '全部置于最前',
  'Emoji & Symbols': '表情符号',
  'Start Dictation…': '开始听写…',
  'Hide {app}': '隐藏 {app}',
  'Hide Others': '隐藏其他',
  'Show All': '全部显示',
  Services: '服务',
};

export function translateMenuLabel(label: string, locale: string, appName: string): string {
  // Electron builds role labels from the bundle name, so normalize the running
  // edition's product name back to the {app} key the dictionary is written in.
  const key = label.replaceAll(appName, '{app}');
  const expand = (value: string) => value.replaceAll('{app}', appName);

  // Normalize underscores to hyphens so POSIX-style tags like "zh_CN" work.
  const lower = locale.replace(/_/g, '-').toLowerCase();
  const isTraditional = /^zh-(hant|tw|hk|mo)\b/.test(lower);
  const isSimplifiedChinese = !isTraditional && (lower === 'zh' || lower.startsWith('zh-'));
  if (isSimplifiedChinese) {
    const translated = MENU_TRANSLATIONS_ZH_CN[key];
    if (translated) return expand(translated);
  }
  return expand(key);
}
