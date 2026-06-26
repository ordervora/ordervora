/**
 * Customer service.
 *
 * Per-restaurant diner records and their saved addresses. A customer reads and
 * edits only their own row (RLS); manager-tier staff may read and manage all
 * customers of their restaurant. Financial counters (lifetime_value) are
 * manager-tier — a customer client sees their own row but the dashboard uses
 * these for the customer table.
 */

import {
  type Client,
  type ServiceResult,
  ok,
  fail,
  toServiceError,
  isNotFound,
} from './_shared';
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@/types/database.types';

export type Customer = Tables<'customers'>;
export type CustomerAddress = Tables<'customer_addresses'>;

/** Resolves the customer row owned by the signed-in user at a restaurant. */
export async function getCurrentCustomer(
  client: Client,
  restaurantId: string,
  authUserId: string,
): Promise<ServiceResult<Customer | null>> {
  const { data, error } = await client
    .from('customers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Loads a customer by id (manager-tier, or the customer themselves). */
export async function getCustomerById(
  client: Client,
  customerId: string,
): Promise<ServiceResult<Customer>> {
  const { data, error } = await client
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  if (error) {
    if (isNotFound(error)) return fail('Customer not found.', error.code);
    return fail(error.message, toServiceError(error).code);
  }
  return ok(data);
}

/** Lists customers for a restaurant (manager-tier), most recent first. */
export async function listCustomers(
  client: Client,
  restaurantId: string,
  limit = 200,
): Promise<ServiceResult<Customer[]>> {
  const { data, error } = await client
    .from('customers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('last_order_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/**
 * Creates a customer record. Used when a signed-in user first interacts with a
 * restaurant, or by staff adding a walk-in. RLS requires the new row to belong
 * to the caller (as the auth user) or the caller to be manager-tier.
 */
export async function createCustomer(
  client: Client,
  input: TablesInsert<'customers'>,
): Promise<ServiceResult<Customer>> {
  const { data, error } = await client
    .from('customers')
    .insert(input)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Updates a customer's own editable profile fields. */
export async function updateCustomer(
  client: Client,
  customerId: string,
  patch: TablesUpdate<'customers'>,
): Promise<ServiceResult<Customer>> {
  const { data, error } = await client
    .from('customers')
    .update(patch)
    .eq('id', customerId)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Lists a customer's saved addresses, default first. */
export async function listAddresses(
  client: Client,
  customerId: string,
): Promise<ServiceResult<CustomerAddress[]>> {
  const { data, error } = await client
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Adds a saved address for a customer. */
export async function addAddress(
  client: Client,
  input: TablesInsert<'customer_addresses'>,
): Promise<ServiceResult<CustomerAddress>> {
  const { data, error } = await client
    .from('customer_addresses')
    .insert(input)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Removes a saved address. */
export async function deleteAddress(
  client: Client,
  addressId: string,
): Promise<ServiceResult<true>> {
  const { error } = await client
    .from('customer_addresses')
    .delete()
    .eq('id', addressId);

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(true);
}
