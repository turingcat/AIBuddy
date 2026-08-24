import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CURRENCY_CONFIG,
  formatQuotaWithCurrency,
  parseCurrencyConfig,
} from './quotaFormat';

/**
 * @author logic
 * @date 2026-08-24
 * 货币格式化单测。预期值按 new-api 面板余额显示语义推导
 * （web/src/lib/currency.ts：quota/quotaPerUnit → USD → 显示货币）。
 *
 * 路径分析（parseCurrencyConfig，V(G)=5）：
 *   P1 type 合法采用 / P2 type 非法且 display_in_currency=false → TOKENS /
 *   P3 type 非法且 display_in_currency≠false → 默认 USD / P4 数值回退 toPositiveNumber /
 *   P5 symbol 空白回退
 * 路径分析（formatQuotaWithCurrency，V(G)=6）：
 *   P6 null/NaN → '-' / P7 TOKENS 分支 / P8 currency 分支 / P9 custom 分支 /
 *   P10 极小值抬底 / P11 精度边界（|值|≥1 用 2 位、<1 用 4 位）
 * 条件矩阵：
 *   | 原子条件 | 取真用例 | 取假用例 |
 *   | type 是合法枚举 | P1 | P2/P3 |
 *   | display_in_currency === false | P2 | P3 |
 *   | 数值有限且 >0 | P1 | P4 |
 *   | 余额绝对值 ≥1 | P8 USD "$12.5" | P8 USD "$0.5" |
 *   | tokens ≥1000 | P16/P18 | P17/P19 |
 */

describe('parseCurrencyConfig', () => {
  it('P1: 完整合法 JSON 全字段采用', () => {
    expect(
      parseCurrencyConfig({
        quota_per_unit: 300000,
        quota_display_type: 'CNY',
        usd_exchange_rate: 7.3,
        custom_currency_symbol: '€',
        custom_currency_exchange_rate: 0.9,
      }),
    ).toEqual({
      quotaPerUnit: 300000,
      quotaDisplayType: 'CNY',
      usdExchangeRate: 7.3,
      customCurrencySymbol: '€',
      customCurrencyExchangeRate: 0.9,
    });
  });

  it('P2: type 非法且 display_in_currency=false 时回退 TOKENS', () => {
    const config = parseCurrencyConfig({
      quota_display_type: 'not-a-type',
      display_in_currency: false,
    });
    expect(config.quotaDisplayType).toBe('TOKENS');
  });

  it('P2b: display_in_currency=false 但 type 合法时 type 优先', () => {
    const config = parseCurrencyConfig({
      quota_display_type: 'CNY',
      display_in_currency: false,
    });
    expect(config.quotaDisplayType).toBe('CNY');
  });

  it('P3: type 非法且无旧开关时回退 USD；null 输入全默认', () => {
    expect(parseCurrencyConfig({ quota_display_type: 42 }).quotaDisplayType).toBe('USD');
    expect(parseCurrencyConfig(null)).toEqual(DEFAULT_CURRENCY_CONFIG);
    expect(parseCurrencyConfig(undefined)).toEqual(DEFAULT_CURRENCY_CONFIG);
  });

  it('P4: 数值缺失、非正数、非有限数、非法字符串一律回退默认', () => {
    const config = parseCurrencyConfig({
      quota_per_unit: 0,
      usd_exchange_rate: -1,
      custom_currency_exchange_rate: Number.POSITIVE_INFINITY,
    });
    expect(config.quotaPerUnit).toBe(500000);
    expect(config.usdExchangeRate).toBe(1);
    expect(config.customCurrencyExchangeRate).toBe(1);
  });

  it('P4b: 数字字符串可解析，非法字符串回退默认', () => {
    const config = parseCurrencyConfig({
      quota_per_unit: '250000',
      usd_exchange_rate: 'not-a-number',
    });
    expect(config.quotaPerUnit).toBe(250000);
    expect(config.usdExchangeRate).toBe(1);
  });

  it('P5: custom_currency_symbol 空白回退默认符号', () => {
    expect(parseCurrencyConfig({ custom_currency_symbol: '   ' }).customCurrencySymbol).toBe('¤');
    expect(parseCurrencyConfig({}).customCurrencySymbol).toBe('¤');
  });
});

describe('formatQuotaWithCurrency', () => {
  const usd = DEFAULT_CURRENCY_CONFIG;
  const cny: typeof usd = { ...usd, quotaDisplayType: 'CNY', usdExchangeRate: 7.3 };
  const custom: typeof usd = {
    ...usd,
    quotaDisplayType: 'CUSTOM',
    customCurrencySymbol: '€',
    customCurrencyExchangeRate: 0.9,
  };
  const tokens: typeof usd = { ...usd, quotaDisplayType: 'TOKENS' };

  it('P6: null 与 NaN 返回占位符', () => {
    expect(formatQuotaWithCurrency(null, usd)).toBe('-');
    expect(formatQuotaWithCurrency(Number.NaN, usd)).toBe('-');
  });

  it('P8: USD 模式按 2/4 位精度显示，小数按需保留', () => {
    expect(formatQuotaWithCurrency(5000000, usd)).toBe('$10');
    expect(formatQuotaWithCurrency(6250000, usd)).toBe('$12.5');
    expect(formatQuotaWithCurrency(250000, usd)).toBe('$0.5');
    expect(formatQuotaWithCurrency(0, usd)).toBe('$0');
    // 舍入进位边界：1234567/500000 = 2.469134 → 2 位小数
    expect(formatQuotaWithCurrency(1234567, usd)).toBe('$2.47');
  });

  it('P10: 极小非零余额抬到当前精度最小显示值', () => {
    // 25/500000 = 0.00005 < 0.0001 → 抬到 0.0001
    expect(formatQuotaWithCurrency(25, usd)).toBe('$0.0001');
  });

  it('P8b: CNY 模式乘以汇率显示人民币符号', () => {
    // 5000000/500000=10 美元 ×7.3 = 73 元
    expect(formatQuotaWithCurrency(5000000, cny)).toBe('¥73');
    expect(formatQuotaWithCurrency(6250000, cny)).toBe('¥91.25');
  });

  it('P9: CUSTOM 模式以"符号 + 空格 + 数字"显示', () => {
    // 10 美元 ×0.9 = 9
    expect(formatQuotaWithCurrency(5000000, custom)).toBe('€ 9');
  });

  it('P16/P18: TOKENS 模式 ≥1000 缩写为 k', () => {
    // 1234 tokens → 1.2k；2500000 tokens → 2500k
    expect(formatQuotaWithCurrency(1234, tokens)).toBe('1.2k');
    expect(formatQuotaWithCurrency(2500000, tokens)).toBe('2500k');
  });

  it('P17/P19: TOKENS 模式 <1000 时按 2/4 位精度去尾零显示', () => {
    expect(formatQuotaWithCurrency(500, tokens)).toBe('500');
    expect(formatQuotaWithCurrency(0.5, tokens)).toBe('0.5');
  });

  it('P7b: TOKENS 模式换算走 quotaPerUnit 往返，自定义 perUnit 生效', () => {
    const per250k: typeof usd = { ...tokens, quotaPerUnit: 250000 };
    // 500000/250000=2 美元 → 2×250000=500000 tokens → 500k
    expect(formatQuotaWithCurrency(500000, per250k)).toBe('500k');
  });
});
