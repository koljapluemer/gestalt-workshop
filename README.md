# gestalt-workshop

Vibecode interactive learning and visualization plugins by chatting with Claude, and see them run beside the chat.
Based on the [gestalts](../gestalts) data paradigm: a plugin is a note (its source), its content and params are
notes, and it keeps learner state (FSRS) in notes, so everything syncs like the rest of your data.

For now it's local: the agent is your `claude` CLI, run by this repo's plugin on a gestalts node. See
[`doc/architecture.md`](doc/architecture.md).

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
mise run dev          # the node (:7727) and the app (:5175) with hot reload
mise run check        # lints, typechecks, tests, the agent template's example
mise run build        # dist/: the shell and the frame page
```

The node keeps its notes in `$WORKSHOP_DATA` (default `~/gestalt-workshop-data`), and each plugin's workspace for the
agent in `$WORKSHOP_WORKSPACES` (default `~/.local/share/gestalt-workshop/workspaces`).
