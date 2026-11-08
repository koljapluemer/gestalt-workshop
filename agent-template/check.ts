// `node check.ts`: what the workshop checks before it shows plugin.tsx (the same compile), plus types and content.
// Exit code 0 when all is well.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parse } from 'yaml';
import { compile } from './.workshop/compile.ts';

const id = basename(process.cwd());
const tag = `wp-${id}`;
let failed = false;
const fail = (msg: string) => { failed = true; console.log(`✗ ${msg}`); };

if (!existsSync('plugin.tsx')) {
  fail('plugin.tsx is missing');
} else {
  const r = compile(readFileSync('plugin.tsx', 'utf8'));
  if (r.ok) console.log(`✓ plugin.tsx compiles (imports: ${r.imports.join(', ') || 'none'})`);
  else for (const e of r.errors) fail(`plugin.tsx${e.line ? `:${e.line}` : ''}: ${e.message}`);
  const tsc = spawnSync('node_modules/.bin/tsc', ['-p', '.'], { encoding: 'utf8' });
  if (tsc.status === 0) console.log('✓ types check');
  else fail(`types:\n${(tsc.stdout + tsc.stderr).trim()}`);
}

for (const f of existsSync('content') ? readdirSync('content').filter((n) => n.endsWith('.yml')) : []) {
  const path = `content/${f}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.yml$/.test(f)) { fail(`${path}: name must be letters, digits, _ . - (it becomes the note key wp-${id}-<name>)`); continue; }
  try {
    const v = parse(readFileSync(path, 'utf8')) as unknown;
    const tags = v && typeof v === 'object' && !Array.isArray(v) ? (v as { tags?: unknown }).tags : undefined;
    const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : [];
    if (!list.includes(tag)) fail(`${path}: needs \`tags: [${tag}]\` (it isn't saved otherwise)`);
  } catch (e) {
    fail(`${path}: not valid YAML: ${(e as Error).message}`);
  }
}

if (!failed) console.log('✓ all good');
process.exit(failed ? 1 : 0);
