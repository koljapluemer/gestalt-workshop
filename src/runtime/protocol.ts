import type { GestaltDef, IndexedNote, Json, NoteSeed, Query } from '@gestalts/sdk';

/**
 * Between the host and the frame a workshop plugin runs in, over the MessagePort the host transfers in
 * `{type: 'workshop:connect'}`. The frame keeps a copy of the notes in the plugin's scope and asks the host for
 * everything else; the host checks each write against the plugin's access. Nothing here assumes the frame shares
 * the host's origin, so the frame can move to an origin of its own.
 */
export const CONNECT = 'workshop:connect';

export type ToFrame =
  | { type: 'init'; pluginId: string; js: string; notes: IndexedNote[]; gestalts: GestaltDef[] }
  | { type: 'notes'; notes: IndexedNote[] }
  | { type: 'reply'; id: number; ok: true; value: unknown }
  | { type: 'reply'; id: number; ok: false; error: string };

export type Call =
  | { op: 'putValue'; key: string | undefined; value: Json }
  | { op: 'putRaw'; key: string; raw: string }
  | { op: 'delete'; key: string }
  | { op: 'readBlob'; name: string }
  | { op: 'writeBlob'; name: string; bytes: Uint8Array }
  | { op: 'openNote'; key: string }
  | { op: 'createNote'; seed?: NoteSeed }
  | { op: 'pickNote'; query: Query; title?: string };

export type RuntimeError = { kind: 'error' | 'rejection' | 'render' | 'console' | 'compile'; message: string; stack?: string; at: string };

export type FromFrame =
  | { type: 'ready' }
  | { type: 'call'; id: number; call: Call }
  | { type: 'error'; error: RuntimeError };
