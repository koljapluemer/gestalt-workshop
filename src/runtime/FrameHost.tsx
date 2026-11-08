import { useEffect, useMemo, useRef } from 'react';
import { useHost, useRepo, type Host, type Repo } from '@gestalts/sdk';
import { compile, type CompileError } from './compile';
import { CONNECT, type Call, type FromFrame, type RuntimeError, type ToFrame } from './protocol';

/** Where workshop plugins run; another origin (`VITE_WORKSHOP_FRAME_URL`) isolates them from the host. */
const FRAME_URL = import.meta.env.VITE_WORKSHOP_FRAME_URL ?? new URL('frame.html', document.baseURI).href;

type Props = {
  pluginId: string;
  source: string;
  /** every error the plugin shows: compile errors here, runtime errors from the frame */
  onError: (e: RuntimeError) => void;
};

/**
 * A workshop plugin, run in a frame. Placed inside the host's `PaneFrame`, so `useRepo()` is the repo scoped to the
 * plugin's access and `useHost()` the pane's capabilities; the frame gets both through the protocol. A new `source`
 * gives a new frame.
 */
export function FrameHost({ pluginId, source, onError }: Props) {
  const repo = useRepo();
  const host = useHost();
  const compiled = useMemo(() => compile(source), [source]);
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => {
    if (!compiled.ok) onErrorRef.current({ kind: 'compile', message: compiled.errors.map(describe).join('\n'), at: new Date().toISOString() });
  }, [compiled]);
  if (!compiled.ok) {
    return (
      <div role="alert" className="alert alert-error m-4 items-start">
        <div>
          <div className="font-semibold">plugin.tsx doesn't compile</div>
          <ul className="mt-1 font-mono text-sm whitespace-pre-wrap">{compiled.errors.map((e, i) => <li key={i}>{describe(e)}</li>)}</ul>
        </div>
      </div>
    );
  }
  return <Frame key={hash(source)} pluginId={pluginId} js={compiled.js} repo={repo} host={host} onError={onErrorRef} />;
}

function Frame({ pluginId, js, repo, host, onError }: { pluginId: string; js: string; repo: Repo; host: Host; onError: { current: (e: RuntimeError) => void } }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const iframe = ref.current!;
    let port: MessagePort | null = null;
    const post = (m: ToFrame) => port?.postMessage(m);
    const handle = async (id: number, c: Call) => {
      try {
        post({ type: 'reply', id, ok: true, value: await perform(repo, host, c) });
      } catch (e) {
        post({ type: 'reply', id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    };
    const onLoad = () => {
      port?.close();
      const channel = new MessageChannel();
      port = channel.port1;
      port.onmessage = (e: MessageEvent<FromFrame>) => {
        const m = e.data;
        if (m.type === 'ready') post({ type: 'init', pluginId, js, notes: repo.query({}), gestalts: repo.gestalts() });
        else if (m.type === 'call') void handle(m.id, m.call);
        else if (m.type === 'error') onError.current(m.error);
      };
      iframe.contentWindow?.postMessage({ type: CONNECT }, new URL(FRAME_URL).origin, [channel.port2]);
    };
    iframe.addEventListener('load', onLoad);
    // set here, after the listener: the frame can't load before we hear of it
    iframe.src = FRAME_URL;
    const unsubscribe = repo.subscribe(() => post({ type: 'notes', notes: repo.query({}) }));
    return () => {
      unsubscribe();
      iframe.removeEventListener('load', onLoad);
      port?.close();
    };
  }, [pluginId, js, repo, host, onError]);
  // same origin for now (no isolation, but a crash stays in the frame); see VITE_WORKSHOP_FRAME_URL
  return <iframe ref={ref} title="Workshop plugin" sandbox="allow-scripts allow-same-origin" className="block h-full w-full border-0 bg-base-100" />;
}

async function perform(repo: Repo, host: Host, c: Call): Promise<unknown> {
  switch (c.op) {
    case 'putValue': return repo.putValue(c.key, c.value);
    case 'putRaw': return repo.putRaw(c.key, c.raw);
    case 'delete': return repo.delete(c.key);
    case 'readBlob': return repo.readBlob(c.name);
    case 'writeBlob': return repo.writeBlob(c.name, c.bytes);
    case 'openNote': host.openNote?.(c.key); return null;
    case 'createNote': return host.createNote ? host.createNote(c.seed) : null;
    case 'pickNote': return host.pickNote ? host.pickNote(c.query, c.title) : null;
  }
}

function describe(e: CompileError) {
  return e.line ? `line ${e.line}${e.column ? `:${e.column}` : ''}: ${e.message}` : e.message;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h.toString(36);
}
