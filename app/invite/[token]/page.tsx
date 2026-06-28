import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/rbac';
import { getServerClient } from '@/lib/supabase/server';
import { staffService } from '@/lib/services';
import { ROUTES } from '@/config/constants';

/**
 * Accept-invite page.
 *
 * Redeems a staff invitation token for the signed-in caller via the
 * accept_staff_invitation RPC (lib/services/staff.service.ts). Unauthenticated
 * visitors are bounced to sign-in with a `redirect` back to this same URL —
 * same pattern as app/onboarding/page.tsx — so they land here again once
 * signed in and the token gets redeemed then.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect(`${ROUTES.signIn}?redirect=/invite/${token}`);
  }

  const client = await getServerClient();
  const result = await staffService.acceptInvitation(client, token);

  if (result.error) {
    return (
      <main className="auth-shell">
        <div className="auth-card" style={{ maxWidth: 380 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            Invitation problem
          </h1>
          <p style={{ color: '#b91c1c', fontSize: 14, marginTop: 12 }}>
            {result.error.message}
          </p>
          <Link
            href={ROUTES.dashboard}
            className="auth-btn"
            style={{ marginTop: 20, textDecoration: 'none' }}
          >
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  redirect(ROUTES.dashboard);
}
