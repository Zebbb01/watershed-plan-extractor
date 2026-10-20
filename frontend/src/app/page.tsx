import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Home, type SampleCard } from '@/components/home/home';

// The sample list ships with the site (public/samples/index.json, built by `npm run samples`).
async function samples(): Promise<SampleCard[]> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), 'public', 'samples', 'index.json'), 'utf8'));
  } catch {
    return [];
  }
}

export default async function Page() {
  return <Home samples={await samples()} />;
}
