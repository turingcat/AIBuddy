---
sidebar_position: 90
title: Running a Remote aibuddy Server
sidebar_label: Remote Server
---

# Running a Remote aibuddy Server

aibuddy Desktop normally runs its own `aibuddy serve` ACP server process in the background on the same machine. You can also run `aibuddy serve` separately — for example, on a remote VM or a different machine on your network — and point aibuddy Desktop at it.

This is useful when you want aibuddy to run somewhere with more compute, a stable IP, or shared access, while still driving it from a local Desktop UI.

This guide covers:

1. [Starting a `aibuddy serve` server on a remote machine](#1-start-the-aibuddy-serve-server)
2. [Verifying it is reachable](#2-verify-the-server-is-up)
3. [Locating the certificate fingerprint](#3-find-the-certificate-fingerprint)
4. [Configuring aibuddy Desktop to connect to it](#4-configure-aibuddy-desktop)
5. [Running `aibuddy serve` as a background service on macOS](#running-aibuddy-serve-as-a-background-service-macos)
6. [Troubleshooting](#troubleshooting)

:::warning Use TLS for remote servers
aibuddy Desktop accepts both HTTP and HTTPS external backend URLs, but TLS is strongly recommended when connecting over a network. Certificate fingerprint pinning requires HTTPS.
:::

## Initial Setup

### 1. Start the `aibuddy serve` server

On the remote machine, launch `aibuddy serve` with the host, port, TLS, and a shared secret key:

```bash
AIBUDDY_SERVER__SECRET_KEY='YOUR_SECRET' \
aibuddy serve --platform desktop --enable-scheduler --host 0.0.0.0 --port 3000 --tls
```

If you are using the binary bundled with the macOS app, the command path is `/Applications/AIBuddy.app/Contents/Resources/bin/aibuddy`.

| Setting | Purpose |
|---------|---------|
| `--host` | Interface to bind to. Use `0.0.0.0` to accept connections from other machines. Binding to `localhost` or `127.0.0.1` will only accept local connections. |
| `--port` | TCP port to listen on. |
| `--tls` / `AIBUDDY_TLS=true` | Enables TLS. Strongly recommended for remote servers and required for certificate fingerprint pinning. |
| `AIBUDDY_SERVER__SECRET_KEY` | Shared secret. The client must send this to the ACP endpoint. Treat it like a password. |

:::tip
Pick a long, random value for `AIBUDDY_SERVER__SECRET_KEY` and store it in a password manager — the same value goes into aibuddy Desktop later.
:::

### 2. Verify the server is up

First, confirm `aibuddy serve` is actually listening on the port you expect:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Then test the server from the server itself. The `-k` flag tells `curl` to accept the self-signed TLS certificate that `aibuddy serve` generates:

```bash
# Connectivity only
curl -i https://127.0.0.1:3000/status -k

# ACP endpoint auth check. A 401 means the secret was rejected.
curl -i https://127.0.0.1:3000/acp -k \
  -H 'X-Secret-Key: YOUR_SECRET'
```

A successful `/status` response confirms that TLS is up. The `/acp` check should not return `401` when the secret is correct.

If you intend to reach the server from another machine, also test from there using the server's hostname or VPN address — not `127.0.0.1`.

### 3. Optionally find the certificate fingerprint

When `aibuddy serve` runs with TLS, it generates or loads a TLS certificate. aibuddy Desktop can pin that certificate by SHA-256 fingerprint. If you leave the fingerprint field empty, aibuddy Desktop uses trust-on-first-use and pins the first certificate it sees for that backend.

When TLS is enabled, `aibuddy serve` logs the fingerprint on startup. It looks like:

```text
AIBUDDYD_CERT_FINGERPRINT=AA:BB:CC:DD:EE:FF:...
```

To capture it, either:

- Run `aibuddy serve` interactively and read it from the terminal output, or
- Tail the log file you redirect to when running as a service (see [Running `aibuddy serve` as a background service](#running-aibuddy-serve-as-a-background-service-macos)):

```bash
grep AIBUDDYD_CERT_FINGERPRINT ~/Library/Logs/AIBuddyExternal/aibuddy-serve.out.log
```

Make a note of the fingerprint if you want to pin a specific certificate in aibuddy Desktop.

:::note
The fingerprint changes whenever `aibuddy serve` regenerates its certificate (for example, if you delete the cert file). If aibuddy Desktop suddenly refuses to connect after a server restart, re-check the fingerprint.
:::

### 4. Configure aibuddy Desktop

On the client machine, open aibuddy Desktop and navigate to **Settings → aibuddy Server**:

| Setting | Value |
|---------|-------|
| **Use external server** | Enabled |
| **URL** | `https://your-server-host:3000` (use the hostname or IP that the client can reach — for example a VPN/tailnet address) |
| **Secret Key** | The same value you used for `AIBUDDY_SERVER__SECRET_KEY` |
| **Certificate Fingerprint** | Optional. Use the `AIBUDDYD_CERT_FINGERPRINT` value from the server logs to pin a specific TLS certificate. |

After saving, aibuddy Desktop will route all backend requests to the remote `aibuddy serve` process. If the connection fails, see [Troubleshooting](#troubleshooting).

## Running `aibuddy serve` as a Background Service (macOS)

Running `aibuddy serve` in a terminal session is fine for testing, but for everyday use you probably want it managed as a background service so it starts at login and restarts on failure. On macOS, this is done with `launchd`.

Create a LaunchAgent plist at `~/Library/LaunchAgents/com.aibuddy.serve.external.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.aibuddy.serve.external</string>

    <key>ProgramArguments</key>
    <array>
      <string>/Applications/AIBuddy.app/Contents/Resources/bin/aibuddy</string>
      <string>serve</string>
      <string>--platform</string>
      <string>desktop</string>
      <string>--enable-scheduler</string>
      <string>--host</string>
      <string>0.0.0.0</string>
      <string>--port</string>
      <string>3000</string>
      <string>--tls</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
      <key>AIBUDDY_SERVER__SECRET_KEY</key><string>YOUR_SECRET</string>
    </dict>

    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>

    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/Library/Logs/AIBuddyExternal/aibuddy-serve.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/Library/Logs/AIBuddyExternal/aibuddy-serve.err.log</string>
  </dict>
</plist>
```

Replace `YOUR_SECRET` and `YOUR_USERNAME` with appropriate values, and make sure the log directory exists:

```bash
mkdir -p ~/Library/Logs/AIBuddyExternal
```

Then load and start the service:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.aibuddy.serve.external.plist
launchctl kickstart -k gui/$(id -u)/com.aibuddy.serve.external
```

To stop or remove it later:

```bash
launchctl bootout gui/$(id -u)/com.aibuddy.serve.external
```

:::tip
Because the secret key is stored in plain text in the plist, the file should be readable only by your user. macOS LaunchAgents under `~/Library/LaunchAgents/` are already user-scoped, but you can tighten further with `chmod 600 ~/Library/LaunchAgents/com.aibuddy.serve.external.plist`.
:::

## Troubleshooting

### Server only accepts local connections

If `curl` works from the server but the client machine times out or gets "connection refused", check what interface `aibuddy serve` is bound to. If `--host` is `localhost` or `127.0.0.1`, only loopback connections are accepted.

Set `--host 0.0.0.0` to accept connections on all interfaces, then restart `aibuddy serve`. You can verify with:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

The output should show the address as `*:3000` or the specific external IP, not `127.0.0.1:3000`.

### TLS is not enabled

In the server's startup logs:

- If you see `listening on http://...`, TLS is **not** enabled. aibuddy Desktop can still connect over HTTP, but this is not recommended for remote servers. Start with `--tls` or `AIBUDDY_TLS=true` and restart `aibuddy serve`.
- If you see `listening on https://...`, TLS is enabled and you are good to go.

The startup logs also contain the `AIBUDDYD_CERT_FINGERPRINT=...` line you can use for certificate pinning in aibuddy Desktop. Search the server's stdout (or log file, if running under `launchd`) for `AIBUDDYD_CERT_FINGERPRINT` to find it.

### Client cannot authenticate (401 / Unauthorized)

A `401` from the server, or a aibuddy Desktop error indicating that the secret was rejected, almost always means that `AIBUDDY_SERVER__SECRET_KEY` on the server does not match the **Secret Key** in aibuddy Desktop's settings.

To check the secret end-to-end without involving aibuddy Desktop, run the authenticated `curl` from [step 2](#2-verify-the-server-is-up) using exactly the value you have configured on the client. For this `GET /acp` probe, a `406` response means authentication passed but the request did not include the SSE headers needed by the ACP stream. A `401` or `403` means the secret on the server is different from what you are sending.

If you rotate the secret on the server, you must also update it in aibuddy Desktop's settings — they are not synchronized automatically.

### Certificate fingerprint mismatch

If aibuddy Desktop refuses to connect with a certificate or fingerprint error, the most common causes are:

- The server regenerated its certificate (for example, after deleting the cert file). Look at the latest startup logs for the current `AIBUDDYD_CERT_FINGERPRINT` and update aibuddy Desktop.
- You copied the fingerprint with extra whitespace or pasted the wrong value.

## Related

- [Environment Variables](/docs/guides/environment-variables) — full reference for all `AIBUDDY_*` variables
- [Configuration Files](/docs/guides/config-files) — persistent client-side configuration
