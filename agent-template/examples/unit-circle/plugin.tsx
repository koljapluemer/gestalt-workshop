// Example workshop plugin (id `unit-circle`): drag the point to the angle asked for. How close you land rates that
// angle by FSRS, so the angles you miss come back sooner. Content: content/angles.yml; params: tolerance, labels.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useRepo } from '@gestalts/sdk';
import { fsrsStates, getScheduler, review, saveReview, useLocalReviews, usePracticeSession, pickNext, slotOf, Rating, type Grade } from '@gestalts/learning';
import { useContent, useParams } from '@workshop/plugin';
import { RotateCcw } from 'lucide-react';

type Card = { facet: { target: string; facet: string }; label: string; radians: number };

const R = 140;
const TAU = 2 * Math.PI;

/** `5π/6` → radians; plain numbers are degrees. */
function parseAngle(s: string): number | null {
  const m = /^\s*(-?\d*)\s*π\s*(?:\/\s*(\d+))?\s*$/.exec(s);
  if (m) return ((m[1] === '' ? 1 : m[1] === '-' ? -1 : Number(m[1])) * Math.PI) / (m[2] ? Number(m[2]) : 1);
  const d = Number(s);
  return Number.isFinite(d) ? (d * Math.PI) / 180 : null;
}

const norm = (a: number) => ((a % TAU) + TAU) % TAU;
const gap = (a: number, b: number) => { const d = Math.abs(norm(a) - norm(b)); return Math.min(d, TAU - d); };

export default function Plugin() {
  const repo = useRepo();
  const [params] = useParams({ tolerance_deg: 8, show_degrees: false });
  const content = useContent();
  const deck = content.find((n) => n.key.endsWith('-angles'));
  const cards = useMemo<Card[]>(() => {
    const v = deck?.value as { angles?: unknown } | null | undefined;
    const list = Array.isArray(v?.angles) ? v.angles.filter((a): a is string => typeof a === 'string') : [];
    return list.flatMap((label) => {
      const radians = parseAngle(label);
      return radians === null || !deck ? [] : [{ facet: { target: deck.id, facet: label }, label, radians }];
    });
  }, [deck]);

  const stored = fsrsStates(useQuery({ gestalt: 'fsrs-state@1' }));
  const { states, put } = useLocalReviews(stored);
  const practice = usePracticeSession('workshop-unit-circle');
  const [card, setCard] = useState<Card | null>(null);
  const [answer, setAnswer] = useState<{ radians: number; grade: Grade } | null>(null);
  const [angle, setAngle] = useState(0);
  const dragging = useRef(false);
  const svg = useRef<SVGSVGElement>(null);

  const next = (last: string | null) => {
    const pick = pickNext(cards, states, last, new Date());
    setCard(pick.card);
    setAnswer(null);
    practice.shown();
  };
  // a new deck starts afresh
  useEffect(() => { next(null); }, [cards.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const pointAt = (e: React.PointerEvent) => {
    const box = svg.current!.getBoundingClientRect();
    const x = e.clientX - (box.left + box.width / 2);
    const y = (box.top + box.height / 2) - e.clientY;
    setAngle(norm(Math.atan2(y, x)));
  };

  const commit = async () => {
    if (!card || answer) return;
    const err = (gap(angle, card.radians) * 180) / Math.PI;
    const tol = params.tolerance_deg;
    const grade: Grade = err <= tol / 2 ? Rating.Easy : err <= tol ? Rating.Good : err <= 3 * tol ? Rating.Hard : Rating.Again;
    setAnswer({ radians: angle, grade });
    const prev = states.get(card.facet);
    const state = review(await getScheduler(), prev, grade, new Date());
    put(card.facet, state);
    await saveReview(repo, card.facet, prev, state, practice);
  };

  if (!cards.length) return <div className="p-8 text-base-content/60">Add angles to content/angles.yml (e.g. <code>angles: [π/6, 3π/4]</code>).</div>;
  const at = (a: number, r = R) => [r * Math.cos(a), -r * Math.sin(a)] as const;
  const [px, py] = at(angle);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <p className="text-lg">Drag to <span className="font-semibold">{card?.label ?? 'nothing due'}</span></p>
      <svg ref={svg} viewBox="-180 -180 360 360" className="w-full max-w-md touch-none select-none"
           onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture(e.pointerId); pointAt(e); }}
           onPointerMove={(e) => dragging.current && !answer && pointAt(e)}
           onPointerUp={() => { dragging.current = false; void commit(); }}>
        <circle r={R} className="fill-none stroke-base-content/30" strokeWidth={2} />
        <line x1={-170} x2={170} className="stroke-base-content/15" />
        <line y1={-170} y2={170} className="stroke-base-content/15" />
        {answer && card && <line x2={at(card.radians)[0]} y2={at(card.radians)[1]} className="stroke-success" strokeWidth={3} />}
        <line x2={px} y2={py} className="stroke-primary" strokeWidth={2} />
        <circle cx={px} cy={py} r={10} className="fill-primary" />
      </svg>
      {params.show_degrees && <p className="font-mono text-sm">{((angle * 180) / Math.PI).toFixed(1)}°</p>}
      {answer && card && (
        <div className="flex items-center gap-3">
          <span className={answer.grade >= Rating.Good ? 'text-success' : 'text-error'}>
            off by {((gap(answer.radians, card.radians) * 180) / Math.PI).toFixed(1)}°
          </span>
          <button type="button" className="btn btn-sm" onClick={() => next(slotOf(card.facet))}><RotateCcw className="size-4" /> Next</button>
        </div>
      )}
    </div>
  );
}
