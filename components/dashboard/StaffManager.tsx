'use client';

/**
 * StaffManager — staff accounts, roles, and activity.
 *
 * Lists the restaurant's staff with their role and status, lets an owner change
 * a member's role or suspend/reactivate them, shows the permission set each role
 * grants (from the RBAC matrix), and renders a recent activity log from
 * audit_logs. Writes go through the staff service; all scoped by restaurant_id.
 */

import { useEffect, useState } from 'react';
import { UserPlus, History, Mail } from 'lucide-react';

import { getBrowserClient } from '@/lib/supabase/client';
import { useDashboard } from '@/lib/dashboard/context';
import { staffService } from '@/lib/services';
import { sendStaffInvite } from '@/lib/dashboard/actions';
import { permissionsForRole } from '@/lib/rbac/permissions';
import { dateTime, dateOnly } from '@/lib/dashboard/utils';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { SkeletonTable } from '@/components/dashboard/Skeleton';
import { Spinner } from '@/components/Spinner';
import type { StaffWithProfile, StaffInvitation } from '@/lib/services/staff.service';
import { STAFF_ROLES, type StaffRole } from '@/config/constants';

interface InviteForm {
  email: string;
  role: StaffRole;
}

const EMPTY_INVITE: InviteForm = { email: '', role: 'kitchen' };

interface ActivityRow {
  id: string;
  action: string;
  at: string;
  entityType: string | null;
}

const ROLE_OPTIONS: StaffRole[] = [...STAFF_ROLES];

