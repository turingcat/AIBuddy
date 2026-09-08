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

export const HEYBUDDY_MCP_UI_EXTENSION_ID = "io.modelcontextprotocol/ui" as const;

export interface HeyBuddyMcpUiExtensionSettings {
  mimeTypes: string[];
}

export interface HeyBuddyMcpHostCapabilities {
  extensions: Record<string, HeyBuddyMcpUiExtensionSettings>;
}

export type HeyBuddyToolUiMetadata = Extract<
  McpUiAppToolConfig["_meta"],
  { ui: unknown }
>["ui"];

export type HeyBuddyToolMetadata = NonNullable<Tool["_meta"]> & {
  ui?: HeyBuddyToolUiMetadata;
  heybuddy_extension?: string;
};

export type HeyBuddySessionTool = Tool & {
  meta?: HeyBuddyToolMetadata;
  _meta?: HeyBuddyToolMetadata;
};

export type HeyBuddyTextResourceContents = TextResourceContents;

export type HeyBuddyBlobResourceContents = BlobResourceContents;

export type HeyBuddyResourceContents = TextResourceContents | BlobResourceContents;

export type HeyBuddyReadResourceResult = ReadResourceResult;

export type HeyBuddyResourceMetadata = NonNullable<
  Extract<NonNullable<McpUiAppResourceConfig["_meta"]>, { ui?: unknown }>["ui"]
>;

export interface HeyBuddyMcpAppToolPayload {
  toolName: string;
  extensionName: string;
  resourceUri: string;
  toolMeta?: HeyBuddyToolMetadata;
  resourceResult?: HeyBuddyReadResourceResult | null;
  readError?: string;
}

export interface HeyBuddyToolCallUpdateMeta {
  heybuddy?: {
    mcpApp?: HeyBuddyMcpAppToolPayload;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const DEFAULT_HEYBUDDY_MCP_HOST_CAPABILITIES: HeyBuddyMcpHostCapabilities = {
  extensions: {
    [HEYBUDDY_MCP_UI_EXTENSION_ID]: {
      mimeTypes: [RESOURCE_MIME_TYPE],
    },
  },
};
