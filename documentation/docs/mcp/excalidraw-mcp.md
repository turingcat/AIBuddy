---
title: Excalidraw Extension
description: Add Excalidraw MCP App as a aibuddy Extension
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import YouTubeShortEmbed from '@site/src/components/YouTubeShortEmbed';
import CLIExtensionInstructions from '@site/src/components/CLIExtensionInstructions';
import AIBuddyDesktopInstaller from '@site/src/components/AIBuddyDesktopInstaller';

<YouTubeShortEmbed videoUrl="https://www.youtube.com/embed/REc5IvWvI5s" />

This tutorial covers how to add the [Excalidraw MCP App](https://github.com/excalidraw/excalidraw-mcp) as a aibuddy extension that enables aibuddy to draw hand sketched Excalidraw diagrams in real time.

:::tip Quick Install
<Tabs groupId="interface">
  <TabItem value="ui" label="aibuddy Desktop" default>
   [Launch the installer](goose://extension?cmd=http&id=excalidraw&name=Excalidraw&url=https%3A%2F%2Fexcalidraw-mcp-app.vercel.app%2Fmcp&description=Excalidraw%20MCP%20App%20for%20AI-powered%20diagramming)
  </TabItem>
  <TabItem value="cli" label="aibuddy CLI">
  Add a `Remote Extension (Streamable HTTP)` extension type with:

  **Endpoint URL**
  ```
  https://excalidraw-mcp-app.vercel.app/mcp
  ```
  </TabItem>
</Tabs>
:::

## Configuration
These steps configure the Remote MCP Server. For other deployment options, see the [Excalidraw MCP App documentation](https://github.com/excalidraw/excalidraw-mcp).

<Tabs groupId="interface">
  <TabItem value="ui" label="aibuddy Desktop" default>
    <AIBuddyDesktopInstaller
      extensionId="Excalidraw"
      extensionName="Excalidraw MCP App"
      description="Excalidraw MCP App for diagramming"
      type="http"
      url="https://excalidraw-mcp-app.vercel.app/mcp"
      envVars={[]}
    />

  </TabItem>
  <TabItem value="cli" label="aibuddy CLI">
    <CLIExtensionInstructions
      name="Excalidraw"
      description="Excalidraw MCP App for diagramming"
      type="http"
      url="https://excalidraw-mcp-app.vercel.app/mcp"
      timeout={300}
    />

  </TabItem>
</Tabs>

## Example Usage

In this example, we use the Excalidraw MCP App to have AIBuddy visualize its own automation pipeline in real time. This demonstrates how AIBuddy can connect to live tools, reason about workflows, and generate structured diagrams element by element.

### aibuddy Prompt
```
Hey AIBuddy review my video automation recipe and create a visual of the automation pipeline for me. I want clean lines and clear labels.
```

### aibuddy Output

```

─── reading /Users/ebonyl/Desktop/plug-and-play-video.yaml ──────────────────────────

─── Create View elements: [ {"type":"cameraUpdate","width":600}, ...] ──────────────────────────

```
![excalidraw image](/img/excalidrawImage.png)
