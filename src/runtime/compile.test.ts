import { describe, expect, it } from 'vitest';
import { compile } from './compile';

const ok = (source: string) => {
  const r = compile(source);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('\n'));
  return r;
};

describe('compile', () => {
  it('compiles TSX with allowed imports to CommonJS', () => {
    const r = ok(`
      import { useState } from 'react';
      import { useQuery } from '@gestalts/sdk';
      import { useParams } from '@workshop/plugin';
      type P = { n: number };
      export default function Plugin() {
        const [n, setN] = useState<P['n']>(0);
        useQuery({});
        useParams({});
        return <button onClick={() => setN(n + 1)}>{n}</button>;
      }
    `);
    expect(r.js).toMatch(/exports\.\s*default/);
    expect(r.imports.sort()).toEqual(['@gestalts/sdk', '@workshop/plugin', 'react', 'react/jsx-runtime']);
  });

  it('refuses imports outside the allowlist', () => {
    const r = compile(`import fs from 'node:fs'; import x from './other'; export default () => [fs, x];`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.message).join('\n')).toMatch(/node:fs[\s\S]*\.\/other/);
  });

  it('refuses dynamic import', () => {
    expect(compile(`export default function P() { void import('d3'); return null; }`).ok).toBe(false);
  });

  it('needs a default export', () => {
    const r = compile(`export function Plugin() { return null; }`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toMatch(/default export/);
  });

  it('reports syntax errors with their line', () => {
    const r = compile(`export default function P() {\n  return <div>;\n}`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].line).toBeGreaterThan(0);
  });
});
