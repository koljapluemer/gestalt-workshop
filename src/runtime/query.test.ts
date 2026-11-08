import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IndexedNote, Query } from '@gestalts/sdk';
import { query } from './query';

// the core itself, as the host runs it, over notes in memory: the frame's matching must agree with it
const WASM = new URL('../../../gestalts/packages/client/wasm/', import.meta.url);
type Core = { query(q: Query): IndexedNote[] };

const NOTES: Record<string, string> = {
  a: 'tags: [flashcard]\nfront: x\nback: y\n',
  b: 'tags: [flashcard, archived]\nfront: x\nback: y\n',
  c: 'this: [is broken',
  d: 'tags: wp-epicycles\nlevel: 3\nname: circle\n',
  e: 'tags: [wp-epicycles, extra]\nlevel: 3.5\ndone: true\n',
  f: 'tags: [workshop-plugin]\ntitle: Epicycles\nplugin: epicycles\nsource: "export default () => null"\n',
  g: 'tags: [workshop-plugin]\ntitle: no plugin field\n',
  h: 'id: 7c7b9b2e-0000-4000-8000-000000000000\ndeleted: 2026-01-01T00:00:00Z\n',
  i: 'tags: [wp-epicycles]\nname: null\nlevel: "3"\n',
  j: '',
};

const QUERIES: Query[] = [
  {},
  { gestalt: 'flashcard@1' },
  { gestalt: 'flashcard@1', tagsNone: ['archived'] },
  { gestaltsNone: ['flashcard@1'] },
  { tagsAll: ['wp-epicycles'] },
  { tagsAll: ['wp-epicycles', 'extra'] },
  { tagsNone: ['wp-epicycles', 'flashcard'] },
  { keys: ['a', 'd', 'zz'] },
  { keys: [] },
  { where: { level: 3 } },
  { where: { level: '3' } },
  { where: { done: true } },
  { where: { name: null } },
  { where: { name: 'circle' }, tagsAll: ['wp-epicycles'] },
  { gestalt: 'workshop-plugin@1' },
];

let core: Core;

beforeAll(async () => {
  const wasm = await import(/* @vite-ignore */ new URL('gestalts.js', WASM).href);
  wasm.initSync({ module: readFileSync(fileURLToPath(new URL('gestalts_bg.wasm', WASM))) });
  const notes = new Map(Object.entries(NOTES));
  const storage = {
    listNotes: async () => [...notes.keys()],
    readNote: async (k: string) => notes.get(k) ?? null,
    readNotes: async (keys: string[]) => keys.filter((k) => notes.has(k)).map((k) => [k, notes.get(k)!]),
    readAllNotes: async () => [...notes.entries()],
    noteHashes: async () => Object.fromEntries([...notes.keys()].map((k) => [k, k])),
    writeNote: async (k: string, t: string) => { notes.set(k, t); },
    writeNotes: async (ns: [string, string][]) => { ns.forEach(([k, t]) => notes.set(k, t)); },
    deleteNote: async (k: string) => { notes.delete(k); },
    listBlobs: async () => [],
    readBlob: async () => null,
    writeBlob: async () => {},
    deleteBlob: async () => {},
  };
  const gestalt = readFileSync(fileURLToPath(new URL('../../plugins/workshop/gestalts/workshop-plugin/v1.yml', import.meta.url)), 'utf8');
  core = await wasm.WasmRepo.openWith(storage, [], [gestalt]);
});

describe('query', () => {
  it.each(QUERIES.map((q) => [JSON.stringify(q), q] as const))('matches the core for %s', (_, q) => {
    const all = core.query({});
    expect(query(all, q).map((n) => n.key)).toEqual(core.query(q).map((n) => n.key));
  });

  it('sees the fixtures it should', () => {
    // the comparison is only as good as what the core indexed
    const keys = core.query({}).map((n) => n.key);
    expect(keys).not.toContain('h');
    expect(core.query({ gestalt: 'workshop-plugin@1' }).map((n) => n.key)).toEqual(['f']);
  });
});
