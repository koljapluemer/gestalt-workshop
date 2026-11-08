/**
 * Workshop plugins as notes. A plugin `<id>` is:
 * - `workshop-plugin-<id>` (`workshop-plugin@1`): `title`, `plugin` (the id), `source` (plugin.tsx)
 * - its content and params: notes tagged `wp-<id>`, keyed `wp-<id>-<name>` when the agent made them
 *   (`content/<name>.yml` to the agent; `wp-<id>-params` holds the params)
 * - `workshop-revision-<id>-<time>` (tags `workshop-revision`, `wpr-<id>`): each source it had
 * - `workshop-chat-<id>` (tag `workshop-chat`): the conversation, and each backend's session
 */
import type { IndexedNote, Json, Repo } from '@gestalts/sdk';
import type { PluginEntry, Scope } from '@gestalts/ui/host';

export const PLUGIN_GESTALT = 'workshop-plugin@1';

export const pluginKey = (id: string) => `workshop-plugin-${id}`;
export const contentTag = (id: string) => `wp-${id}`;
export const contentKey = (id: string, name: string) => `wp-${id}-${name}`;
export const paramsKey = (id: string) => contentKey(id, 'params');
export const revisionTag = (id: string) => `wpr-${id}`;
export const chatKey = (id: string) => `workshop-chat-${id}`;

/** What a plugin id may be: it becomes tags and keys. */
export const PLUGIN_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function slugify(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'plugin';
}

/** What every workshop plugin may read and write: its own content, and learner state (FSRS, sessions, settings). */
export function pluginAccess(id: string): { read: Scope; write: Scope } {
  const scope = { gestalts: ['fsrs-state@1', 'practice-session@1', 'settings@1'], tags_all: [contentTag(id)] };
  return { read: scope, write: scope };
}

/** The plugin as the host's PaneFrame takes one: no modules (its code runs in the frame), only its access. */
export function pluginEntry(id: string, title: string): PluginEntry {
  return { manifest: { id: contentTag(id), version: '0.0.0', host_api: 2, title, access: pluginAccess(id) }, gestalts: [], decks: [], modules: {} };
}

export type WorkshopPlugin = { id: string; key: string; title: string; source: string };

const str = (v: Json | undefined): string => (typeof v === 'string' ? v : '');
const map = (n: IndexedNote | undefined): { [k: string]: Json } =>
  (n && typeof n.value === 'object' && n.value !== null && !Array.isArray(n.value) ? n.value : {});

export function asPlugin(n: IndexedNote): WorkshopPlugin {
  const v = map(n);
  return { id: str(v.plugin), key: n.key, title: str(v.title), source: str(v.source) };
}

export const STARTER = `import { useParams } from '@workshop/plugin';

// A new workshop plugin: say in the chat what it should be.
export default function Plugin() {
  const [params] = useParams({ greeting: 'Describe what you want to build in the chat.' });
  return (
    <div className="flex h-full items-center justify-center p-8 text-base-content/70">
      <p>{params.greeting}</p>
    </div>
  );
}
`;

export async function createPlugin(repo: Repo, title: string): Promise<string> {
  let id = slugify(title);
  for (let n = 2; repo.get(pluginKey(id)); n++) id = `${slugify(title)}-${n}`;
  await repo.putValue(pluginKey(id), { tags: ['workshop-plugin'], title, plugin: id, source: STARTER });
  return id;
}

/** The plugin's content notes, as the agent sees them: path → note key, and its text. */
export function pluginFiles(repo: Repo, p: WorkshopPlugin): { files: Record<string, string>; keys: Record<string, string> } {
  const files: Record<string, string> = { 'plugin.tsx': p.source };
  const keys: Record<string, string> = { 'plugin.tsx': p.key };
  const prefix = `wp-${p.id}-`;
  for (const n of repo.query({ tagsAll: [contentTag(p.id)] })) {
    const name = n.key.startsWith(prefix) ? n.key.slice(prefix.length) : n.key;
    // a name the agent couldn't write back as a file is left out
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) continue;
    files[`content/${name}.yml`] = n.raw;
    keys[`content/${name}.yml`] = n.key;
  }
  return { files, keys };
}

/**
 * Writes what a turn changed: the source (with a revision), then the content through the plugin's own scope, so a
 * content file that lost its tag is refused like any write of the plugin. Returns what was refused.
 */
export async function applyFiles(repo: Repo, scoped: Repo, p: WorkshopPlugin, keys: Record<string, string>, files: Record<string, string | null>, message: string): Promise<string[]> {
  const refused: string[] = [];
  const source = files['plugin.tsx'];
  if (typeof source === 'string' && source !== p.source) await setSource(repo, p, source, message);
  for (const [path, text] of Object.entries(files)) {
    if (path === 'plugin.tsx') continue;
    const m = /^content\/([A-Za-z0-9][A-Za-z0-9_.-]*)\.yml$/.exec(path);
    if (!m) { refused.push(`${path}: not a content file`); continue; }
    const key = keys[path] ?? contentKey(p.id, m[1]);
    try {
      if (text === null) await scoped.delete(key);
      else await scoped.putRaw(key, text);
    } catch (e) {
      refused.push(`${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return refused;
}

/** A new source for the plugin, and a revision of it. */
export async function setSource(repo: Repo, p: WorkshopPlugin, source: string, message: string) {
  const current = map(repo.get(p.key));
  await repo.putValue(p.key, { ...current, source });
  const at = new Date().toISOString();
  await repo.putValue(`workshop-revision-${p.id}-${at.replace(/[^0-9]/g, '')}`, { tags: ['workshop-revision', revisionTag(p.id)], plugin: p.id, source, at, message });
}

export type Revision = { key: string; at: string; message: string; source: string };

export function revisions(repo: Repo, id: string): Revision[] {
  return repo.query({ tagsAll: [revisionTag(id)] })
    .map((n) => { const v = map(n); return { key: n.key, at: str(v.at), message: str(v.message), source: str(v.source) }; })
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

export type ChatMessage = { role: 'user' | 'assistant'; text: string; at: string; tools?: string[]; error?: string };
export type Chat = { messages: ChatMessage[]; sessions: Record<string, string> };

export function readChat(repo: Repo, id: string): Chat {
  const v = map(repo.get(chatKey(id)));
  const messages = Array.isArray(v.messages) ? (v.messages as ChatMessage[]) : [];
  const sessions = (typeof v.sessions === 'object' && v.sessions !== null && !Array.isArray(v.sessions) ? v.sessions : {}) as Record<string, string>;
  return { messages, sessions };
}

/** The chat keeps its last 200 messages. */
export async function writeChat(repo: Repo, id: string, chat: Chat) {
  await repo.putValue(chatKey(id), { tags: ['workshop-chat'], plugin: id, sessions: chat.sessions, messages: chat.messages.slice(-200) as unknown as Json });
}
