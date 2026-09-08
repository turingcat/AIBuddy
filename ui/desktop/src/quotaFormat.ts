/**
 * @author logic
 * @date 2026-08-25
 * 用户余额的货币格式化，显示语义对齐 new-api 面板余额路径
 * （web/src/lib/currency.ts 的 getDisplayMeta 链路）：
 * - 余额原始值 quota 除以 quotaPerUnit 直接得到显示货币金额，不再乘汇率
 * - CNY 站点 quota 本身即人民币计价（500000 quota = ¥1），
 *   显示不乘 usd_exchange_rate（new-api 端 CNY 模式下该汇率亦归一为 1）
 * - |值|≥1 用 2 位小数，<1 用 4 位小数；舍入后会变 0 的极小非零值抬到当前精度最小值
 * - TOKENS 模式直接显示 token 数，≥1000 缩写为 k（1 位小数去尾零）
 * 纯函数、无副作用，main 与 renderer 共用。
 */

export type QuotaDisplayType = 'USD' | 'CNY' | 'TOKENS' | 'CUSTOM';

export interface CurrencyConfig {
  /** 1 美元对应的 token 额度数，默认 500000 */
  quotaPerUnit: number;
  quotaDisplayType: QuotaDisplayType;
  /** 站点 usd_exchange_rate 原值；CNY 记账站点的余额显示不使用它（new-api 端 CNY 模式归一为 1） */
  usdExchangeRate: number;
  customCurrencySymbol: string;
  customCurrencyExchangeRate: number;
}

export const DEFAULT_CURRENCY_CONFIG: CurrencyConfig = {
  quotaPerUnit: 500000,
  quotaDisplayType: 'USD',
  usdExchangeRate: 1,
  customCurrencySymbol: '¤',
  customCurrencyExchangeRate: 1,
};

const DISPLAY_TYPES: readonly string[] = ['USD', 'CNY', 'TOKENS', 'CUSTOM'];

// 数值解析：接受 number 或数字字符串，非有限数或 ≤0 一律回退默认（合并了
// new-api mapStatusDataToConfig 的 toNumber 与 getConfig 的 >0 守卫两层语义）
function toPositiveNumber(value: unknown, fallback: number): number {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    parsed = Number(value);
  } else {
    parsed = Number.NaN;
  }
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 解析 GET /api/status 返回的 data 为货币配置，非法/缺失字段回退默认值。
 * 老服务器只返回旧开关 display_in_currency=false（不显示货币）时按 TOKENS 处理。
 */
export function parseCurrencyConfig(raw: unknown): CurrencyConfig {
  const data = (raw ?? {}) as Record<string, unknown>;
  let quotaDisplayType: QuotaDisplayType = DEFAULT_CURRENCY_CONFIG.quotaDisplayType;
  const rawType = data.quota_display_type;
  if (typeof rawType === 'string' && DISPLAY_TYPES.includes(rawType)) {
    quotaDisplayType = rawType as QuotaDisplayType;
  } else if (data.display_in_currency === false) {
    quotaDisplayType = 'TOKENS';
  }
  const symbol =
    typeof data.custom_currency_symbol === 'string' ? data.custom_currency_symbol.trim() : '';
  return {
    quotaPerUnit: toPositiveNumber(data.quota_per_unit, DEFAULT_CURRENCY_CONFIG.quotaPerUnit),
    quotaDisplayType,
    usdExchangeRate: toPositiveNumber(data.usd_exchange_rate, DEFAULT_CURRENCY_CONFIG.usdExchangeRate),
    customCurrencySymbol: symbol || DEFAULT_CURRENCY_CONFIG.customCurrencySymbol,
    customCurrencyExchangeRate: toPositiveNumber(
      data.custom_currency_exchange_rate,
      DEFAULT_CURRENCY_CONFIG.customCurrencyExchangeRate,
    ),
  };
}

type DisplayMeta =
  | { kind: 'currency'; code: string; exchangeRate: number }
  | { kind: 'custom'; symbol: string; exchangeRate: number }
  | { kind: 'tokens'; quotaPerUnit: number };

function getDisplayMeta(config: CurrencyConfig): DisplayMeta {
  switch (config.quotaDisplayType) {
    case 'CNY':
      // 对齐 web 端 getDisplayMeta：CNY 模式下 quota 即人民币计价
      // （quotaPerUnit 个 quota = ¥1），不乘 usd_exchange_rate，
      // 否则已是人民币的余额会被再乘一次汇率（回归用例见 P8b）
      return { kind: 'currency', code: 'CNY', exchangeRate: 1 };
    case 'CUSTOM':
      return {
        kind: 'custom',
        symbol: config.customCurrencySymbol,
        exchangeRate: config.customCurrencyExchangeRate,
      };
    case 'TOKENS':
      return { kind: 'tokens', quotaPerUnit: config.quotaPerUnit };
    case 'USD':
    default:
      return { kind: 'currency', code: 'USD', exchangeRate: 1 };
  }
}

function removeTrailingZeros(str: string): string {
  if (!str.includes('.')) return str;
  return str.replace(/(\.[0-9]*?)0+$/, '$1').replace(/\.$/, '');
}

// token 数显示：≥1000 缩写为 k（1 位小数去尾零），其余按 2/4 位精度去尾零
function formatTokens(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${removeTrailingZeros((value / 1000).toFixed(1))}k`;
  }
  const digits = Math.abs(value) >= 1 ? 2 : 4;
  return removeTrailingZeros(value.toFixed(digits));
}

// 舍入后会显示为 0 的非零值抬到当前精度的最小显示值，避免 "$0.00" 掩盖微量余额
function adjustForMinimum(value: number, digits: number): number {
  if (value === 0) return value;
  const threshold = Math.pow(10, -digits);
  if (Math.abs(value) < threshold) {
    return value > 0 ? threshold : -threshold;
  }
  return value;
}

/**
 * 格式化余额：quota 为原始 token 额度。null/NaN 返回 '-'。
 * 货币模式经 Intl narrowSymbol 渲染（USD→$、CNY→¥），小数位按需保留（最大 2 或 4 位）。
 */
export function formatQuotaWithCurrency(
  quota: number | null | undefined,
  config: CurrencyConfig,
): string {
  if (quota == null || Number.isNaN(quota)) return '-';
  const meta = getDisplayMeta(config);
  const amountUSD = quota / config.quotaPerUnit;
  if (meta.kind === 'tokens') {
    return formatTokens(amountUSD * meta.quotaPerUnit);
  }
  const value = amountUSD * meta.exchangeRate;
  const digits = Math.abs(value) >= 1 ? 2 : 4;
  const adjusted = adjustForMinimum(value, digits);
  if (meta.kind === 'currency') {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: meta.code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(adjusted);
  }
  const decimal = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(adjusted);
  return `${meta.symbol} ${decimal}`;
}
