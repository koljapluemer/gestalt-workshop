import { useEffect, useMemo, useState } from 'react';
import { Plus, Settings } from 'lucide-react';
import { distribution, plugins } from 'virtual:gestalts-plugins';
import { RepoProvider, useQuery, type Repo } from '@gestalts/client';
import { DebugLogButton } from '@gestalts/ui/debug';
import { usePluginRepo } from '@gestalts/ui/host';
import { ConnectorSettings } from '@gestalts/ui/perspectives';
import { Workbench } from './panels/Workbench';
import { asPlugin, createPlugin, PLUGIN_GESTALT } from './workshop';

/**
 * The workshop: plugins vibecoded into notes, each run in a frame beside the chat that edits it. Notes live in this
 * browser (OPFS `workshop`) and sync with the node the workshop runs (`mise run node`, :7727), whose workshop@1
 * service runs the claude CLI.
 */
const REGISTRY = { distribution, plugins };
const NODE = import.meta.env.VITE_WORKSHOP_NODE ?? 'http://127.0.0.1:7727';
const SELECTED = 'gestalt-workshop:plugin';
const CONNECTED_ONCE = 'gestalt-workshop:connected-once';

export function App() {
  const { repo, error } = usePluginRepo({ dir: 'workshop' }, REGISTRY);
  useEffect(() => {
    if (!repo || repo.connector.get().url) return;
    // the first time only: a later Disconnect is the user's choice
    try {
      if (localStorage.getItem(CONNECTED_ONCE)) return;
      localStorage.setItem(CONNECTED_ONCE, '1');
    } catch { /* not remembered: connect each time */ }
    void repo.connect(NODE);
  }, [repo]);
  return (
    <div className="flex h-dvh flex-col bg-base-200">
      {error && <div role="alert" className="alert alert-error m-4">Could not load: {error}</div>}
      {!error && !repo && <div className="flex justify-center p-8"><span className="loading loading-spinner" /></div>}
      {repo && <RepoProvider repo={repo}><Shell repo={repo} /></RepoProvider>}
    </div>
  );
}

function Shell({ repo }: { repo: Repo }) {
  const notes = useQuery({ gestalt: PLUGIN_GESTALT });
  const list = useMemo(() => notes.map(asPlugin).filter((p) => p.id).sort((a, b) => a.title.localeCompare(b.title)), [notes]);
  const [selected, setSelected] = useState<string | null>(() => { try { return localStorage.getItem(SELECTED); } catch { return null; } });
  const choose = (id: string) => {
    setSelected(id);
    try { localStorage.setItem(SELECTED, id); } catch { /* not remembered */ }
  };
  const current = list.find((p) => p.id === selected) ?? null;
  const create = async () => {
    const title = window.prompt('What will it be? (a title; you describe it in the chat next)')?.trim();
    if (title) choose(await createPlugin(repo, title));
  };
  return (
    <>
      <header className="navbar min-h-0 gap-2 bg-base-100 px-4 py-1 shadow-sm">
        <span className="font-semibold">Gestalt workshop</span>
        <span className="flex-1 truncate text-sm text-base-content/60">{current?.title}</span>
        <DebugLogButton />
        <details className="dropdown dropdown-end">
          <summary className="btn btn-sm btn-ghost btn-square" title="Sync settings"><Settings className="size-4" /></summary>
          <div className="dropdown-content z-50 mt-2 rounded-box border border-base-300 bg-base-100 p-3 shadow">
            <ConnectorSettings />
          </div>
        </details>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-base-300 bg-base-100 p-2">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void create()}><Plus className="size-4" /> New plugin</button>
          <ul className="menu menu-sm w-full p-0">
            {list.map((p) => (
              <li key={p.id}><button type="button" className={p.id === current?.id ? 'menu-active' : ''} onClick={() => choose(p.id)}>{p.title || p.id}</button></li>
            ))}
          </ul>
          {!list.length && <p className="p-2 text-sm text-base-content/60">No plugins yet.</p>}
        </nav>
        <main className="min-w-0 flex-1">
          {current
            ? <Workbench key={current.id} repo={repo} plugin={current} />
            : <div className="flex h-full items-center justify-center text-base-content/60">Pick a plugin, or make a new one.</div>}
        </main>
      </div>
    </>
  );
}
