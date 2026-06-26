/**
 * HTTP helpers shared across Edge Functions: CORS handling and typed JSON
 * responses. Keeping these in one place means every function answers preflight
 * requests and shapes errors identically.
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Standard success envelope. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Standard error envelope with a stable shape the client can branch on. */
export function errorResponse(
  message: string,
  status = 400,
  code: string | null = null,
): Response {
  return new Response(JSON.stringify({ error: { message, code } }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Answers a CORS preflight request. */
export function handlePreflight(): Response {
  return new Response('ok', { headers: corsHeaders });
}
