import brands from '../branding/brands.json';

export type AppEdition = keyof typeof brands;

export function getAppEdition(): AppEdition {
  const edition = process.env.APP_EDITION;
  if (!edition || !Object.hasOwn(brands, edition)) {
    throw new Error(`Invalid APP_EDITION ${JSON.stringify(edition)}`);
  }
  return edition as AppEdition;
}

export function getAppDisplayName(): string {
  return brands[getAppEdition()].productName;
}

export function getAppIconStem(): string {
  return brands[getAppEdition()].iconStem;
}

// 托盘图标与窗口图标是两套素材：菜单栏用与图标同名的 *Template 单色字形，
// macOS 依据文件名后缀自动按 template image 渲染（随明暗主题反色）。
export function getAppTrayIconStem(): string {
  return `${getAppIconStem()}Template`;
}

export function getAppProtocol(): string {
  return brands[getAppEdition()].protocol;
}

export function getAppProtocolPrefix(): string {
  return `${getAppProtocol()}://`;
}
