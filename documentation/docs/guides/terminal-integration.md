# Terminal Integration

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

Talk to aibuddy directly from your shell prompt. Instead of switching to a separate REPL session, stay in your terminal and call aibuddy when you need it.

## Setup

<Tabs groupId="shells">
<TabItem value="zsh" label="zsh" default>

Add to `~/.zshrc`:
```bash
eval "$(aibuddy term init zsh)"
```

</TabItem>
<TabItem value="bash" label="bash">

Add to `~/.bashrc`:
```bash
eval "$(aibuddy term init bash)"
```

</TabItem>
<TabItem value="fish" label="fish">

Add to `~/.config/fish/config.fish`:
```fish
aibuddy term init fish | source
```

</TabItem>
<TabItem value="nu" label="Nushell">

Add to `~/.config/nushell/config.nu`:
```nu
let aibuddy_term_init = ($nu.cache-dir | path join "aibuddy-term-init.nu")
^aibuddy term init nu | save --force $aibuddy_term_init
source $aibuddy_term_init
```

</TabItem>
<TabItem value="powershell" label="PowerShell">

Add to `$PROFILE`:
```powershell
Invoke-Expression (aibuddy term init powershell)
```

</TabItem>
</Tabs>

Restart your terminal or source the config, and that's it!

## Usage

Just type `@aibuddy` (or `@g` for short) followed by your question:

```bash
npm install express
    npm ERR! code EACCES
    npm ERR! permission denied

@aibuddy "how do I fix this error?"
```

aibuddy automatically sees the commands you've run since your last question, so you don't need to explain what you've been doing. Use quotes around your prompt if it contains special characters like `?`, `*`, or `'`:

```bash
@aibuddy "what's in this directory?"
@g "analyze the error: 'permission denied'"
```

## Named Sessions
By default, each terminal gets its own aibuddy session that lasts until you close it. Named sessions let you continue conversations across terminal restarts and share context between windows.

<Tabs groupId="shells">
<TabItem value="zsh" label="zsh" default>

```bash
eval "$(aibuddy term init zsh --name my-project)"
```

</TabItem>
<TabItem value="bash" label="bash">

```bash
eval "$(aibuddy term init bash --name my-project)"
```

</TabItem>
<TabItem value="fish" label="fish">

```fish
aibuddy term init fish --name my-project | source
```

</TabItem>
<TabItem value="nu" label="Nushell">

```nu
let aibuddy_term_init = ($nu.cache-dir | path join "aibuddy-term-init.nu")
^aibuddy term init nu --name my-project | save --force $aibuddy_term_init
source $aibuddy_term_init
```

</TabItem>
<TabItem value="powershell" label="PowerShell">

```powershell
Invoke-Expression (aibuddy term init powershell --name my-project)
```

</TabItem>
</Tabs>

Named sessions persist in aibuddy's database, so they're available anytime, even after restarting your computer. Reopen later and run the same command to continue:

```bash
# Start debugging
eval "$(aibuddy term init zsh --name auth-bug)"
@aibuddy help me debug this login timeout

# Close terminal, come back later
eval "$(aibuddy term init zsh --name auth-bug)"
@aibuddy "what was the solution we discussed?"
# Continues the same conversation with context
```

## Default Handler

Use `--default` if you want aibuddy to answer commands your shell cannot resolve.

<Tabs groupId="default-shells">
<TabItem value="zsh" label="zsh" default>

```bash
eval "$(aibuddy term init zsh --default)"
```

</TabItem>
<TabItem value="bash" label="bash">

```bash
eval "$(aibuddy term init bash --default)"
```

</TabItem>
<TabItem value="nu" label="Nushell">

```nu
let aibuddy_term_init = ($nu.cache-dir | path join "aibuddy-term-init.nu")
^aibuddy term init nu --default | save --force $aibuddy_term_init
source $aibuddy_term_init
```

</TabItem>
</Tabs>

## Show Context Status in Your Prompt

Add `aibuddy term info` to your prompt to see how much context you've used and which model is active during a terminal aibuddy session. 

<Tabs groupId="shells">
<TabItem value="zsh" label="zsh" default>

```bash
PROMPT='$(aibuddy term info) %~ $ '
```

</TabItem>
<TabItem value="bash" label="bash">

```bash
PS1='$(aibuddy term info) \w $ '
```

</TabItem>
<TabItem value="fish" label="fish">

```fish
function fish_prompt
    aibuddy term info
    echo -n ' '(prompt_pwd)' $ '
end
```

</TabItem>
<TabItem value="nu" label="Nushell">

```nu
$env.PROMPT_COMMAND = {|| $"(aibuddy term info) (pwd)> " }
```

</TabItem>
<TabItem value="powershell" label="PowerShell">

```powershell
function prompt {
    $aibuddyInfo = & aibuddy term info
    "$aibuddyInfo $(Get-Location) PS> "
}
```

</TabItem>
</Tabs>

Your terminal prompt now shows the context usage and model name (shortened for readability) for the active aibuddy session. For example:

```bash
●●○○○ sonnet ~/projects $
```
## Shell Completion for aibuddy Commands

`@aibuddy` provides context-aware assistance based on your command history. To enable tab completion of aibuddy CLI commands (like `aibuddy session`, `aibuddy run`, etc.), see the [shell completion documentation](/docs/guides/aibuddy-cli-commands#completion).

## Troubleshooting

**aibuddy doesn't see recent commands:**
If you run commands but aibuddy says it doesn't see any recent activity, check if terminal integration is properly [set up in your shell config](#setup).
You can also check the id of the aibuddy session in your current terminal:
```bash
# Check if session ID exists
echo $AGENT_SESSION_ID
# Should show something like: 20251209_151730
```
```nu
# Nushell
$env.AGENT_SESSION_ID
# Should show something like: 20251209_151730
```
To share context across terminal windows, use a [named session](#named-sessions) instead.

**Session getting too full** (prompt shows `●●●●●`):
If aibuddy's responses are getting slow or hitting context limits, start a fresh aibuddy session in the terminal. The new aibuddy session sees your command history, but not the conversation history from the previous session. 
```bash
# Start a new aibuddy session in the same shell
eval "$(aibuddy term init zsh)"
```
```nu
# Nushell
let aibuddy_term_init = ($nu.cache-dir | path join "aibuddy-term-init.nu")
^aibuddy term init nu | save --force $aibuddy_term_init
source $aibuddy_term_init
```
