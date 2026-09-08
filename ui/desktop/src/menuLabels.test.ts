import { describe, expect, it } from 'vitest';
import { translateMenuLabel } from './menuLabels';

describe('translateMenuLabel', () => {
  it('translates plain labels for Simplified Chinese', () => {
    expect(translateMenuLabel('File', 'zh-CN', 'AIBuddy')).toBe('文件');
  });

  it.each(['en', 'zh-TW', 'zh-Hant', 'ja'])('leaves labels untouched for %s', (locale) => {
    expect(translateMenuLabel('File', locale, 'AIBuddy')).toBe('File');
  });

  it('accepts POSIX-style locale tags', () => {
    expect(translateMenuLabel('File', 'zh_CN', 'AIBuddy')).toBe('文件');
  });

  it('falls back to the original label when untranslated', () => {
    expect(translateMenuLabel('Nonexistent', 'zh-CN', 'AIBuddy')).toBe('Nonexistent');
  });

  // Electron generates role labels like "Hide <productName>" from the bundle
  // name, so the dictionary is keyed on {app}.
  describe.each(['AIBuddy'])('for the %s product name', (appName) => {
    it('translates labels that embed the product name', () => {
      expect(translateMenuLabel(`Hide ${appName}`, 'zh-CN', appName)).toBe(`隐藏 ${appName}`);
      expect(translateMenuLabel('About {app}', 'zh-CN', appName)).toBe(`关于 ${appName}`);
      expect(translateMenuLabel('Focus {app} Window', 'zh-CN', appName)).toBe(
        `聚焦 ${appName} 窗口`
      );
    });

    it('expands the product name placeholder outside Simplified Chinese', () => {
      expect(translateMenuLabel('About {app}', 'en', appName)).toBe(`About ${appName}`);
    });
  });
});
