/**
 * KDS service — kitchen display data.
 *
 * REVENUE FIREWALL (enforced here at the code layer):
 *   This module reads EXCLUSIVELY from the money-free `kds_tickets*` views and
 *   the operational `products` table (for the "86" toggle). It must never import
 *   the financials service, the payment service, or any `*_financials` /
 *   `payments` table. There is no path from this file to revenue, tips, taxes,
 *   discounts, or totals — by construction, mirroring the database RLS wall.
 *
 *   The views also enforce this at the database layer (kitchen-tier has no RLS
 *   access to financial tables), so this is defense in depth: a money import
 *   here would be both a lint/review red flag and still fail at the database.
 */

import {
  type Client,
  type ServiceResult,
  ok,
  fail,
  toServiceError,
} from './_shared';
import { setProductAvailability } from './menu.service';
import type { Views } from '@/types/database.types';

export type KdsTicket = Views<'kds_tickets'>;
export type KdsTicketItem = Views<'kds_ticket_items'>;
export type KdsTicketModifier = Views<'kds_ticket_modifiers'>;

/** A kitchen ticket with its items and each item's modifiers (no prices). */
export interface KdsTicketDetail extends KdsTicket {
  items: (KdsTicketItem & { modifiers: KdsTicketModifier[] })[];
}

/**
 * Loads the live ticket board for a restaurant: every active ticket with its
 * items and modifiers, oldest first (kitchen works the oldest ticket next).
 * Three view reads, assembled in memory — no order/financial tables touched.
 */
export async function getActiveTickets(
  client: Client,
  restaurantId: string,
): Promise<ServiceResult<KdsTicketDetail[]>> {
  const { data: tickets, error: ticketError } = await client
    .from('kds_tickets')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('placed_at', { ascending: true });

  if (ticketError) return fail(ticketError.message, toServiceError(ticketError).code);

  const ticketRows = (tickets ?? []) as KdsTicket[];
  const orderIds = ticketRows
    .map((t) => t.id)
    .filter((id): id is string => id !== null);

  if (orderIds.length === 0) return ok([]);

  const { data: items, error: itemError } = await client
    .from('kds_ticket_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .in('order_id', orderIds);

  if (itemError) return fail(itemError.message, toServiceError(itemError).code);

  const itemRows = (items ?? []) as KdsTicketItem[];
  const itemIds = itemRows
    .map((i) => i.id)
    .filter((id): id is string => id !== null);

  let modifierRows: KdsTicketModifier[] = [];
  if (itemIds.length > 0) {
    const { data: modifiers, error: modError } = await client
      .from('kds_ticket_modifiers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('order_item_id', itemIds);

    if (modError) return fail(modError.message, toServiceError(modError).code);
    modifierRows = (modifiers ?? []) as KdsTicketModifier[];
  }

  // Group modifiers under their item.
  const modsByItem = new Map<string, KdsTicketModifier[]>();
  for (const mod of modifierRows) {
    if (!mod.order_item_id) continue;
    const bucket = modsByItem.get(mod.order_item_id);
    if (bucket) bucket.push(mod);
    else modsByItem.set(mod.order_item_id, [mod]);
  }

  // Group items under their order.
  const itemsByOrder = new Map<
    string,
    (KdsTicketItem & { modifiers: KdsTicketModifier[] })[]
  >();
  for (const item of itemRows) {
    if (!item.order_id) continue;
    const withMods = {
      ...item,
      modifiers: item.id ? modsByItem.get(item.id) ?? [] : [],
    };
    const bucket = itemsByOrder.get(item.order_id);
    if (bucket) bucket.push(withMods);
    else itemsByOrder.set(item.order_id, [withMods]);
  }

  const details: KdsTicketDetail[] = ticketRows.map((ticket) => ({
    ...ticket,
    items: ticket.id ? itemsByOrder.get(ticket.id) ?? [] : [],
  }));

  return ok(details);
}

/**
 * "86" an item — mark it unavailable (or available again) from the kitchen.
 * Delegates to the menu service's single-column availability update, which
 * kitchen-tier is permitted to call under RLS. No financial access involved.
 */
export async function eightySixProduct(
  client: Client,
  productId: string,
  unavailable = true,
): Promise<ServiceResult<{ id: string; is_available: boolean }>> {
  const result = await setProductAvailability(client, productId, !unavailable);
  if (result.error) return result;
  return ok({ id: result.data.id, is_available: result.data.is_available });
}
