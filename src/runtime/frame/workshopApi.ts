/**
 * `@workshop/plugin`: what a workshop plugin knows about itself. Its content and params are notes tagged
 * `wp-<id>`; params are the note `wp-<id>-params`. Types for plugins: agent-template/workshop.d.ts (keep in step).
 */
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useNote, useQuery, useRepo, type IndexedNote, type Json } from '@gestalts/sdk';

export const PluginIdContext = createContext('');

type JsonMap = { [key: string]: Json };

const isMap = (v: Json | null | undefined): v is JsonMap => typeof v === 'object' && v !== null && !Array.isArray(v);

export function usePluginId(): string {
  return useContext(PluginIdContext);
}

/** The tag every note of this plugin's content carries. */
export function useContentTag(): string {
  return `wp-${usePluginId()}`;
}

/** This plugin's content notes (params aside). */
export function useContent(): IndexedNote[] {
  const id = usePluginId();
  const notes = useQuery({ tagsAll: [`wp-${id}`] });
  return useMemo(() => notes.filter((n) => n.key !== `wp-${id}-params`), [notes, id]);
}

/** Writes the content note `name` (key `wp-<id>-<name>`), tagged as this plugin's. */
export function useWriteContent(): (name: string, value: JsonMap) => Promise<IndexedNote> {
  const id = usePluginId();
  const repo = useRepo();
  return useCallback((name, value) => {
    const tag = `wp-${id}`;
    const tags = Array.isArray(value.tags) ? value.tags.filter((t): t is string => typeof t === 'string') : [];
    return repo.putValue(`wp-${id}-${name}`, { ...value, tags: [...new Set([tag, ...tags])] });
  }, [id, repo]);
}

/** The plugin's params (its config, a note the user can edit), over `defaults`; the setter merges a patch. */
export function useParams<T extends JsonMap>(defaults: T): [T, (patch: Partial<T>) => Promise<void>] {
  const id = usePluginId();
  const repo = useRepo();
  const key = `wp-${id}-params`;
  const note = useNote(key);
  const params = useMemo(() => {
    const stored = isMap(note?.value) ? note.value : {};
    const { tags: _t, id: _i, ...rest } = stored;
    return { ...defaults, ...rest } as T;
    // defaults are usually a literal: compare by content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, JSON.stringify(defaults)]);
  const set = useCallback(async (patch: Partial<T>) => {
    const current = repo.get(key)?.value;
    await repo.putValue(key, { ...(isMap(current) ? current : {}), ...(patch as JsonMap), tags: [`wp-${id}`] });
  }, [repo, key, id]);
  return [params, set];
}
