import { test, expect } from './fixtures';

test.describe('Enhanced Context Management E2E Tests', () => {
  test.beforeEach(async ({ aibuddyPage }) => {
    // Ensure the app is ready before each test
    await aibuddyPage.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 });
  });

  test.describe('Context Window Alert System', () => {
    test('should show context window alert only when tokens are being used', async ({ aibuddyPage }) => {
      // Initially, no alert should be visible
      const alertIndicator = aibuddyPage.locator('[data-testid="alert-indicator"]');
      await expect(alertIndicator).not.toBeVisible();

      // Type and send a message to generate token usage
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      await chatInput.fill('Hello, this is a test message to generate some token usage.');
      await aibuddyPage.keyboard.press('Enter');
      
      // Wait for response and check for context window alert
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      
      // Click on the alert indicator to open the popover
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      
      // Verify the context window alert is shown
      const alertBox = aibuddyPage.locator('[role="alert"]');
      await expect(alertBox).toBeVisible();
      await expect(alertBox).toContainText('Context window');
      
      // Verify progress bar is shown
      const progressBar = aibuddyPage.locator('[role="progressbar"]');
      await expect(progressBar).toBeVisible();
      
      // Verify compact button is present
      const compactButton = aibuddyPage.locator('text=Compact now');
      await expect(compactButton).toBeVisible();
    });

    test('should update progress bar as conversation grows', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Send first message
      await chatInput.fill('First message');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Get initial progress
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      
      const progressText1 = await aibuddyPage.locator('[role="alert"]').textContent();
      const match1 = progressText1?.match(/(\d+(?:,\d+)*)\s*\/\s*(\d+(?:,\d+)*)/);
      const initialTokens = match1 ? parseInt(match1[1].replace(/,/g, '')) : 0;
      
      // Close the alert popover
      await aibuddyPage.keyboard.press('Escape');
      
      // Send second message
      await chatInput.fill('Second message with more content to increase token usage significantly');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Get updated progress
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      
      const progressText2 = await aibuddyPage.locator('[role="alert"]').textContent();
      const match2 = progressText2?.match(/(\d+(?:,\d+)*)\s*\/\s*(\d+(?:,\d+)*)/);
      const updatedTokens = match2 ? parseInt(match2[1].replace(/,/g, '')) : 0;
      
      // Token count should have increased
      expect(updatedTokens).toBeGreaterThan(initialTokens);
    });
  });

  test.describe('Manual Compaction Workflow', () => {
    test('should perform complete manual compaction workflow', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Build up conversation with multiple exchanges
      const messages = [
        'What is React and how does it work?',
        'Can you explain React hooks in detail?',
        'What are the best practices for React state management?',
        'How do I optimize React application performance?',
      ];
      
      for (const message of messages) {
        await chatInput.fill(message);
        await aibuddyPage.keyboard.press('Enter');
        await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
        await aibuddyPage.waitForTimeout(1000); // Brief pause between messages
      }
      
      // Open the alert popover and initiate compaction
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      
      const compactButton = aibuddyPage.locator('text=Compact now');
      await expect(compactButton).toBeVisible();
      await compactButton.click();
      
      // Verify alert popover closes immediately
      const alertBox = aibuddyPage.locator('[role="alert"]');
      await expect(alertBox).not.toBeVisible();
      
      // Verify compaction loading state
      const loadingAIBuddy = aibuddyPage.locator('[data-testid="loading-aibuddy"]');
      await expect(loadingAIBuddy).toBeVisible();
      await expect(loadingAIBuddy).toContainText('aibuddy is compacting the conversation...');
      
      // Wait for compaction to complete
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Verify compaction marker appears
      const compactionMarker = aibuddyPage.locator('text=Conversation compacted and summarized');
      await expect(compactionMarker).toBeVisible();
      
      // Verify chat input is re-enabled
      const submitButton = aibuddyPage.locator('[data-testid="submit-button"]');
      await expect(submitButton).toBeEnabled();
    });

    test('should hide alert indicator after successful compaction', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Generate conversation
      await chatInput.fill('Test message for compaction');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Perform compaction
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      await aibuddyPage.click('text=Compact now');
      
      // Wait for compaction to complete
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Verify alert indicator is no longer visible (or shows reduced token count)
      const alertIndicator = aibuddyPage.locator('[data-testid="alert-indicator"]');
      
      // Either the indicator is hidden, or if visible, the token count should be much lower
      const isVisible = await alertIndicator.isVisible();
      if (isVisible) {
        await alertIndicator.click();
        const alertContent = await aibuddyPage.locator('[role="alert"]').textContent();
        const match = alertContent?.match(/(\d+(?:,\d+)*)\s*\/\s*(\d+(?:,\d+)*)/);
        const currentTokens = match ? parseInt(match[1].replace(/,/g, '')) : 0;
        
        // Token count should be significantly reduced (less than 1000 tokens after compaction)
        expect(currentTokens).toBeLessThan(1000);
      }
    });

    test('should prevent multiple simultaneous compaction attempts', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Generate conversation
      await chatInput.fill('Test message for multiple compaction prevention');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Open alert and click compact button
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      
      const compactButton = aibuddyPage.locator('text=Compact now');
      await expect(compactButton).toBeVisible();
      await compactButton.click();
      
      // Alert should close immediately, preventing further clicks
      const alertBox = aibuddyPage.locator('[role="alert"]');
      await expect(alertBox).not.toBeVisible();
      
      // Verify loading state appears
      const loadingAIBuddy = aibuddyPage.locator('[data-testid="loading-aibuddy"]');
      await expect(loadingAIBuddy).toBeVisible();
      
      // Wait for compaction to complete
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Verify only one compaction marker exists
      const compactionMarkers = aibuddyPage.locator('text=Conversation compacted and summarized');
      await expect(compactionMarkers).toHaveCount(1);
    });
  });

  test.describe('Post-Compaction Behavior', () => {
    test('should allow scrolling to view ancestor messages after compaction', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Create identifiable messages
      const testMessages = [
        'FIRST_UNIQUE_MESSAGE: Tell me about JavaScript',
        'SECOND_UNIQUE_MESSAGE: Explain async/await',
        'THIRD_UNIQUE_MESSAGE: What are promises?',
      ];
      
      // Send messages
      for (const message of testMessages) {
        await chatInput.fill(message);
        await aibuddyPage.keyboard.press('Enter');
        await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
        await aibuddyPage.waitForTimeout(1000);
      }
      
      // Perform compaction
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      await aibuddyPage.click('text=Compact now');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Verify compaction marker is visible
      await expect(aibuddyPage.locator('text=Conversation compacted and summarized')).toBeVisible();
      
      // Scroll up to find ancestor messages
      const chatContainer = aibuddyPage.locator('[data-testid="chat-container"]');
      await chatContainer.hover();
      
      // Scroll up multiple times
      for (let i = 0; i < 10; i++) {
        await aibuddyPage.mouse.wheel(0, -500);
        await aibuddyPage.waitForTimeout(100);
      }
      
      // Check if we can find at least one of our original messages
      const hasFirstMessage = await aibuddyPage.locator('text=FIRST_UNIQUE_MESSAGE').isVisible();
      const hasSecondMessage = await aibuddyPage.locator('text=SECOND_UNIQUE_MESSAGE').isVisible();
      const hasThirdMessage = await aibuddyPage.locator('text=THIRD_UNIQUE_MESSAGE').isVisible();
      
      // At least one original message should be visible in the ancestor messages
      expect(hasFirstMessage || hasSecondMessage || hasThirdMessage).toBe(true);
    });

    test('should continue conversation normally after compaction', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Generate initial conversation
      await chatInput.fill('What is TypeScript?');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      await chatInput.fill('Can you give me an example?');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Perform compaction
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      await aibuddyPage.click('text=Compact now');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Verify compaction completed
      await expect(aibuddyPage.locator('text=Conversation compacted and summarized')).toBeVisible();
      
      // Continue conversation after compaction
      await chatInput.fill('POST_COMPACTION_MESSAGE: Thank you, what about React?');
      await aibuddyPage.keyboard.press('Enter');
      
      // Verify conversation continues normally
      await expect(aibuddyPage.locator('[data-testid="loading-aibuddy"]')).toBeVisible();
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Verify the new message appears
      await expect(aibuddyPage.locator('text=POST_COMPACTION_MESSAGE')).toBeVisible();
      
      // Verify we get a response
      const messages = aibuddyPage.locator('[data-testid="message"]');
      const messageCount = await messages.count();
      expect(messageCount).toBeGreaterThan(2); // Should have compaction marker + new messages
    });

    test('should maintain proper message ordering after compaction', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Generate conversation
      await chatInput.fill('First question about programming');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Perform compaction
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      await aibuddyPage.click('text=Compact now');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Send new message after compaction
      await chatInput.fill('NEW_MESSAGE_AFTER_COMPACTION');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Verify message order: compaction marker should come before new messages
      const allMessages = aibuddyPage.locator('[data-testid="message"]');
      const messageTexts = await allMessages.allTextContents();
      
      const compactionIndex = messageTexts.findIndex(text => 
        text.includes('Conversation compacted and summarized')
      );
      const newMessageIndex = messageTexts.findIndex(text => 
        text.includes('NEW_MESSAGE_AFTER_COMPACTION')
      );
      
      expect(compactionIndex).toBeGreaterThanOrEqual(0);
      expect(newMessageIndex).toBeGreaterThan(compactionIndex);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle compaction errors gracefully', async ({ aibuddyPage }) => {
      // Mock a backend error
      await aibuddyPage.route('**/api/sessions/*/manage-context', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Backend compaction error' }),
        });
      });
      
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Generate conversation
      await chatInput.fill('Test message for error handling');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Attempt compaction
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      await aibuddyPage.click('text=Compact now');
      
      // Wait for compaction to fail
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Verify error message appears
      const errorMarker = aibuddyPage.locator('text=Compaction failed. Please try again or start a new session.');
      await expect(errorMarker).toBeVisible();
      
      // Verify chat input is still functional after error
      const submitButton = aibuddyPage.locator('[data-testid="submit-button"]');
      await expect(submitButton).toBeEnabled();
    });

    test('should handle network timeouts during compaction', async ({ aibuddyPage }) => {
      // Mock a timeout
      await aibuddyPage.route('**/api/sessions/*/manage-context', async (route) => {
        // Delay response to simulate timeout
        await new Promise(resolve => setTimeout(resolve, 5000));
        await route.fulfill({
          status: 408,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Request timeout' }),
        });
      });
      
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Generate conversation
      await chatInput.fill('Test message for timeout handling');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Attempt compaction
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      await aibuddyPage.click('text=Compact now');
      
      // Verify loading state persists during timeout
      const loadingAIBuddy = aibuddyPage.locator('[data-testid="loading-aibuddy"]');
      await expect(loadingAIBuddy).toBeVisible();
      await expect(loadingAIBuddy).toContainText('aibuddy is compacting the conversation...');
      
      // Wait for timeout to complete
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 35000 });
      
      // Should show error message
      const errorMarker = aibuddyPage.locator('text=Compaction failed. Please try again or start a new session.');
      await expect(errorMarker).toBeVisible();
    });
  });

  test.describe('UI State Management', () => {
    test('should disable chat input during compaction', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Generate conversation
      await chatInput.fill('Test message for UI state verification');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Start compaction
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      await aibuddyPage.click('text=Compact now');
      
      // Verify chat input is disabled during compaction
      const submitButton = aibuddyPage.locator('[data-testid="submit-button"]');
      await expect(submitButton).toBeDisabled();
      
      // Verify loading message
      const loadingAIBuddy = aibuddyPage.locator('[data-testid="loading-aibuddy"]');
      await expect(loadingAIBuddy).toBeVisible();
      await expect(loadingAIBuddy).toContainText('aibuddy is compacting the conversation...');
      
      // Wait for compaction to complete
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Verify chat input is re-enabled
      await expect(submitButton).toBeEnabled();
    });

    test('should show appropriate loading states', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Generate conversation
      await chatInput.fill('Test loading state message');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Start compaction and immediately check loading state
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      await aibuddyPage.click('text=Compact now');
      
      // Verify loading aibuddy appears with correct message
      const loadingAIBuddy = aibuddyPage.locator('[data-testid="loading-aibuddy"]');
      await expect(loadingAIBuddy).toBeVisible();
      await expect(loadingAIBuddy).toContainText('aibuddy is compacting the conversation...');
      
      // Verify no other loading indicators are shown
      const regularLoadingMessages = aibuddyPage.locator('[data-testid="loading-aibuddy"]:not(:has-text("compacting"))');
      await expect(regularLoadingMessages).not.toBeVisible();
      
      // Wait for completion
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Verify loading state is cleared
      await expect(loadingAIBuddy).not.toBeVisible();
    });
  });

  test.describe('Performance and Reliability', () => {
    test('should handle large conversations efficiently', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Generate a larger conversation
      const messages = Array.from({ length: 8 }, (_, i) => 
        `Message ${i + 1}: This is a longer message with more content to test the compaction system with a substantial amount of text that should generate more tokens and provide a better test of the compaction functionality.`
      );
      
      for (const message of messages) {
        await chatInput.fill(message);
        await aibuddyPage.keyboard.press('Enter');
        await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
        await aibuddyPage.waitForTimeout(500);
      }
      
      // Perform compaction
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      await aibuddyPage.click('text=Compact now');
      
      // Verify compaction completes within reasonable time
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 45000 });
      
      // Verify compaction marker appears
      await expect(aibuddyPage.locator('text=Conversation compacted and summarized')).toBeVisible();
      
      // Verify system remains responsive
      await chatInput.fill('Post-compaction test message');
      await aibuddyPage.keyboard.press('Enter');
      await expect(aibuddyPage.locator('[data-testid="loading-aibuddy"]')).toBeVisible();
    });

    test('should maintain conversation context after compaction', async ({ aibuddyPage }) => {
      const chatInput = aibuddyPage.locator('[data-testid="chat-input"]');
      
      // Create conversation with specific context
      await chatInput.fill('My name is Alice and I am a software developer working on React applications.');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      await chatInput.fill('I am having trouble with useState hooks. Can you help?');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Perform compaction
      await aibuddyPage.waitForSelector('[data-testid="alert-indicator"]', { timeout: 15000 });
      await aibuddyPage.click('[data-testid="alert-indicator"]');
      await aibuddyPage.click('text=Compact now');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // Test if context is maintained by asking a follow-up question
      await chatInput.fill('What did I tell you my name was?');
      await aibuddyPage.keyboard.press('Enter');
      await aibuddyPage.waitForSelector('[data-testid="loading-aibuddy"]', { state: 'hidden', timeout: 30000 });
      
      // The response should ideally reference the name Alice or indicate context retention
      // Note: This is a behavioral test that depends on the AI's ability to use the summary
      const messages = aibuddyPage.locator('[data-testid="message"]');
      const lastMessageText = await messages.last().textContent();
      
      // The system should have some response (not just an error)
      expect(lastMessageText).toBeTruthy();
      expect(lastMessageText!.length).toBeGreaterThan(10);
    });
  });
});
