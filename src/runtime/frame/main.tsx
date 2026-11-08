/**
 * The page a workshop plugin runs in. It waits for the host's port, then runs the plugin's compiled code with the sdk
 * over a copy of the notes in its scope (FrameRepo), and reports every error it sees back to the host.
 */
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HostProvider, RepoProvider, type Host, type NoteSeed, type Query } from '@gestalts/sdk';
import { loadNatives } from '@gestalts/client';
import tailwindUrl from '@tailwindcss/browser?url';
import daisyCss from 'daisyui/daisyui.css?raw';
import { CONNECT, type Call, type FromFrame, type RuntimeError, type ToFrame } from '../protocol';
import { FrameRepo } from './frameRepo';
import { requireModule } from './modules';
import { PluginIdContext } from './workshopApi';

// a plugin's classes are known only once it runs: Tailwind's browser build generates them as they appear
const style = document.createElement('style');
style.textContent = daisyCss;
document.head.append(style);
const tailwind = document.createElement('script');
tailwind.src = tailwindUrl;
document.head.append(tailwind);

const natives = loadNatives();
const root = createRoot(document.getElementById('plugin')!);
let port: MessagePort | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const repo = new FrameRepo(call);

function send(m: FromFrame) {
  port?.postMessage(m);
}

function call(c: Call): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    send({ type: 'call', id, call: c });
  });
}

function report(kind: RuntimeError['kind'], e: unknown) {
  const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e));
  send({ type: 'error', error: { kind, message: err.message, stack: err.stack, at: new Date().toISOString() } });
}

window.addEventListener('error', (e) => report('error', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => report('rejection', e.reason));
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  consoleError(...args);
  report('console', args.map((a) => (a instanceof Error ? a : typeof a === 'string' ? a : safeJson(a))).join(' '));
};

function safeJson(v: unknown) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    report('render', Object.assign(new Error(error.message), { stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}` }));
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <div role="alert" className="alert alert-error m-4 whitespace-pre-wrap font-mono text-sm">{this.state.error.message}</div>;
  }
}

const host: Host = {
  openNote: (key: string) => { void call({ op: 'openNote', key }); },
  createNote: (seed?: NoteSeed) => call({ op: 'createNote', seed }) as Promise<string | null>,
  pickNote: (query: Query, title?: string) => call({ op: 'pickNote', query, title }) as Promise<string | null>,
  lenses: [],
};

function load(js: string): ComponentType {
  const module = { exports: {} as Record<string, unknown> };
  new Function('require', 'module', 'exports', js)(requireModule, module, module.exports);
  const Plugin = module.exports.default;
  if (typeof Plugin !== 'function' && typeof Plugin !== 'object') throw new Error('plugin.tsx has no default export to show');
  return Plugin as ComponentType;
}

async function receive(m: ToFrame) {
  if (m.type === 'reply') {
    const w = waiting.get(m.id);
    waiting.delete(m.id);
    if (m.ok) w?.resolve(m.value); else w?.reject(new Error(m.error));
  } else if (m.type === 'notes') {
    repo.replace(m.notes);
  } else if (m.type === 'init') {
    await natives;
    repo.replace(m.notes, m.gestalts);
    let Plugin: ComponentType;
    try {
      Plugin = load(m.js);
    } catch (e) {
      report('error', e);
      root.render(<div role="alert" className="alert alert-error m-4 whitespace-pre-wrap font-mono text-sm">{String((e as Error).message ?? e)}</div>);
      return;
    }
    root.render(
      <Boundary>
        <RepoProvider repo={repo}>
          <HostProvider host={host}>
            <PluginIdContext value={m.pluginId}><Plugin /></PluginIdContext>
          </HostProvider>
        </RepoProvider>
      </Boundary>,
    );
  }
}

window.addEventListener('message', (e) => {
  if (e.source !== window.parent || e.data?.type !== CONNECT || !e.ports[0]) return;
  port = e.ports[0];
  port.onmessage = (ev: MessageEvent<ToFrame>) => { void receive(ev.data); };
  send({ type: 'ready' });
});
