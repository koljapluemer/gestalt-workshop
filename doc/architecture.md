# Architecture

```
src/App.tsx          the list of views, and the workbench
src/Preview.tsx      compiles a view in the browser and runs it in a frame, as any view runs
src/Chat.tsx         one conversation about one view
src/agents/          what an agent backend is, and the claude CLI as one
src/workshop.ts      a view as a `view@1` yml, and as the files the agent sees
plugins/workshop-agent/   backend.py: one turn of the claude CLI
agent-template/      what the agent works against: its contract (CLAUDE.md), `check.ts`, an example
```

A turn: the browser sends the view as `view.tsx` and `view.json`, with any errors the preview reported. The backend writes
them into a workspace per view, runs `claude -p` there and streams back what it said and did, then the files it changed.
The browser writes the yml, so the agent never touches any data, and another backend can take this one's place.

The node's proxy answers each request in full and gives up after 180 s, so a turn is a job whose events are polled.

Tailwind's browser build runs in the frame here, because a vibecoded view's classes aren't known at build time.

A vibecoded view runs only in the workshop for now. Its `reads` and `writes` come from what the agent declared in
`view.json`, and there is no prompt when they widen. Chat history isn't kept across reloads; the CLI's session is.
