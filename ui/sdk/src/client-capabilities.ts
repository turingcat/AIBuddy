import type { AIBuddyMcpHostCapabilities } from "./mcp-apps.js";

export interface AIBuddyClientCapabilitiesMeta {
  aibuddy?: {
    mcpHostCapabilities?: AIBuddyMcpHostCapabilities;
    customNotifications?: boolean;
  };
}
