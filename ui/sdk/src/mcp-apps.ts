import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/app-bridge";
import type {
  McpUiAppResourceConfig,
  McpUiAppToolConfig,
} from "@modelcontextprotocol/ext-apps/server";
import type {
  BlobResourceContents,
  ReadResourceResult,
  TextResourceContents,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

export const AIBUDDY_MCP_UI_EXTENSION_ID = "io.modelcontextprotocol/ui" as const;

export interface AIBuddyMcpUiExtensionSettings {
  mimeTypes: string[];
}

export interface AIBuddyMcpHostCapabilities {
  extensions: Record<string, AIBuddyMcpUiExtensionSettings>;
}

export type AIBuddyToolUiMetadata = Extract<
  McpUiAppToolConfig["_meta"],
  { ui: unknown }
>["ui"];

export type AIBuddyToolMetadata = NonNullable<Tool["_meta"]> & {
  ui?: AIBuddyToolUiMetadata;
  aibuddy_extension?: string;
};

export type AIBuddySessionTool = Tool & {
  meta?: AIBuddyToolMetadata;
  _meta?: AIBuddyToolMetadata;
};

export type AIBuddyTextResourceContents = TextResourceContents;

export type AIBuddyBlobResourceContents = BlobResourceContents;

export type AIBuddyResourceContents = TextResourceContents | BlobResourceContents;

export type AIBuddyReadResourceResult = ReadResourceResult;

export type AIBuddyResourceMetadata = NonNullable<
  Extract<NonNullable<McpUiAppResourceConfig["_meta"]>, { ui?: unknown }>["ui"]
>;

export interface AIBuddyMcpAppToolPayload {
  toolName: string;
  extensionName: string;
  resourceUri: string;
  toolMeta?: AIBuddyToolMetadata;
  resourceResult?: AIBuddyReadResourceResult | null;
  readError?: string;
}

export interface AIBuddyToolCallUpdateMeta {
  aibuddy?: {
    mcpApp?: AIBuddyMcpAppToolPayload;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const DEFAULT_AIBUDDY_MCP_HOST_CAPABILITIES: AIBuddyMcpHostCapabilities = {
  extensions: {
    [AIBUDDY_MCP_UI_EXTENSION_ID]: {
      mimeTypes: [RESOURCE_MIME_TYPE],
    },
  },
};
