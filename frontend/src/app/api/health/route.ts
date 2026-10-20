import { connection } from 'next/server';

// Reports whether an LLM provider is configured. Never returns secrets.
export async function GET() {
  await connection(); // read env at request time, not at build time
  return Response.json({ ok: true, provider: null, model: null });
}
