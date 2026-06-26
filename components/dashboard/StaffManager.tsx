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

import { getBrowserClient } from '@/lib/supabase/client';
import { useDashboard } from '@/lib/dashboard/context';
import { staffService } from '@/lib/services';
import { permissionsForRole } from '@/lib/rbac/permissions';
import { dateTime } from '@/lib/dashboard/utils';
import type { StaffWithProfile } from '@/lib/services/staff.service';
import { STAFF_ROLES, type StaffRole } from '@/config/constants';

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
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRole, setExpandedRole] = useState<StaffRole | null>(null);

  async function load() {
    const client = getBrowserClient();
    const [list, logs] = await Promise.all([
      staffService.listStaff(client, restaurant.id),
      client
        .from('audit_logs')
        .select('id, action, entity_type, created_at')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    setStaff(list.error ? [] : list.data);
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

  return (
    <>
      <header className="dash-head">
        <div>
          <h1>Staff</h1>
          <div className="dash-head-sub">{staff.length} members</div>
        </div>
      </header>

      <div className="dash-body">
        <div className="dash-grid" data-cols="2">
          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Team</span>
            </div>
            <div className="dash-panel-body" data-flush="true">
              {loading ? (
                <div className="dash-empty">Loading…</div>
              ) : staff.length === 0 ? (
                <div className="dash-empty">No staff yet.</div>
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
                  <div className="dash-empty">No activity recorded.</div>
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
    </>
  );
}
