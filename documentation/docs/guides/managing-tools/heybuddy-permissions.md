---
sidebar_position: 20
title: heybuddy Permission Modes
sidebar_label: heybuddy Permissions
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import { PanelLeft, Tornado } from 'lucide-react';

heybuddy’s permissions determine how much autonomy it has when modifying files, using extensions, and performing automated actions. By selecting a permission mode, you have full control over how heybuddy interacts with your development environment.

<details>
  <summary>Permission Modes Video Walkthrough</summary>
  <iframe
  class="aspect-ratio"
  src="https://www.youtube.com/embed/bMVFFnPS_Uk"
  title="heybuddy Permission Modes Explained"
  frameBorder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
  ></iframe>
</details>

## Permission Modes

| Mode | Description | Best For |
|------|-------------|----------|
| **Completely Autonomous** | heybuddy can modify files, use extensions, and delete files **without requiring approval** | Users who want **full automation** and seamless integration into their workflow |
| **Manual Approval** | heybuddy **asks for confirmation** before using any tools or extensions (supports granular [tool permissions](/docs/guides/managing-tools/tool-permissions)) | Users who want to **review and approve** every change and tool usage |
| **Smart Approval** | heybuddy uses a risk-based approach to **automatically approve low-risk actions** and **flag others** for approval (supports granular [tool permissions](/docs/guides/managing-tools/tool-permissions))  | Users who want a **balanced mix of autonomy and oversight** based on the action’s impact |
| **Chat Only** | heybuddy **only engages in chat**, with no extension use or file modifications | Users who prefer a **conversational AI experience** for analysis, writing, and reasoning tasks without automation |

:::warning
`Autonomous Mode` is applied by default.
:::

## Configuring heybuddy mode

Here's how to configure:

<Tabs groupId="interface">
  <TabItem value="ui" label="heybuddy Desktop" default>

    You can change modes before or during a session and it will take effect immediately.

     <Tabs groupId="method">
      <TabItem value="session" label="In Session" default>

      Click the <Tornado className="inline" size={16} /> mode button from the bottom menu. 
      </TabItem>
      <TabItem value="settings" label="From Settings">
        1. Click the <PanelLeft className="inline" size={16} /> button on the top-left to open the sidebar.
        2. Click the `Settings` button on the sidebar.
        3. Click `Chat`.
        4. Under `Mode`, choose the mode you'd like.
      </TabItem>
    </Tabs>   
  </TabItem>
  <TabItem value="cli" label="heybuddy CLI">

    <Tabs groupId="method">
      <TabItem value="session" label="In Session" default>
        To change modes mid-session, use the `/mode` command.

        * Autonomous: `/mode auto`
        * Smart Approve: `/mode smart_approve`
        * Approve: `/mode approve`
        * Chat: `/mode chat`     
      </TabItem>
      <TabItem value="settings" label="From Settings">
        1. Run the following command:

        ```sh
        heybuddy configure
        ```

        2. Select `heybuddy settings` from the menu and press Enter.

        ```sh
        ┌ heybuddy-configure
        │
        ◆ What would you like to configure?
        | ○ Configure Providers
        | ○ Add Extension
        | ○ Toggle Extensions
        | ○ Remove Extension
        // highlight-start
        | ● heybuddy settings (Set the heybuddy mode, Tool Output, Tool Permissions, Experiment, heybuddy recipe github repo and more)
        // highlight-end
        └
        ```

        3. Choose `heybuddy mode` from the menu and press Enter.

        ```sh
        ┌   heybuddy-configure
        │
        ◇  What would you like to configure?
        │  heybuddy settings 
        │
        ◆  What setting would you like to configure?
        // highlight-start
        │  ● heybuddy mode (Configure heybuddy mode)
        // highlight-end
        │  ○ Router Tool Selection Strategy 
        │  ○ Tool Permission 
        │  ○ Tool Output 
        │  ○ Max Turns 
        │  ○ Toggle Experiment 
        │  ○ heybuddy recipe github repo 
        │  ○ Scheduler Type 
        └
        ```

        4.  Choose the heybuddy mode you would like to configure.

        ```sh
        ┌   heybuddy-configure
        │
        ◇  What would you like to configure?
        │  heybuddy settings
        │
        ◇  What setting would you like to configure?
        │  heybuddy mode
        │
        ◆  Which heybuddy mode would you like to configure?
        // highlight-start
        │  ● Auto Mode (Full file modification, extension usage, edit, create and delete files freely)
        // highlight-end
        |  ○ Approve Mode
        |  ○ Smart Approve Mode    
        |  ○ Chat Mode
        |
        └  Set to Auto Mode - full file modification enabled
        ```     
      </TabItem>
    </Tabs>
  </TabItem>
</Tabs>

  :::info
  In manual and smart approval modes, you will see "Allow" and "Deny" buttons in your session windows during tool calls. 
  heybuddy will only ask for permission for tools that it deems are 'write' tools, e.g. any 'text editor write', 'text editor edit', 'bash - rm, cp, mv' commands. 
  
  Read/write approval makes best effort attempt at classifying read or write tools. This is interpreted by your LLM provider. 
  :::

## CLI Provider Permission Integration

When using [CLI providers](/docs/guides/cli-providers) like Claude Code, heybuddy integrates with the provider's native permission system. In approve mode, permission requests from Claude Code are routed through heybuddy's confirmation interface, giving you a unified experience.

For example, with Claude Code in approve mode:
- Claude Code detects sensitive operations (file writes, shell commands, tool calls)
- The permission prompt appears in heybuddy's interface (CLI or Desktop)
- Your allow/deny decision is sent back to Claude Code
- Claude Code proceeds or adapts based on your response

This integration uses the same mechanism as the official Claude Agent SDKs, ensuring compatibility and consistent behavior.

See [CLI Providers - Claude Code Configuration](/docs/guides/cli-providers#claude-code-configuration) for setup details.
