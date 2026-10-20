import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_DIR } from './doc-set';

/** process.env plus frontend/.env.local (process.env wins). Values are never printed. */
export function loadEnv(): Record<string, string | undefined> {
  const file = join(EVAL_DIR, '..', '..', 'frontend', '.env.local');
  const fromFile: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#')) fromFile[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  const env: Record<string, string | undefined> = { ...fromFile };
  for (const [k, v] of Object.entries(process.env)) if (v) env[k] = v;
  return env;
}
