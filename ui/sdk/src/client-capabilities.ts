import type { HeyBuddyMcpHostCapabilities } from "./mcp-apps.js";

export interface HeyBuddyClientCapabilitiesMeta {
  heybuddy?: {
    mcpHostCapabilities?: HeyBuddyMcpHostCapabilities;
    customNotifications?: boolean;
  };
}
