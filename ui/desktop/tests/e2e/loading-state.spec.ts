import { test, expect } from './fixtures';

test.describe('Loading State', () => {
  test('shows a model placeholder while creating a new chat session', async ({ heybuddyPage }) => {
    await heybuddyPage.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });

    const chatInput = await heybuddyPage.waitForSelector('[data-testid="chat-input"]');
    await chatInput.fill('Respond with the single word hello.');
    await chatInput.press('Enter');

    await heybuddyPage.waitForSelector('[data-testid="loading-indicator"]', {
      state: 'visible',
      timeout: 10000,
    });

    const loadingModel = heybuddyPage.locator('[data-testid="model-loading-state"]');
    await expect(loadingModel).toHaveText(/loading model/i, { timeout: 10000 });

    await heybuddyPage.screenshot({
      path: test.info().outputPath('loading-state-fresh-session.png'),
      fullPage: true,
    });
  });
});
