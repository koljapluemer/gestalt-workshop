import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as lucide from 'lucide-react';
import * as d3 from 'd3';
import * as sdk from '@gestalts/sdk';
import * as learning from '@gestalts/learning';
import { ALLOWED_IMPORTS } from '../compile';
import * as workshop from './workshopApi';

/** What `require` gives a workshop plugin: exactly `ALLOWED_IMPORTS`. */
export const MODULES: Record<(typeof ALLOWED_IMPORTS)[number], unknown> = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  'lucide-react': lucide,
  d3,
  '@gestalts/sdk': sdk,
  '@gestalts/learning': learning,
  '@workshop/plugin': workshop,
};

export function requireModule(name: string): unknown {
  if (Object.hasOwn(MODULES, name)) return MODULES[name as keyof typeof MODULES];
  throw new Error(`cannot import ${JSON.stringify(name)} in a workshop plugin`);
}
