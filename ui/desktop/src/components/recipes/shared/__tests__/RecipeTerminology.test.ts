import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import zhCatalog from '../../../../i18n/messages/zh-CN.json';
import { recipeMessages } from '../../RecipesView';
import { subRecipeEditorMessages } from '../SubRecipeEditor';

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

const intl = createIntl({ locale: 'zh-CN', messages: zhMessages });

describe('recipe terminology', () => {
  it('uses template and subtemplate terms in production recipe descriptors', () => {
    expect(intl.formatMessage(recipeMessages.recipesTitle)).toBe('模板');
    expect(intl.formatMessage(recipeMessages.createRecipe)).toBe('创建模板');
    expect(intl.formatMessage(subRecipeEditorMessages.label)).toBe('子模板');
    expect(intl.formatMessage(subRecipeEditorMessages.createNew)).toBe('创建新子模板');
  });

  it('does not leave recipe or subrecipe terminology in the Chinese catalog', () => {
    const recipeMessages = Object.entries(zhCatalog)
      .filter(([id]) => id.startsWith('recipesView.') || id.startsWith('subRecipe'))
      .map(([, message]) => message.defaultMessage);

    expect(recipeMessages.join('\n')).not.toMatch(/配方|子配方/);
  });
});
