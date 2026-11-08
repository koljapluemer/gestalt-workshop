import { useHost, useQuery, useRepo } from '@gestalts/client';
import { contentTag, paramsKey, type WorkshopPlugin } from '../workshop';

/** The plugin's content and params: notes tagged `wp-<id>`, opened over the pane to edit. */
export function Content({ plugin }: { plugin: WorkshopPlugin }) {
  const repo = useRepo();
  const host = useHost();
  const notes = useQuery({ tagsAll: [contentTag(plugin.id)] });
  const prefix = `wp-${plugin.id}-`;
  const params = notes.find((n) => n.key === paramsKey(plugin.id));
  const editParams = async () => {
    if (!params) await repo.putValue(paramsKey(plugin.id), { tags: [contentTag(plugin.id)] });
    host.openNote?.(paramsKey(plugin.id));
  };
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
      <button type="button" className="btn btn-sm" onClick={() => void editParams()}>{params ? 'Edit params' : 'Add params'}</button>
      <p className="text-xs text-base-content/60">
        Notes tagged <code>{contentTag(plugin.id)}</code>: what the plugin is about, and what it keeps. The agent sees them
        as <code>content/&lt;name&gt;.yml</code>.
      </p>
      <ul className="menu menu-sm w-full p-0">
        {notes.filter((n) => n !== params).map((n) => (
          <li key={n.key}>
            <button type="button" onClick={() => host.openNote?.(n.key)}>
              <span className="truncate font-mono">{n.key.startsWith(prefix) ? n.key.slice(prefix.length) : n.key}</span>
              {n.parse_error && <span className="badge badge-error badge-xs">YAML</span>}
            </button>
          </li>
        ))}
      </ul>
      {notes.length === (params ? 1 : 0) && <p className="text-sm text-base-content/60">No content yet.</p>}
    </div>
  );
}