export function StaffManager() {
  const { restaurant, role: viewerRole, isPlatformAdmin } = useDashboard();
  const canManage = isPlatformAdmin || viewerRole === 'owner';

  const [staff, setStaff] = useState<StaffWithProfile[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRole, setExpandedRole] = useState<StaffRole | null>(null);

  const [inviteForm, setInviteForm] = useState<InviteForm | null>(null);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    const client = getBrowserClient();
    const [list, invites, logs] = await Promise.all([
      staffService.listStaff(client, restaurant.id),
      staffService.listInvitations(client, restaurant.id),
      client
        .from('audit_logs')
        .select('id, action, entity_type, created_at')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    setStaff(list.error ? [] : list.data);
    setInvitations(invites.error ? [] : invites.data);
    setActivity(
      ((logs.data ?? []) as {
        id: string;
        action: string;
        entity_type: string | null;
        created_at: string;
      }[]).map((l) => ({
        id: l.id,
        action: l.action,
        at: l.created_at,
        entityType: l.entity_type,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.id]);

  async function changeRole(staffId: string, role: StaffRole) {
    const client = getBrowserClient();
    await staffService.updateStaffRole(client, staffId, role);
    await load();
  }

  async function toggleStatus(member: StaffWithProfile) {
    const client = getBrowserClient();
    const next = member.status === 'suspended' ? 'active' : 'suspended';
    await staffService.setStaffStatus(client, member.id, next);
    await load();
  }

  function openInvite() {
    setInviteError(null);
    setInviteForm({ ...EMPTY_INVITE });
  }

  async function sendInvite() {
    if (!inviteForm) return;
    const email = inviteForm.email.trim();
    if (!email) {
      setInviteError('Enter an email address.');
      return;
    }
    setInviteSaving(true);
    setInviteError(null);

    const client = getBrowserClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      setInviteSaving(false);
      setInviteError('You must be signed in to invite staff.');
      return;
    }

    const created = await staffService.inviteStaff(
      client,
      restaurant.id,
      email,
      inviteForm.role,
      user.id,
    );
    if (created.error) {
      setInviteSaving(false);
      setInviteError(created.error.message);
      return;
    }

    const sent = await sendStaffInvite(created.data.id);
    setInviteSaving(false);
    if (!sent.ok) {
      setInviteError(sent.error ?? 'Invitation created, but the email could not be sent.');
    }
    setInviteForm(null);
    await load();
  }

  async function resendInvite(invitation: StaffInvitation) {
    setActingId(invitation.id);
    await sendStaffInvite(invitation.id);
    setActingId(null);
  }

  async function revokeInvite(invitation: StaffInvitation) {
    setActingId(invitation.id);
    const client = getBrowserClient();
    await staffService.revokeInvitation(client, invitation.id);
    setActingId(null);
    await load();
  }

  return (
    <>
      <header className="dash-head">
        <div>
          <h1>Staff</h1>
          <div className="dash-head-sub">{staff.length} members</div>
        </div>
        {canManage && (
          <button className="dash-btn" data-variant="primary" onClick={openInvite}>
            Invite staff
          </button>
        )}
      </header>

      <div className="dash-body">
        <div className="dash-grid" data-cols="2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Team</span>
            </div>
            <div className="dash-panel-body" data-flush="true">
              {loading ? (
                <SkeletonTable rows={5} columns={4} />
              ) : staff.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title="No staff yet"
                  description="Invite team members to give them access to this dashboard."
                  action={canManage ? { label: 'Invite staff', onClick: openInvite } : undefined}
                />
              ) : (
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Role</th>
                      <th>Status</th>
                      {canManage && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((member) => (
                      <tr key={member.id}>
                        <td className="dash-strong">
                          {member.display_name ??
                            member.profile?.full_name ??
                            'Staff'}
                        </td>
                        <td>
                          {canManage ? (
                            <select
                              className="dash-select"
                              value={member.role}
                              style={{ padding: '5px 8px', width: 'auto' }}
                              onChange={(e) =>
                                void changeRole(
                                  member.id,
                                  e.target.value as StaffRole,
                                )
                              }
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ textTransform: 'capitalize' }}>
                              {member.role}
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className="dash-badge"
                            data-tone={
                              member.status === 'active'
                                ? 'ready'
                                : member.status === 'suspended'
                                  ? 'dead'
                                  : 'done'
                            }
                          >
                            {member.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        {canManage && (
                          <td className="dash-num">
                            <button
                              className="dash-btn"
                              data-size="sm"
                              data-variant={
                                member.status === 'suspended'
                                  ? undefined
                                  : 'danger'
                              }
                              onClick={() => void toggleStatus(member)}
                            >
                              {member.status === 'suspended'
                                ? 'Reactivate'
                                : 'Suspend'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {(invitations.length > 0 || canManage) && (
            <div className="dash-panel">
              <div className="dash-panel-head">
                <span className="dash-panel-title">Pending invitations</span>
              </div>
              <div className="dash-panel-body" data-flush="true">
                {loading ? (
                  <SkeletonTable rows={2} columns={4} />
                ) : invitations.length === 0 ? (
                  <EmptyState icon={Mail} title="No invitations sent" />
                ) : (
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        {canManage && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map((invite) => (
                        <tr key={invite.id}>
                          <td className="dash-strong">{invite.email}</td>
                          <td style={{ textTransform: 'capitalize' }}>{invite.role}</td>
                          <td>
                            <span
                              className="dash-badge"
                              data-tone={
                                invite.status === 'pending'
                                  ? 'done'
                                  : invite.status === 'accepted'
                                    ? 'ready'
                                    : 'dead'
                              }
                            >
                              {invite.status}
                              {invite.status === 'pending' &&
                                ` · expires ${dateOnly(invite.expires_at)}`}
                            </span>
                          </td>
                          {canManage && (
                            <td className="dash-num">
                              {invite.status === 'pending' && (
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button
                                    className="dash-btn"
                                    data-size="sm"
                                    disabled={actingId === invite.id}
                                    onClick={() => void resendInvite(invite)}
                                  >
                                    {actingId === invite.id && <Spinner />}
                                    Resend
                                  </button>
                                  <button
                                    className="dash-btn"
                                    data-size="sm"
                                    data-variant="danger"
                                    disabled={actingId === invite.id}
                                    onClick={() => void revokeInvite(invite)}
                                  >
                                    Revoke
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="dash-panel">
              <div className="dash-panel-head">
                <span className="dash-panel-title">Role permissions</span>
              </div>
              <div className="dash-panel-body">
                <div className="dash-list">
                  {ROLE_OPTIONS.map((r) => {
                    const perms = permissionsForRole(r);
                    const open = expandedRole === r;
                    return (
                      <div key={r}>
                        <button
                          className="dash-kv"
                          style={{
                            width: '100%',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px 0',
                          }}
                          onClick={() => setExpandedRole(open ? null : r)}
                        >
                          <span
                            className="dash-strong"
                            style={{ textTransform: 'capitalize' }}
                          >
                            {r}
                          </span>
                          <span className="dash-kv-label">
                            {perms.length} permissions {open ? '▲' : '▼'}
                          </span>
                        </button>
                        {open && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--muted)',
                              padding: '4px 0 10px',
                              lineHeight: 1.7,
                            }}
                          >
                            {perms.join(' · ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <span className="dash-panel-title">Activity log</span>
              </div>
              <div className="dash-panel-body">
                {activity.length === 0 ? (
                  <EmptyState icon={History} title="No activity recorded" />
                ) : (
                  <div className="dash-feed">
                    {activity.map((a) => (
                      <div className="dash-feed-item" key={a.id}>
                        <span className="dash-feed-dot" />
                        <div>
                          <div className="dash-feed-text">
                            {a.action.replace(/[._]/g, ' ')}
                            {a.entityType ? ` · ${a.entityType}` : ''}
                          </div>
                          <div className="dash-feed-time">{dateTime(a.at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {inviteForm && (
        <div
          className="dash-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInviteForm(null);
          }}
        >
          <div className="dash-modal">
            <div className="dash-modal-head">
              <span className="dash-modal-title">Invite staff</span>
              <button className="dash-x" onClick={() => setInviteForm(null)}>
                ×
              </button>
            </div>
            <div className="dash-modal-body">
              <div className="dash-field">
                <label>Email</label>
                <input
                  className="dash-input"
                  type="email"
                  autoFocus
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, email: e.target.value })
                  }
                  placeholder="name@example.com"
                />
              </div>
              <div className="dash-field">
                <label>Role</label>
                <select
                  className="dash-select"
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm({
                      ...inviteForm,
                      role: e.target.value as StaffRole,
                    })
                  }
                >
                  {ROLE_OPTIONS.filter((r) => r !== 'owner').map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              {inviteError && (
                <div className="dash-error" style={{ marginTop: 10 }}>
                  {inviteError}
                </div>
              )}
            </div>
            <div className="dash-modal-foot">
              <button className="dash-btn" onClick={() => setInviteForm(null)}>
                Cancel
              </button>
              <button
                className="dash-btn"
                data-variant="primary"
                disabled={inviteSaving}
                onClick={() => void sendInvite()}
              >
                {inviteSaving && <Spinner />}
                {inviteSaving ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
