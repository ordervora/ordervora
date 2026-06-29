/**
 * send-staff-invite — delivers the email for a pending staff invitation.
 *
 * Owner-only (matches the staff_invitations RLS write tier). Re-reads the
 * invitation with the service client so the email/role/token are trusted,
 * confirms the caller owns that restaurant, confirms the invitation is still
 * pending and unexpired, then sends the accept link via Resend. Kept
 * invite-specific rather than a generic email relay so this function can
 * never be used to send arbitrary mail to arbitrary addresses.
 */

import {
  handlePreflight,
  jsonResponse,
  errorResponse,
} from '../_shared/http.ts';
import { userClient, serviceClient, getUserId } from '../_shared/supabase.ts';
import { isOwner, writeAudit } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email.ts';

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://ordervora.com';

interface InviteRequest {
  invitation_id?: string;
}

/** Minimal escaping for values interpolated into the email's HTML body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handlePreflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('Not authenticated.', 401);

  let body: InviteRequest;
  try {
    body = (await req.json()) as InviteRequest;
  } catch {
    return errorResponse('Invalid JSON body.', 400);
  }

  const invitationId = body.invitation_id;
  if (!invitationId) {
    return errorResponse('invitation_id is required.', 400);
  }

  const service = serviceClient();
  const { data: invitation, error: invitationError } = await service
    .from('staff_invitations')
    .select('id, restaurant_id, email, role, token, status, expires_at')
    .eq('id', invitationId)
    .single();

  if (invitationError || !invitation) {
    return errorResponse('Invitation not found.', 404);
  }

  const user = userClient(req);
  if (!(await isOwner(user, invitation.restaurant_id, userId))) {
    return errorResponse(
      'Only the restaurant owner can invite staff.',
      403,
      'forbidden',
    );
  }

  if (invitation.status !== 'pending') {
    return errorResponse('This invitation is no longer pending.', 409);
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return errorResponse('This invitation has expired.', 409);
  }

  const { data: restaurant } = await service
    .from('restaurants')
    .select('name')
    .eq('id', invitation.restaurant_id)
    .single();

  const restaurantName = restaurant?.name ?? 'OrderVora';
  const acceptUrl = `${SITE_URL}/invite/${invitation.token}`;

  try {
    await sendEmail({
      to: invitation.email,
      subject: `You're invited to join ${restaurantName} on OrderVora`,
      html: `
        <p>You've been invited to join <strong>${escapeHtml(restaurantName)}</strong> as a <strong>${escapeHtml(invitation.role)}</strong> on OrderVora.</p>
        <p><a href="${acceptUrl}">Accept invitation</a></p>
        <p>This link expires on ${new Date(invitation.expires_at).toLocaleDateString()}. If you weren't expecting this, you can ignore this email.</p>
      `,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not send the invitation email.';
    return errorResponse(message, 502, 'email_error');
  }

  await writeAudit(service, {
    restaurantId: invitation.restaurant_id,
    actorId: userId,
    action: 'staff.invited',
    entityType: 'staff_invitation',
    entityId: invitation.id,
    metadata: { email: invitation.email, role: invitation.role },
  });

  return jsonResponse({ ok: true });
});
