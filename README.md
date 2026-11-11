# gestalt-workshop

Vibecode a view on your data by chatting with Claude, and see it run beside the chat. A view is one `view@1` yml, so it
syncs like the rest of your [gestalts](../gestalts) data.

For now it's local: the agent is your `claude` CLI, run by this repo's `workshop-agent` backend on a gestalts node. See
[`doc/architecture.md`](doc/architecture.md). Agent timing, token use and raw traces also stay local;
`mise run agent-stats` summarizes them.

## Developing

Needs [mise](https://mise.jdx.dev), [rustup](https://rustup.rs), the `claude` CLI (logged in), and a checkout of
gestalts next to this one: until it's published, this repo links its packages and node by path.

```
parent/
  gestalts/
  gestalt-workshop/
```

```sh
mise install          # once after cloning, and when mise.toml changes
mise run dev          # the node (:7727) and the app (from :5175, the first free port) with hot reload
mise run check        # lints, typechecks, tests, the agent template's example
mise run build        # dist/
```

The node keeps its ymls in `$WORKSHOP_DATA` (default `~/gestalt-workshop-views`), and each view's workspace for the
agent in `$WORKSHOP_WORKSPACES` (default `~/.local/share/gestalt-workshop/workspaces`).
