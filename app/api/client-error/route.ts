/**
 * Receives client-side exception reports from the global/segment error
 * boundaries and writes them to server logs, since production React error
 * messages are redacted in the browser and we have no other way to see
 * what a real user's client actually threw.
 */
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  console.error('[client-error]', JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
