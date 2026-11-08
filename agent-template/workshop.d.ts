// `@workshop/plugin`: what a workshop plugin knows about itself (src/runtime/frame/workshopApi.ts; keep in step).
import type { IndexedNote, Json } from '@gestalts/sdk';

type JsonMap = { [key: string]: Json };

/** This plugin's id (this workspace's folder name). */
export declare function usePluginId(): string;

/** `wp-<id>`: the tag every content note of this plugin carries. */
export declare function useContentTag(): string;

/** This plugin's content notes (every note tagged `wp-<id>`, params aside), live. */
export declare function useContent(): IndexedNote[];

/** Writes the content note `name` (key `wp-<id>-<name>`, `content/<name>.yml` here), adding the tag. */
export declare function useWriteContent(): (name: string, value: JsonMap) => Promise<IndexedNote>;

/**
 * The plugin's params over `defaults`: the note `wp-<id>-params` (`content/params.yml` here), which the user edits
 * beside the preview. The setter merges a patch into it.
 */
export declare function useParams<T extends JsonMap>(defaults: T): [T, (patch: Partial<T>) => Promise<void>];
