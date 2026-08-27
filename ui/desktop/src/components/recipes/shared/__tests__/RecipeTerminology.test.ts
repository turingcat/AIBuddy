import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import zhCatalog from '../../../../i18n/messages/zh-CN.json';
import { createEditRecipeMessages } from '../../CreateEditRecipeModal';
import { importRecipeMessages } from '../../ImportRecipeForm';
import { recipeActivityEditorMessages } from '../../RecipeActivityEditor';
import { recipeMessages } from '../../RecipesView';
import { recipeFormFieldsMessages } from '../RecipeFormFields';
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

    expect(intl.formatMessage(createEditRecipeMessages.createRecipeTitle)).toBe('创建模板');
    expect(intl.formatMessage(createEditRecipeMessages.saveAndRunRecipe)).toBe('保存并运行模板');
    expect(intl.formatMessage(importRecipeMessages.importRecipeTitle)).toBe('导入模板');
    expect(intl.formatMessage(importRecipeMessages.recipeDeeplinkLabel)).toBe('模板深层链接');
    expect(intl.formatMessage(recipeActivityEditorMessages.activitiesDescription)).toBe(
      '将在模板聊天窗口中显示的顶部提示和活动按钮。'
    );
    expect(intl.formatMessage(recipeActivityEditorMessages.messagePlaceholder)).toBe(
      '为你的模板输入面向用户的介绍消息（支持 **加粗**、*斜体*、`代码` 等）'
    );
    expect(intl.formatMessage(recipeFormFieldsMessages.titlePlaceholder)).toBe('模板标题');
    expect(intl.formatMessage(recipeFormFieldsMessages.advancedOptionsHint)).toBe(
      '活动、参数、模型、扩展、响应 schema、子模板'
    );
  });

  it('does not leave recipe or subrecipe terminology in the Chinese catalog', () => {
    const recipeMessages = Object.entries(zhCatalog)
      .filter(([id]) => /recipe/i.test(id))
      .map(([, message]) => message.defaultMessage);

    expect(recipeMessages.join('\n')).not.toMatch(/配方|子配方/);
  });
});
