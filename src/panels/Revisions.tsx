import { useRepoVersion, type Repo } from '@gestalts/client';
import { revisions, setSource, type WorkshopPlugin } from '../workshop';

/** Every source the plugin had; reverting to one makes it a new revision. */
export function Revisions({ repo, plugin }: { repo: Repo; plugin: WorkshopPlugin }) {
  // re-rendered on every change of the repo; reading them is cheap
  useRepoVersion();
  const list = revisions(repo, plugin.id);
  if (!list.length) return <p className="p-3 text-sm text-base-content/60">No revisions yet: each turn that changes plugin.tsx makes one.</p>;
  return (
    <ul className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      {list.map((r) => {
        const current = r.source === plugin.source;
        return (
          <li key={r.key} className={`flex items-start gap-2 rounded-box p-2 ${current ? 'bg-base-200' : ''}`}>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-base-content/60">{new Date(r.at).toLocaleString()}</div>
              <div className="line-clamp-2 text-sm">{r.message}</div>
            </div>
            {current
              ? <span className="badge badge-sm">current</span>
              : <button type="button" className="btn btn-xs" onClick={() => void setSource(repo, plugin, r.source, `revert to ${new Date(r.at).toLocaleString()}`)}>Revert</button>}
          </li>
        );
      })}
    </ul>
  );
}
