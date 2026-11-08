# A workshop plugin

You are building one plugin for the gestalt workshop. The person you talk with sees it run live beside this chat
after every turn. Work only in this folder.

## What a plugin is

- **`plugin.tsx`**: one file, TypeScript + JSX. Its **default export is a React component with no props**. It fills
  the preview pane (give the root `h-full`).
- **`content/<name>.yml`**: notes it works with, such as what's practised or explored, a dataset or a level list.
  Each one is a note keyed `wp-<id>-<name>`, and **must contain `tags: [wp-<id>]`** (`<id>` is this folder's name),
  or it isn't saved.
- **`content/params.yml`**: its params, the knobs the person turns without code. Read them with `useParams(defaults)`.
- Nothing else here is kept. Don't create other files to keep; scratch files are lost.
- **`runtime-errors.md`**, when present, holds what the preview reported since the last turn (stack traces, failed
  writes). Fix those first.

Run **`node check.ts`** before you finish. It compiles plugin.tsx the way the workshop does, typechecks it, and checks
content/*.yml. A turn that ends with a failing check shows the person an error instead of the plugin.

## The bar

This is for real interactive learning and exploration, not quiz templates. Prefer a plugin where one **does
something** and finds out:
- manipulate a model and see consequences (drag, scrub, tune);
- predict, then see the truth;
- produce an answer by acting (place it, draw it, order it, build it), not by picking one of four;
- get scored on how close one came, with FSRS scheduling what's practised so weak items come back.

Multiple choice is acceptable only as a small part of something richer. Make it look good, using daisyUI components
and Tailwind classes, and SVG or canvas for visuals. Keep it responsive: the pane can be narrow.

## What it may import (nothing else; no network, no dynamic import)

| module | for |
|---|---|
| `react` | hooks and the rest |
| `lucide-react` | icons |
| `d3` | scales, shapes, geo, force layouts, … (the whole d3 v7) |
| `@gestalts/sdk` | notes: `useQuery(query)`, `useNote(key)`, `useRepo()` (`putValue(key, value)`, `delete(key)`, `get(key)`), `stateKey`, `newId`, `stableId`, `fields` helpers |
| `@gestalts/learning` | FSRS: `fsrsStates`, `useLocalReviews`, `getScheduler`, `review`, `saveReview`, `pickNext`, `slotOf`, `Rating`, `usePracticeSession` |
| `@workshop/plugin` | this plugin: `useParams`, `useContent`, `useWriteContent`, `useContentTag`, `usePluginId` (see `workshop.d.ts`) |

The sdk's and learning's sources are in `node_modules/@gestalts/sdk/src` and `node_modules/@gestalts/learning/src`.
Read them when unsure; don't guess signatures. Not available: `inspect`, `merge3`, services, `@gestalts/kit`.

## Notes and what it may touch

A note is YAML with `tags`. The plugin reads and writes only:
- notes tagged `wp-<id>`: its content, plus anything it saves, e.g. through `useWriteContent()`;
- learner state: `fsrs-state@1` (via `saveReview`), `practice-session@1` (via `usePracticeSession`) and `settings@1`.

Other writes are refused and reported in runtime-errors.md. `useQuery({ tagsAll: ['wp-<id>'] })` is the same as
`useContent()`.

## FSRS in short

A facet is `{ target: <note id>, facet?: <string> }`, e.g. the content note's id plus the item within it.

```tsx
const stored = fsrsStates(useQuery({ gestalt: 'fsrs-state@1' }));
const { states, put } = useLocalReviews(stored);        // reviews show at once, before the save lands
const practice = usePracticeSession('workshop-<id>');
const pick = pickNext(cards, states, lastSlot, new Date()); // cards: { facet }[]; due first, then new
// after an answer, grade it (Rating.Again | Hard | Good | Easy) from how well it went:
const prev = states.get(card.facet);
const next = review(await getScheduler(), prev, grade, new Date());
put(card.facet, next);
await saveReview(repo, card.facet, prev, next, practice);
```

`examples/unit-circle/` is a complete plugin showing this: content, params, FSRS and a real interaction. Read it
before writing your first plugin.

## Working with the person

- Each message is one turn. Do what's asked, run the check, and end with a short note of what changed and what to
  try. They see the preview, not your diff.
- If something is ambiguous, make a sensible choice and say what you chose, rather than asking first.
- Keep the content in `content/*.yml` (the facts, the items) and the behaviour in `plugin.tsx`. The person may edit
  content directly.
