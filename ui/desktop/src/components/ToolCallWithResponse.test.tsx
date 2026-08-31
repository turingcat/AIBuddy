import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../i18n/test-utils';
import type {
  Message,
  NotificationEvent,
  ToolRequestMessageContent,
  ToolResponseMessageContent,
} from '../types/message';
import { getAnyToolConfirmationData } from '../types/message';
import { resolveAcpPermissionRequest } from '../acp/permissionRequests';
import ToolCallWithResponse from './ToolCallWithResponse';

vi.mock('../acp/permissionRequests', () => ({
  resolveAcpPermissionRequest: vi.fn(),
}));

const toolRequest: ToolRequestMessageContent = {
  type: 'toolRequest',
  id: 'tool-1',
  toolCall: {
    status: 'success',
    value: {
      name: 'developer__shell',
      arguments: {
        command: 'build',
      },
    },
  },
};

const liveOutputNotification: NotificationEvent = {
  type: 'Notification',
  request_id: 'tool-1',
  message: {
    method: 'goose/live_output',
    params: {
      sequence: 1,
      chunks: [
        {
          stream: 'stdout',
          output: 'starting\n',
        },
        {
          stream: 'stderr',
          output: 'checking\n',
        },
      ],
      truncated: false,
    },
  },
};

const toolResponse: ToolResponseMessageContent = {
  type: 'toolResponse',
  id: 'tool-1',
  toolResult: {
    status: 'success',
    value: {
      content: [
        {
          type: 'text',
          text: 'final result',
        },
      ],
      isError: false,
    },
  },
};

function renderToolCall(response?: ToolResponseMessageContent) {
  return render(
    <ToolCallWithResponse
      isCancelledMessage={false}
      toolRequest={toolRequest}
      toolResponse={response}
      notifications={[liveOutputNotification]}
      isStreamingMessage={!response}
      isPendingApproval={false}
    />,
    { wrapper: IntlTestWrapper }
  );
}

describe('ToolCallWithResponse live output', () => {
  beforeEach(() => {
    vi.mocked(window.electron.getSetting).mockResolvedValue('detailed');
  });

  it('renders raw live output while running and replaces it with the final result', async () => {
    const { rerender } = renderToolCall();

    expect(screen.getByText(/starting/)).toHaveTextContent('starting checking');
    expect(screen.queryByText(/stdout|stderr/)).not.toBeInTheDocument();

    rerender(
      <ToolCallWithResponse
        isCancelledMessage={false}
        toolRequest={toolRequest}
        toolResponse={toolResponse}
        notifications={[liveOutputNotification]}
        isStreamingMessage={false}
        isPendingApproval={false}
      />
    );

    expect(screen.queryByText(/starting/)).not.toBeInTheDocument();
    expect(await screen.findByText('final result')).toBeInTheDocument();
  });

  it('passes the current ACP permission generation through inline approval', async () => {
    const permissionMessage: Message = {
      content: [
        {
          type: 'actionRequired',
          data: {
            actionType: 'toolConfirmation',
            arguments: { command: 'build' },
            generation: 'permission-generation-1',
            id: 'tool-1',
            toolName: 'developer__shell',
          },
        },
      ],
      created: 0,
      metadata: { agentVisible: true, userVisible: true },
      role: 'assistant',
    };

    render(
      <ToolCallWithResponse
        sessionId="session-1"
        isCancelledMessage={false}
        toolRequest={toolRequest}
        isPendingApproval
        confirmationContent={getAnyToolConfirmationData(permissionMessage)}
      />,
      { wrapper: IntlTestWrapper }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Allow Once' }));

    expect(resolveAcpPermissionRequest).toHaveBeenCalledWith(
      'session-1',
      'tool-1',
      'permission-generation-1',
      'allow_once'
    );
  });

  it('keeps a user-visible tool image outside concise output details', async () => {
    vi.mocked(window.electron.getSetting).mockResolvedValue('concise');
    const imagePayload =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9L9ZcAAAAASUVORK5CYII=';
    const imageResponse: ToolResponseMessageContent = {
      ...toolResponse,
      toolResult: {
        status: 'success',
        value: {
          content: [
            {
              type: 'text',
              text: 'text result',
            },
            {
              type: 'image',
              mimeType: 'image/png',
              data: imagePayload,
            },
          ],
          isError: false,
        },
      },
    };

    renderToolCall(imageResponse);

    const images = screen.getByTestId('tool-result-images').querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', `data:image/png;base64,${imagePayload}`);
    expect(screen.queryByText('text result')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /Tool status: success running build/ })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Output' }));

    expect(screen.getByText('text result')).toBeVisible();
    expect(screen.queryByAltText('Tool result')).not.toBeInTheDocument();
    expect(screen.getByTestId('tool-result-images').querySelectorAll('img')).toHaveLength(1);
  });
});
