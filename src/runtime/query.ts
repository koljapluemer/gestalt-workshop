import type { IndexedNote, Json, Query } from '@gestalts/sdk';

/**
 * `Query.matches` of the core (gestalts/crates/core/src/repo.rs) over notes the host already indexed, for the frame's
 * copy of them. The host sends only live notes (no tombstones), so this doesn't look for those.
 */
export function matches(n: IndexedNote, q: Query): boolean {
  const tags = tagsOf(n.value);
  return (q.gestalt === undefined || n.gestalts.includes(q.gestalt))
    && !(q.gestaltsNone ?? []).some((g) => n.gestalts.includes(g))
    && (q.tagsAll ?? []).every((t) => tags.includes(t))
    && !(q.tagsNone ?? []).some((t) => tags.includes(t))
    && (q.keys === undefined || q.keys.includes(n.key))
    && Object.entries(q.where ?? {}).every(([k, v]) => field(n.value, k) !== undefined && same(field(n.value, k)!, v));
}

/** The notes `q` asks for, by key like the core's index. */
export function query(notes: Iterable<IndexedNote>, q: Query = {}): IndexedNote[] {
  return [...notes].filter((n) => matches(n, q)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function isMap(v: Json | null): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function field(v: Json | null, k: string): Json | undefined {
  return isMap(v) ? v[k] : undefined;
}

/** `string_list` of the core: a list's strings, or a single string. */
function tagsOf(v: Json | null): string[] {
  const t = field(v, 'tags');
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return typeof t === 'string' ? [t] : [];
}

function same(a: Json, b: string | number | boolean | null): boolean {
  return a === b;
}
