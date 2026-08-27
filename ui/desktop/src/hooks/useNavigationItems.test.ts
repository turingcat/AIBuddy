import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import zhCatalog from '../i18n/messages/zh-CN.json';
import { getNavItemLabel, NAV_ITEMS } from './useNavigationItems';

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

const intl = createIntl({ locale: 'zh-CN', messages: zhMessages });

describe('useNavigationItems', () => {
  it('keeps the recipes route stable and uses Chinese navigation terminology', () => {
    const recipes = NAV_ITEMS.find((item) => item.id === 'recipes');
    const scheduler = NAV_ITEMS.find((item) => item.id === 'scheduler');

    expect(recipes).toMatchObject({ id: 'recipes', path: '/recipes' });
    expect(getNavItemLabel(recipes!, intl)).toBe('模板');
    expect(getNavItemLabel(scheduler!, intl)).toBe('定时任务');
  });
});
