import type { GestaltDef, IndexedNote, Json, MergeResult, Query, Repo, ServiceClient, UpstreamReport } from '@gestalts/sdk';
import type { Call } from '../protocol';
import { query } from '../query';

const unavailable = (what: string) => new Error(`${what} is not available in a workshop plugin`);

/**
 * The sdk's `Repo` inside the frame: a copy of the notes in the plugin's scope, which the host replaces on every
 * change, and calls to the host for writes and blobs (the host checks them against the plugin's access).
 */
export class FrameRepo implements Repo {
  version = 0;
  private notes = new Map<string, IndexedNote>();
  private defs: GestaltDef[] = [];
  private listeners = new Set<() => void>();
  private urls = new Map<string, Promise<string | null>>();

  constructor(private call: (c: Call) => Promise<unknown>) {}

  /** From the host: the notes in scope, all of them. */
  replace(notes: IndexedNote[], defs?: GestaltDef[]) {
    this.notes = new Map(notes.map((n) => [n.key, n]));
    if (defs) this.defs = defs;
    this.bump();
  }

  private bump() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private apply(n: IndexedNote) {
    this.notes.set(n.key, n);
    this.bump();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  query(q: Query = {}) { return query(this.notes.values(), q); }
  get(key: string) { return this.notes.get(key); }

  keyOf(id: string) {
    if (this.notes.has(id)) return id;
    for (const n of this.notes.values()) if (n.id === id) return n.key;
    return undefined;
  }

  /** The host sends only live notes. */
  isDeleted() { return false; }
  gestalts() { return this.defs; }
  upstreamReport(): UpstreamReport { return { copied: [], updated: [], diverged: [], deck_conflicts: [] }; }
  service(): ServiceClient | undefined { return undefined; }
  inspect(): IndexedNote { throw unavailable('inspect'); }
  merge3(): MergeResult { throw unavailable('merge3'); }

  async putRaw(key: string, raw: string) {
    const n = (await this.call({ op: 'putRaw', key, raw })) as IndexedNote;
    this.apply(n);
    return n;
  }

  async putValue(key: string | undefined, value: Json) {
    const n = (await this.call({ op: 'putValue', key, value })) as IndexedNote;
    this.apply(n);
    return n;
  }

  async delete(key: string) {
    const keys = (await this.call({ op: 'delete', key })) as string[];
    keys.forEach((k) => this.notes.delete(k));
    this.bump();
    return keys;
  }

  readBlob(name: string) { return this.call({ op: 'readBlob', name }) as Promise<Uint8Array | undefined>; }

  async writeBlob(name: string, bytes: Uint8Array) {
    this.urls.delete(name);
    await this.call({ op: 'writeBlob', name, bytes });
  }

  blobUrl(name: string) {
    let url = this.urls.get(name);
    if (!url) {
      url = this.readBlob(name).then((b) => (b ? URL.createObjectURL(new Blob([b as Uint8Array<ArrayBuffer>])) : null));
      this.urls.set(name, url);
    }
    return url;
  }
}
