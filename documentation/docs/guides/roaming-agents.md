---
sidebar_position: 95
title: Roaming Agents
sidebar_label: Roaming Agents
---

Roaming agents let you reach a running aibuddy agent from another machine over a
peer-to-peer connection — no open ports, no VPN, no server to host. It's built
on [iroh](https://iroh.computer) (QUIC), so two machines can connect directly or
via a relay, typically without any firewall changes.

:::warning Opt-in build required
Roaming is an optional, experimental feature that is **not included in
released aibuddy binaries**. Every command in this guide requires a aibuddy built
from source with the `roaming` feature enabled:

```bash
cargo build --release -p aibuddy-cli --features roaming
```

On a default build, `aibuddy roam` reports an unrecognized subcommand.
:::

Roaming is designed to be **embedded**: the transport is a standalone Rust crate
(`aibuddy-roaming`) with no dependency on aibuddy's agent internals, the CLI exposes
it as `aibuddy roam` commands, and there are wasm bindings for browser apps. If
you build on aibuddy — or just want an authenticated p2p ACP transport — you can
use the same pieces directly. The web client (covered near the end) is a
**reference client** built entirely on this public surface.

Use it to drive your laptop's agent from another device, hand a one-shot task to
a remote agent, expose a remote agent to any local ACP client (like an editor),
or wire p2p agent access into your own application.

## The core idea: roaming is an ACP transport

Roaming does exactly one thing: it provides an **authenticated, peer-to-peer
[ACP](/docs/gdk/acp) transport**. The host runs aibuddy's real ACP
server; the connecting side is an ACP client. That's it.

Everything that feels "session-shaped" is therefore just plain ACP that happens
to run over a roaming connection — not a bespoke roaming feature:

| You want to… | It's just ACP… | Command |
|--------------|----------------|---------|
| List the remote's sessions | `session/list` | `roam delegate <target> --list-sessions` |
| Continue a specific session | `session/load` | `roam delegate <target> --session <id> "…"` |
| Run a fresh one-shot task | `session/new` + `session/prompt` | `roam delegate <target> "…"` |
| Drive a remote agent from a real UI | full ACP surface | `roam bridge` → Zed or another ACP editor |
| Quick interactive peek | a built-in REPL | `roam connect` |

Because the connection carries the full ACP surface, the connecting side can
enumerate, create, and resume the host's sessions with no roaming-specific
protocol. Higher-level behaviours (saved peers) sit *above* the transport and
are described below.

:::note
Roaming is an optional, experimental feature. It's available when aibuddy is built
with the `roaming` feature (`cargo build -p aibuddy-cli --features roaming`).
:::

## How it works: cards and mutual acceptance

Trust is a **mutual, public-key relationship** — like WireGuard or SSH
known-hosts, and deliberately infrastructural. Each node has one long-lived
identity and produces a **connection card**: a shareable string containing its
public key and how to reach it (relay URLs). *Nothing in a card is secret* —
possessing one grants no access.

To let a peer reach you, you each:

1. **Swap cards** (`aibuddy roam id` prints yours; send it over any channel).
2. **Accept the other's key** (`aibuddy roam peers accept …`).

Since a card is just a string, it can travel however is convenient — including
as a QR code: `aibuddy roam id --qr` and `aibuddy roam share --qr` also render the
card as a QR code in the terminal, which you can scan from a phone camera (or
directly from the web client's camera, see below) instead of copy-pasting.

A connection only succeeds when the **host has accepted the dialer's key**. The
transport (iroh QUIC-TLS) proves each side holds the private key for the identity
in its card, so no one can impersonate a key, and a leaked card lets no one in.
There is no bearer token that grants access by possession.

```
┌────────────┐    swap cards     ┌────────────┐
│  Machine A │ ◀───────────────▶ │  Machine B │
│            │  each accepts the │            │
│  roam share│  other's key      │ roam connect│
│  (agent)   │ ◀═══ ACP over ══▶ │ /delegate/ │
└────────────┘   iroh + relay    │  bridge    │
                                 └────────────┘
```

Each connecting client gets its **own** agent and drives its **own** sessions
over the full ACP surface. (Simultaneous multi-viewer "co-driving" of one live
session is a possible future feature, not part of this ACP-transport model.)

## Using the CLI

### Quick start

Say machine B wants to drive machine A's agent. Both run `aibuddy roam id` and send
each other the card it prints. Then:

**On machine A (the host):** add B's card and accept its key.

```bash
aibuddy roam peers add 'aibuddy+roam://…B…' laptop-b
aibuddy roam peers accept laptop-b          # grants control by default
aibuddy roam share                          # serve to accepted peers
```

`share` keeps running and prints A's card too. The agent runs in the directory
`share` was started in (override with `--cwd <dir>`); the connecting side's own
directory is always ignored.

**On machine B (the client):** add A's card and connect.

```bash
aibuddy roam peers add 'aibuddy+roam://…A…' laptop-a
aibuddy roam connect laptop-a
```

You get an interactive prompt that drives the agent on machine A. Type a message
and press enter; `/quit` or Ctrl-D to leave.

`connect` is a minimal built-in chat loop — handy for a quick sanity check. For
real work, prefer `bridge` (drive the remote agent from a full ACP client) or
`delegate` (scriptable one-shot tasks).

For the common "pair a new device" case there is also a one-step helper:
`aibuddy roam pair` shows this node's card as a QR code, reads the device's card
from stdin, and saves + accepts it in one go (the equivalent of
`peers add` + `peers accept`).

:::tip
Compare the short **fingerprint** shown by `roam id` / `peers accept` out of band
(e.g. read it aloud) to be sure you accepted the key you meant to.
:::

### One-shot delegation

To send a single task and get the answer back — no interactive session:

```bash
aibuddy roam delegate 'aibuddy+roam://…' "Summarize the last 5 commits in this repo."
```

The remote agent runs the task with its own tools and prints its final response.
`delegate` is a thin ACP client, so it can also work with the remote's existing
sessions — all plain ACP under the hood:

```bash
# List the remote agent's sessions (session/list)
aibuddy roam delegate 'aibuddy+roam://…' --list-sessions

# Continue a specific session instead of starting fresh (session/load)
aibuddy roam delegate 'aibuddy+roam://…' --session <SESSION_ID> "Now fix the first failure."
```

### Bridging to any ACP client

`connect` and `delegate` embed aibuddy's own ACP client. `bridge` does the
opposite: it exposes a remote agent as a **local ACP endpoint**, so any ACP
client — Zed or another editor — can drive it as if it were running locally. It
runs no UI and no agent of its own; it transparently proxies ACP bytes between
the local client and the remote agent.

Bridge over stdio (the default — for a client that launches aibuddy as a
subprocess):

```bash
aibuddy roam bridge 'aibuddy+roam://…'
```

Configure your ACP client to run `aibuddy roam bridge '<card>'` as its agent
command. It will speak ACP on the process's stdin/stdout, and every request is
forwarded to the remote agent.

Or bridge over a local TCP port, for a client that connects to an address:

```bash
aibuddy roam bridge laptop --listen 127.0.0.1:8900
```

This accepts a single ACP connection on that address and proxies it to the
remote agent. Saved peer names work here too.

Because a default `share` serves the full ACP surface, a bridged client gets
everything — it can list, create, and load the host's sessions, not just a
single pre-selected one.

:::note
A bridge serves one client connection. The remote host still runs the agent,
imposes its own working directory, and authorizes the connection.
:::

## Embedding roaming in your own app

Everything above is built on the **`aibuddy-roaming` crate**
(`crates/aibuddy-roaming`), and you can use it directly. The crate deliberately
has **zero dependency on aibuddy core** — it knows nothing about agents or
sessions, only about identity, trust, and authenticated byte streams — so you
can embed it in any Rust application, with or without aibuddy.

The surface a consumer touches:

- **`RoamingIdentity`** — a persisted ed25519 node key whose public half *is*
  the iroh endpoint id (`RoamingIdentity::generate()` for ephemeral,
  `default_key_path` for the on-disk one aibuddy uses).
- **`RoamingConfig`** — a builder for a node: `RoamingConfig::new(identity)`
  plus chainers like `.with_relay(RelaySettings::…)` and
  `.with_bind_addr(addr)`. Defaults to iroh's public relays and an **empty
  allowlist** (accepts no one), so the safe default is built in.
- **`RoamingNode`** — the node itself. `RoamingNode::bind(config)` binds the
  endpoint; `node.share(server)` hosts an agent to accepted peers;
  `node.connect(&card, label)` / `node.connect_with_addr(addr, label)` dial a
  remote and return a `RoamingClientStream` (use `.into_futures_io()` to get
  plain async read/write halves); `node.card()` produces the shareable card.
- **`AcpStreamServer`** — the trait your host side implements to plug in "the
  agent". It has two methods — `serve_stream` (drive your protocol over an
  authorized stream for an accepted peer) and `agent_id` (a display id sent in
  the handshake ack) — and that's the entire integration seam. aibuddy-cli's
  `FullAcpBridge` implements it by handing the stream to aibuddy's real ACP
  `serve`; your app can serve anything.
- **`TrustBook`** — the mutual allowlist of accepted peer keys, with durable
  persistence and fail-closed reload. `node.trust()` gives you a handle to
  accept or revoke keys at runtime.
- **`ConnectionCard`** — the non-secret identity + reachability string
  (`aibuddy+roam://…`), with `encode()` / parsing and a short `fingerprint()`
  for out-of-band verification.

A minimal end-to-end example (condensed from
`crates/aibuddy-roaming/examples/echo_roundtrip.rs`, which runs both ends in one
process — `cargo run -p aibuddy-roaming --example echo_roundtrip`):

```rust
use std::sync::Arc;
use aibuddy_roaming::{
    AcpStreamServer, EndpointId, RoamingConfig, RoamingIdentity, RoamingNode,
};

// Your "agent": anything that can serve an authorized byte stream.
struct EchoServer;
impl AcpStreamServer for EchoServer {
    fn serve_stream(
        &self,
        _client: EndpointId,
        recv: Box<dyn futures::io::AsyncRead + Send + Unpin>,
        send: Box<dyn futures::io::AsyncWrite + Send + Unpin>,
    ) -> futures::future::BoxFuture<'static, anyhow::Result<()>> {
        Box::pin(async move { /* echo recv back on send … */ Ok(()) })
    }
    fn agent_id(&self) -> String { "echo-agent".to_string() }
}

async fn demo() -> anyhow::Result<()> {
    // Host: bind a node and share the agent to accepted peers.
    let host = RoamingNode::bind(RoamingConfig::new(RoamingIdentity::generate())).await?;
    host.share(Arc::new(EchoServer)).await?;
    println!("share this card: {}", host.card().encode()?);

    // Client: a separate node dials the host's card.
    let client = RoamingNode::bind(RoamingConfig::new(RoamingIdentity::generate())).await?;

    // Trust step: the HOST must accept the client's key, or the dial is refused.
    host.trust().lock().await.accept(&client.endpoint_id());

    let stream = client.connect(&host.card(), Some("example".into())).await?;
    let (send, recv, _conn) = stream.into_futures_io();
    // … speak your protocol (ACP, or anything) over send/recv …
    Ok(())
}
```

A few notes for integrators:

- **To expose a full aibuddy backend**, you don't have to implement
  `AcpStreamServer` yourself: `aibuddy serve --roam` runs aibuddy's regular agent
  server *and* exposes it over roam in one process. It works headless, writes
  its card to `<data-dir>/roam/serve.json`, and prints it on startup.
- **For browser apps**, the same transport compiles to WebAssembly. The wasm
  bindings (`@aibuddy/aibuddy-roam-web`, built from the `aibuddy-roaming-web` crate in
  the [aibuddy-mobile repo](https://github.com/aaif-goose/goose-mobile/tree/main/mobile-web))
  expose a `RoamClient` to JavaScript — generate an identity, print your card,
  dial a host's card, and drive ACP from inside a browser tab, with no server in
  between. The web client below is built on these bindings.
- The crate's [README](https://github.com/aaif-goose/goose/tree/main/crates/goose-roaming)
  covers the design decisions (why the host controls the working directory,
  why trust is all-or-nothing, etc.) in more depth.

## The web client: a reference browser client

The hosted web client at
[aaif-aibuddy.github.io/aibuddy-mobile](https://aaif-goose.github.io/goose-mobile/)
is a **reference client built on the pieces above**: the `@aibuddy/aibuddy-roam-web`
wasm bindings for transport, and aibuddy's `ui/sdk` `AIBuddyClient` for the ACP
protocol layer. The browser tab is itself a roam peer: iroh compiled to
WebAssembly runs inside the tab and connects through the same relays with the
same mutual key trust — there is no server in between, and no traffic goes
through the site's origin. Anything it does, your own app can do with the same
bindings.

Pairing works exactly like any other peer. The tab generates its own identity
and shows its card; you accept it once on the host:

```bash
aibuddy roam peers accept 'aibuddy+roam://…tab…' phone
```

To get the host's card into the browser, paste it — or run
`aibuddy roam share --qr` and scan the QR code with the web client's camera.

Once connected, the tab can list and open the host's sessions, start new ones,
stream responses, steer a running turn, and group sessions by project. You can
connect several hosts at once; their sessions appear in one merged list.

The source lives in the [aibuddy-mobile repo](https://github.com/aaif-goose/goose-mobile/tree/main/mobile-web)
(`mobile-web/`) — the README there has build details if you want to host it
yourself (it builds to a static site).

## Saved peers

Save a peer's card under a nickname so you don't paste cards each time. A saved
card is just an address-book entry — it does **not** let that peer connect to
you (use `peers accept` for that):

```bash
aibuddy roam peers add 'aibuddy+roam://…' laptop   # save to the address book
aibuddy roam connect laptop
aibuddy roam delegate laptop "run the tests and report failures"

aibuddy roam peers list      # show saved peers + which keys you accept
aibuddy roam connections     # show observed connections
aibuddy roam id              # print this node's connection card
```

## Controlling who can connect

Access is granted **only** by accepting a peer's public key — there is no bearer
token that works by possession. You accept a peer by saved name or inline card:

```bash
aibuddy roam peers accept laptop                    # accept a saved peer
aibuddy roam peers accept 'aibuddy+roam://…'          # accept an inline card (also saves it)
aibuddy roam peers accept 'aibuddy+roam://…' laptop   # accept + save under a nickname in one go

aibuddy roam peers list                             # see who is accepted
aibuddy roam peers revoke laptop                    # stop accepting (name, card, or raw id)
```

An accepted peer gets aibuddy's **full ACP surface** — it can drive its own
sessions on this machine (new/list/load/prompt), which is effectively remote
shell access. There are no finer-grained roles: acceptance is all-or-nothing.

Acceptance is **durable** and **live**: it is stored on disk, and a running
`share` re-reads it on each connection *and* polls the trust file (about every
two seconds) to enforce it against connections that are already open. Revoking
a peer therefore takes effect within seconds even against a live peer — the
share force-closes any of its open connections. No restart on either side.

Because trust is keyed on the peer's public key and the transport authenticates
that key cryptographically, a card can be shared over any channel — it is not a
secret, and a leaked card lets no one in.

:::warning
Accepting a peer grants **full control** — the peer can run the agent's tools,
including its shell. Only accept machines and people you trust, and verify the
fingerprint out of band.
:::

## Letting the agent reach other agents

With the roaming feature enabled, aibuddy can delegate to other agents itself. Ask
it to, and it can run `aibuddy roam delegate <peer> "<task>"` via its shell — for
example, "delegate this to my work laptop and summarize what it finds." It sends
one self-contained task and relays the response.

Because saved peers are just an address book, the agent can discover what
remotes it has available (`aibuddy roam peers list`) and route work to the right
one — e.g. run a build on the machine that has the toolchain, then bring the
result back. Each delegation is a self-contained task with a bounded response,
so this composes into multi-machine workflows without any shared state.

## Notes and limits

- Peers connect directly when NAT hole-punching succeeds and fall back to a
  relay otherwise. By default roaming uses a set of aibuddy-managed iroh relays
  (one per region — not iroh's shared public relays); override them with the
  `AIBUDDY_ROAM_RELAYS` config key or environment variable to point at your own
  deployment.
- `connect`, `delegate`, and `bridge` all accept either a saved peer name or a
  raw `aibuddy+roam://…` card. Remember the peer must also have accepted your key.
- A message sent to a session that has a run in flight **in the share process**
  becomes a steer of that run. A loop running in a *different* process on the
  host (another CLI, or a host that does not have roam enabled) can't be steered
  remotely — the web client detects this and warns before sending.
- Revoking a peer force-closes its connections within seconds and drops any
  in-flight turn at its next step; no new work can start. One narrow residual:
  an OS process a tool had already spawned (say, a long shell command) may run
  to completion — revocation stops the agent, not processes it already forked.
- On macOS, if a session still appears to hang on connect, set
  `AIBUDDY_DISABLE_KEYRING=1` to skip the keychain entirely.
