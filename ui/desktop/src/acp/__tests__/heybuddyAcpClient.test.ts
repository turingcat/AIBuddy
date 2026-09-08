import { describe, expect, it, vi } from 'vitest';
import type { AnyMessage, Stream } from '@agentclientprotocol/sdk';
import { connectHeyBuddyAcpClient, type HeyBuddyAcpCallbacks } from '../heybuddyAcpClient';

function createTestStream(): Stream & {
  push(message: AnyMessage): void;
  writes: AnyMessage[];
} {
  let controller: ReadableStreamDefaultController<AnyMessage> | undefined;
  const writes: AnyMessage[] = [];

  return {
    readable: new ReadableStream<AnyMessage>({
      start(nextController) {
        controller = nextController;
      },
    }),
    writable: new WritableStream<AnyMessage>({
      write(message) {
        writes.push(message);
      },
    }),
    push(message) {
      controller?.enqueue(message);
    },
    writes,
  };
}

function callbacks(): HeyBuddyAcpCallbacks {
  return {
    requestPermission: vi.fn().mockResolvedValue({
      outcome: { outcome: 'selected', optionId: 'allow' },
    }),
    sessionUpdate: vi.fn(),
    unstable_createElicitation: vi.fn(),
    unstable_sessionRecipeRequestParams: vi.fn().mockResolvedValue({
      action: 'submit',
      values: { name: 'Ada' },
    }),
    unstable_sessionUpdate: vi.fn(),
    unstable_providerDeviceCode: vi.fn(),
  };
}

async function waitForWrites(stream: { writes: AnyMessage[] }, count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(stream.writes).toHaveLength(count);
  });
}

describe('HeyBuddy ACP client composition', () => {
  it('registers standard and HeyBuddy-specific handlers on a live ACP connection', async () => {
    const stream = createTestStream();
    const handlers = callbacks();
    const client = connectHeyBuddyAcpClient(stream, handlers);

    stream.push({
      jsonrpc: '2.0',
      id: 1,
      method: 'session/request_permission',
      params: {
        sessionId: 'session-1',
        toolCall: { toolCallId: 'tool-1' },
        options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
      },
    });
    await waitForWrites(stream, 1);

    expect(handlers.requestPermission).toHaveBeenCalledOnce();
    expect(stream.writes[0]).toMatchObject({
      id: 1,
      result: { outcome: { outcome: 'selected', optionId: 'allow' } },
    });

    stream.push({
      jsonrpc: '2.0',
      method: '_heybuddy/unstable/session/update',
      params: {
        sessionId: 'session-1',
        update: {
          sessionUpdate: 'status_message',
          status: { type: 'notice', message: 'ready' },
        },
      },
    });

    await vi.waitFor(() => {
      expect(handlers.unstable_sessionUpdate).toHaveBeenCalledOnce();
    });

    stream.push({
      jsonrpc: '2.0',
      id: 2,
      method: '_heybuddy/unstable/session/recipe/request-params',
      params: {
        sessionId: 'session-1',
        parameters: [
          {
            key: 'name',
            input_type: 'string',
            requirement: 'user_prompt',
            description: 'Name',
          },
        ],
      },
    });

    await waitForWrites(stream, 2);
    expect(handlers.unstable_sessionRecipeRequestParams).toHaveBeenCalledOnce();
    expect(stream.writes[1]).toMatchObject({
      id: 2,
      result: { action: 'submit', values: { name: 'Ada' } },
    });

    const toolsRequest = client.heybuddy.toolsList_unstable({ sessionId: 'session-1' });
    await waitForWrites(stream, 3);
    const outboundRequest = stream.writes[2] as { id: number; method: string };
    expect(outboundRequest.method).toBe('_heybuddy/unstable/tools/list');
    stream.push({
      jsonrpc: '2.0',
      id: outboundRequest.id,
      result: { tools: [] },
    });
    await expect(toolsRequest).resolves.toEqual({ tools: [] });

    client.connection.close();
    await client.connection.closed;
  });
});
