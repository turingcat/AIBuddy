import type { ToolCall, ToolCallUpdate } from '@agentclientprotocol/sdk';
import type { TokenState } from '../../types/chat';
import type { Message, NotificationEvent } from '../../types/message';

export type AcpChatStateChange =
  | { type: 'messages'; messages: Message[] }
  | { type: 'tokenState'; tokenState: Partial<TokenState> }
  | { type: 'progressMessage'; message: string | undefined }
  | {
      type: 'sessionInfo';
      name?: string;
      activeRunId?: string | null;
      aibuddyMode?: string;
    }
  | { type: 'localSteerConfirmed'; messageId: string }
  | { type: 'notification'; notification: NotificationEvent };

export interface AdapterState {
  messages: Message[];
  localSteerTextByMessageId: Map<string, string>;
  toolCallStatesById: Map<string, ToolCallState>;
}

export type ToolCallState = Omit<ToolCallUpdate, '_meta'>;

export interface AIBuddyMessageMeta {
  messageId?: string;
  created?: number;
  outputTokenLimitReached?: boolean;
  fallbackContent?: boolean;
  steer?: boolean;
}

export interface ToolIdentity {
  toolName?: string;
  extensionName?: string;
}

export const DEFAULT_VISIBLE_MESSAGE_METADATA: Message['metadata'] = {
  userVisible: true,
  agentVisible: true,
};

export function messagesChange(state: AdapterState): AcpChatStateChange[] {
  // Pass the live array by reference: the store is the only consumer and it
  // clones on write (applyChatStateChanges). Cloning here as well made every
  // streamed chunk O(messages) twice, which turns session-load replay into
  // O(n^2) on large sessions.
  return [{ type: 'messages', messages: state.messages }];
}

export function cloneMessage(message: Message): Message {
  return {
    ...message,
    content: message.content.map((content) => ({ ...content })),
    metadata: { ...message.metadata },
  };
}

export function getAIBuddyMessageMeta(update: { _meta?: unknown }): AIBuddyMessageMeta {
  if (!isRecord(update._meta)) {
    return {};
  }

  const aibuddy = update._meta.aibuddy;
  if (!isRecord(aibuddy)) {
    return {};
  }

  const outputTokenLimitReached = aibuddy.outputTokenLimitReached === true;

  return {
    created: typeof aibuddy.created === 'number' ? aibuddy.created : undefined,
    messageId: typeof aibuddy.messageId === 'string' ? aibuddy.messageId : undefined,
    outputTokenLimitReached: outputTokenLimitReached ? true : undefined,
    fallbackContent: aibuddy.fallbackContent === true ? true : undefined,
    steer: aibuddy.steer === true ? true : undefined,
  };
}

export function getAIBuddyActiveRunId(update: { _meta?: unknown }): string | null | undefined {
  if (!isRecord(update._meta)) {
    return undefined;
  }

  const aibuddy = update._meta.aibuddy;
  if (!isRecord(aibuddy) || !('activeRunId' in aibuddy)) {
    return undefined;
  }

  return typeof aibuddy.activeRunId === 'string' || aibuddy.activeRunId === null
    ? aibuddy.activeRunId
    : undefined;
}

export function getAIBuddyQueuedSteer(update: { _meta?: unknown }): string | undefined {
  if (!isRecord(update._meta)) return undefined;
  const aibuddy = update._meta.aibuddy;
  if (!isRecord(aibuddy) || !isRecord(aibuddy.queuedSteer)) return undefined;
  return typeof aibuddy.queuedSteer.messageId === 'string' ? aibuddy.queuedSteer.messageId : undefined;
}

export function rawInputToArguments(rawInput: unknown): Record<string, unknown> {
  return isRecord(rawInput) ? rawInput : {};
}

export function toolIdentity(update: ToolCall | ToolCallUpdate): ToolIdentity {
  if (!isRecord(update._meta)) {
    return {};
  }

  const aibuddy = update._meta.aibuddy;
  if (!isRecord(aibuddy) || !isRecord(aibuddy.toolCall)) {
    return {};
  }

  return {
    toolName: typeof aibuddy.toolCall.toolName === 'string' ? aibuddy.toolCall.toolName : undefined,
    extensionName:
      typeof aibuddy.toolCall.extensionName === 'string' ? aibuddy.toolCall.extensionName : undefined,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
