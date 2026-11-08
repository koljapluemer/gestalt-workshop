import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import { useNote, type Repo } from '@gestalts/client';
import { scopedRepo } from '@gestalts/ui/host';
import { cliBackend } from '../agents/cli';
import type { AgentEvent } from '../agents/types';
import type { RuntimeError } from '../runtime/protocol';
import { applyFiles, asPlugin, chatKey, contentTag, pluginAccess, pluginFiles, pluginKey, readChat, writeChat, type ChatMessage, type WorkshopPlugin } from '../workshop';

type Props = { repo: Repo; plugin: WorkshopPlugin; errors: RuntimeError[]; takeErrors: () => RuntimeError[] };

/** The conversation that edits the plugin: each message is one turn of the agent on its files. */
export function Chat({ repo, plugin, errors, takeErrors }: Props) {
  const backend = useMemo(() => cliBackend(repo), [repo]);
  const [availability, setAvailability] = useState<true | string | null>(null);
  useEffect(() => {
    let live = true;
    const check = () => void backend.available().then((a) => { if (live) setAvailability(a); });
    check();
    const timer = setInterval(check, 10_000);
    return () => { live = false; clearInterval(timer); };
  }, [backend]);
  // re-rendered when the chat note changes
  useNote(chatKey(plugin.id));
  const chat = readChat(repo, plugin.id);
  const scoped = useMemo(() => scopedRepo(repo, contentTag(plugin.id), pluginAccess(plugin.id)), [repo, plugin.id]);
  const [input, setInput] = useState('');
  const [live, setLive] = useState<AgentEvent[] | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [chat.messages.length, live?.length]);

  const send = async () => {
    const message = input.trim();
    const note = repo.get(pluginKey(plugin.id));
    if (!message || live || !note) return;
    setInput('');
    const p = asPlugin(note);
    const before = readChat(repo, p.id);
    const now = () => new Date().toISOString();
    await writeChat(repo, p.id, { ...before, messages: [...before.messages, { role: 'user', text: message, at: now() }] });
    const { files, keys } = pluginFiles(repo, p);
    const diagnostics = takeErrors();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLive([]);
    const text: string[] = [];
    const tools: string[] = [];
    const problems: string[] = [];
    let session = before.sessions[backend.id];
    try {
      for await (const ev of backend.turn({ plugin: p.id, session, message, files, diagnostics }, ctrl.signal)) {
        setLive((l) => [...(l ?? []), ev]);
        if (ev.type === 'text') text.push(ev.text);
        else if (ev.type === 'tool') tools.push(`${ev.name} ${ev.summary}`.trim());
        else if (ev.type === 'error') problems.push(ev.message);
        else if (ev.type === 'done') session = ev.session ?? session;
        else if (ev.type === 'files') {
          const refused = await applyFiles(repo, scoped, p, keys, ev.files, message);
          if (refused.length) problems.push(`Not saved: ${refused.join('; ')}`);
        }
      }
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    } finally {
      abort.current = null;
      setLive(null);
      const after = readChat(repo, p.id);
      const reply: ChatMessage = { role: 'assistant', text: text.join('\n\n'), at: now(), tools };
      if (problems.length) reply.error = problems.join('\n');
      await writeChat(repo, p.id, { sessions: session ? { ...after.sessions, [backend.id]: session } : after.sessions, messages: [...after.messages, reply] });
    }
  };

  const forget = async () => {
    const c = readChat(repo, plugin.id);
    const sessions = { ...c.sessions };
    delete sessions[backend.id];
    await writeChat(repo, plugin.id, { ...c, sessions });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-base-300 px-3 py-1 text-xs text-base-content/60">
        <span className={`status ${availability === true ? 'status-success' : 'status-warning'}`} />
        <span className="flex-1 truncate">{availability === true ? backend.label : availability ?? 'checking…'}</span>
        {chat.sessions[backend.id] && <button type="button" className="btn btn-ghost btn-xs" title="The next message starts a new conversation (the plugin stays)" onClick={() => void forget()}>New conversation</button>}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!chat.messages.length && !live && (
          <p className="text-sm text-base-content/60">
            Say what this plugin should be: what's learnt or explored, what one does with it, what's practised. It's real
            code (React, d3, FSRS from @gestalts/learning), not a quiz template.
          </p>
        )}
        {chat.messages.map((m, i) => <Message key={i} m={m} />)}
        {live && <Live events={live} />}
        <div ref={end} />
      </div>
      {errors.length > 0 && (
        <details className="mx-3 mb-1 rounded-box bg-error/10 px-2 py-1 text-xs">
          <summary className="cursor-pointer text-error">{errors.length} error{errors.length > 1 ? 's' : ''} from the preview go with the next message</summary>
          <ul className="mt-1 space-y-1 font-mono">{errors.map((e, i) => <li key={i} className="whitespace-pre-wrap">{e.kind}: {e.message}</li>)}</ul>
        </details>
      )}
      <form className="flex gap-2 border-t border-base-300 p-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea className="textarea textarea-sm min-h-16 flex-1" placeholder={live ? 'Working…' : 'Message (Ctrl+Enter sends)'} value={input} disabled={!!live}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} />
        {live
          ? <button type="button" className="btn btn-sm btn-square" title="Stop" onClick={() => abort.current?.abort()}><Square className="size-4" /></button>
          : <button type="submit" className="btn btn-sm btn-primary btn-square" title="Send" disabled={!input.trim() || availability !== true}><Send className="size-4" /></button>}
      </form>
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  return (
    <div className={m.role === 'user' ? 'ml-8 rounded-box bg-base-200 p-2' : 'mr-4'}>
      {m.text && <p className="whitespace-pre-wrap text-sm">{m.text}</p>}
      {!!m.tools?.length && (
        <details className="mt-1 text-xs text-base-content/60">
          <summary className="cursor-pointer">{m.tools.length} step{m.tools.length > 1 ? 's' : ''}</summary>
          <ul className="font-mono">{m.tools.map((t, i) => <li key={i} className="truncate">{t}</li>)}</ul>
        </details>
      )}
      {m.error && <p className="mt-1 whitespace-pre-wrap text-xs text-error">{m.error}</p>}
    </div>
  );
}

function Live({ events }: { events: AgentEvent[] }) {
  return (
    <div className="mr-4 space-y-1">
      {events.map((e, i) => {
        if (e.type === 'text') return <p key={i} className="whitespace-pre-wrap text-sm">{e.text}</p>;
        if (e.type === 'tool') return <p key={i} className="truncate font-mono text-xs text-base-content/60">{e.name} {e.summary}</p>;
        if (e.type === 'files') return <p key={i} className="text-xs text-success">Saved {Object.keys(e.files).join(', ')}</p>;
        if (e.type === 'error') return <p key={i} className="whitespace-pre-wrap text-xs text-error">{e.message}</p>;
        return null;
      })}
      <span className="loading loading-dots loading-sm" />
    </div>
  );
}
