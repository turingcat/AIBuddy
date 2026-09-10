# Historical transformed mirrors

The mirror-merge publication workflow was retired on 2026-09-10 at the user's
request for independent AIBuddy history. Use
[the snapshot-delta workflow](aibuddy-upstream-sync.md) for all future updates.

PR #38 imported HeyBuddy v1.50.0 through mirror `f555afac8`, parent `e3aea38cb`.
These mirror commits and their source/digest trailers remain in published history.
They are useful provenance records; do not merge additional mirrors into product
branches or push local upstream mirrors as product history.

`tools/aibuddy-rebrand/src/mirror.mjs` retains `prepareMirror`, `appendMirror` and
`establishBridge` for historical tooling and tests. Those functions can create
commit ancestry and must not be used for normal synchronization. The new
`materializeSnapshotTree` API only validates snapshots and computes/writes Git
trees and blobs. It creates no commits and updates no refs.

`.aibuddy-upstream.json` is the forward synchronization baseline. Its source
repository/ref, raw commit/tree, transformed tree, output digest and transformer
identity let later synchronizations reconstruct the previous input without
attaching upstream author history. Existing license/attribution obligations and
historical Contributors entries are unaffected by the change of workflow.
