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
      heybuddyMode?: string;
    }
  | { type: 'localSteerConfirmed'; messageId: string }
  | { type: 'notification'; notification: NotificationEvent };

export interface AdapterState {
  messages: Message[];
  localSteerTextByMessageId: Map<string, string>;
  toolCallStatesById: Map<string, ToolCallState>;
}

export type ToolCallState = Omit<ToolCallUpdate, '_meta'>;

export interface HeyBuddyMessageMeta {
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

export function getHeyBuddyMessageMeta(update: { _meta?: unknown }): HeyBuddyMessageMeta {
  if (!isRecord(update._meta)) {
    return {};
  }

  const heybuddy = update._meta.heybuddy;
  if (!isRecord(heybuddy)) {
    return {};
  }

  const outputTokenLimitReached = heybuddy.outputTokenLimitReached === true;

  return {
    created: typeof heybuddy.created === 'number' ? heybuddy.created : undefined,
    messageId: typeof heybuddy.messageId === 'string' ? heybuddy.messageId : undefined,
    outputTokenLimitReached: outputTokenLimitReached ? true : undefined,
    fallbackContent: heybuddy.fallbackContent === true ? true : undefined,
    steer: heybuddy.steer === true ? true : undefined,
  };
}

export function getHeyBuddyActiveRunId(update: { _meta?: unknown }): string | null | undefined {
  if (!isRecord(update._meta)) {
    return undefined;
  }

  const heybuddy = update._meta.heybuddy;
  if (!isRecord(heybuddy) || !('activeRunId' in heybuddy)) {
    return undefined;
  }

  return typeof heybuddy.activeRunId === 'string' || heybuddy.activeRunId === null
    ? heybuddy.activeRunId
    : undefined;
}

export function getHeyBuddyQueuedSteer(update: { _meta?: unknown }): string | undefined {
  if (!isRecord(update._meta)) return undefined;
  const heybuddy = update._meta.heybuddy;
  if (!isRecord(heybuddy) || !isRecord(heybuddy.queuedSteer)) return undefined;
  return typeof heybuddy.queuedSteer.messageId === 'string' ? heybuddy.queuedSteer.messageId : undefined;
}

export function rawInputToArguments(rawInput: unknown): Record<string, unknown> {
  return isRecord(rawInput) ? rawInput : {};
}

export function toolIdentity(update: ToolCall | ToolCallUpdate): ToolIdentity {
  if (!isRecord(update._meta)) {
    return {};
  }

  const heybuddy = update._meta.heybuddy;
  if (!isRecord(heybuddy) || !isRecord(heybuddy.toolCall)) {
    return {};
  }

  return {
    toolName: typeof heybuddy.toolCall.toolName === 'string' ? heybuddy.toolCall.toolName : undefined,
    extensionName:
      typeof heybuddy.toolCall.extensionName === 'string' ? heybuddy.toolCall.extensionName : undefined,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
