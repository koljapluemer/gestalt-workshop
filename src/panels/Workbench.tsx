import { useCallback, useMemo, useRef, useState } from 'react';
import { RepoProvider, type Repo } from '@gestalts/client';
import { PaneFrame } from '@gestalts/ui/host';
import { FrameHost } from '../runtime/FrameHost';
import type { RuntimeError } from '../runtime/protocol';
import { pluginEntry, type WorkshopPlugin } from '../workshop';
import { Chat } from './Chat';
import { Content } from './Content';
import { Revisions } from './Revisions';

type Tab = 'chat' | 'content' | 'revisions';

/**
 * One plugin: its preview, and beside it the chat, its content and its revisions. All inside the host's PaneFrame
 * (so the preview gets the plugin's scope, and notes open over the pane); the panels get the host's repo back.
 */
export function Workbench({ repo, plugin }: { repo: Repo; plugin: WorkshopPlugin }) {
  const entry = useMemo(() => pluginEntry(plugin.id, plugin.title), [plugin.id, plugin.title]);
  const [tab, setTab] = useState<Tab>('chat');
  // what the preview reported since the last turn; the next one takes them along
  const [errors, setErrors] = useState<RuntimeError[]>([]);
  const errorsRef = useRef<RuntimeError[]>([]);
  const onError = useCallback((e: RuntimeError) => {
    const last = errorsRef.current.at(-1);
    if (last && last.kind === e.kind && last.message === e.message) return;
    errorsRef.current = [...errorsRef.current.slice(-19), e];
    setErrors(errorsRef.current);
  }, []);
  const takeErrors = useCallback(() => {
    const taken = errorsRef.current;
    errorsRef.current = [];
    setErrors([]);
    return taken;
  }, []);
  return (
    <PaneFrame repo={repo} plugins={[]} plugin={entry}>
      <div className="flex h-full">
        <section className="min-w-0 flex-1 bg-base-100">
          <FrameHost pluginId={plugin.id} source={plugin.source} onError={onError} />
        </section>
        <RepoProvider repo={repo}>
          <aside className="flex w-[28rem] shrink-0 flex-col border-l border-base-300 bg-base-100">
            <div role="tablist" className="tabs tabs-border px-2">
              {(['chat', 'content', 'revisions'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={t === tab} className={`tab capitalize ${t === tab ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
                  {t}{t === 'chat' && errors.length > 0 && <span className="badge badge-error badge-xs ml-1">{errors.length}</span>}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {tab === 'chat' && <Chat repo={repo} plugin={plugin} errors={errors} takeErrors={takeErrors} />}
              {tab === 'content' && <Content plugin={plugin} />}
              {tab === 'revisions' && <Revisions repo={repo} plugin={plugin} />}
            </div>
          </aside>
        </RepoProvider>
      </div>
    </PaneFrame>
  );
}
