/**
 * A workshop plugin's one file to code the frame runs: TypeScript + JSX to CommonJS (sucrase), imports only from the
 * allowlist, a default export. The browser runs it before saving and showing a plugin; the agent template's
 * `check.ts` runs the same file under plain node (so: erasable TypeScript only, no imports of other local files).
 */
import { transform } from 'sucrase';

/** What a plugin may import; the frame's module table provides exactly these. */
export const ALLOWED_IMPORTS = [
  'react',
  'react/jsx-runtime',
  'lucide-react',
  'd3',
  '@gestalts/sdk',
  '@gestalts/learning',
  '@workshop/plugin',
] as const;

export type CompileError = { message: string; line?: number; column?: number };
export type Compiled = { ok: true; js: string; imports: string[] } | { ok: false; errors: CompileError[] };

// unused imports are dropped (TypeScript's rule), so only what the plugin uses is checked and loaded
const REQUIRE = /\brequire\((['"])([^'"]+)\1\)/g;

export function compile(source: string): Compiled {
  let js: string;
  try {
    js = transform(source, {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxRuntime: 'automatic',
      production: true,
      filePath: 'plugin.tsx',
    }).code;
  } catch (e) {
    const err = e as { message?: string; loc?: { line: number; column: number } };
    return { ok: false, errors: [{ message: err.message ?? String(e), line: err.loc?.line, column: err.loc?.column }] };
  }
  const imports = [...new Set([...js.matchAll(REQUIRE)].map((m) => m[2]))];
  const errors: CompileError[] = imports
    .filter((i) => !(ALLOWED_IMPORTS as readonly string[]).includes(i))
    .map((i) => ({ message: `cannot import ${JSON.stringify(i)}: a workshop plugin may import only ${ALLOWED_IMPORTS.join(', ')}` }));
  if (/\bimport\s*\(/.test(source)) errors.push({ message: 'dynamic import() is not available in a workshop plugin' });
  if (!/\bexports\.\s*default\s*=/.test(js)) errors.push({ message: 'plugin.tsx needs a default export: the React component to show' });
  return errors.length ? { ok: false, errors } : { ok: true, js, imports };
}
