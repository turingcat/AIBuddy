import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '../types/message';
import GooseMessage from './GooseMessage';

vi.mock('./ToolCallWithResponse', () => ({
  default: ({ isCancelledMessage }: { isCancelledMessage: boolean }) => (
    <div data-testid="tool-call" data-cancelled={String(isCancelledMessage)} />
  ),
}));

const toolRequestMessage: Message = {
  id: 'assistant-tool-request',
  role: 'assistant',
  created: 1,
  metadata: { agentVisible: true, userVisible: true },
  content: [
    {
      type: 'toolRequest',
      id: 'tool-1',
      toolCall: {
        status: 'success',
        value: {
          name: 'developer__shell',
          arguments: { command: 'build' },
        },
      },
    },
  ],
};

const laterUserMessage: Message = {
  id: 'later-user-message',
  role: 'user',
  created: 2,
  metadata: { agentVisible: true, userVisible: true },
  content: [{ type: 'text', text: 'continue' }],
};

describe('GooseMessage', () => {
  it('marks an older unmatched tool request as cancelled', () => {
    render(
      <GooseMessage
        sessionId="session-1"
        message={toolRequestMessage}
        messages={[toolRequestMessage, laterUserMessage]}
        toolCallNotifications={new Map()}
        append={vi.fn()}
        isStreaming={false}
      />
    );

    expect(screen.getByTestId('tool-call')).toHaveAttribute('data-cancelled', 'true');
  });
});
