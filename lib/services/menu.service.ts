/**
 * Menu service.
 *
 * The catalog: categories, products, modifier groups and their options. Reads
 * are public (storefront) under RLS; product price is exposed but food cost is
 * NOT — cost lives in `product_costs` and is only reachable through the
 * financials service with a manager-tier client. Writes here are manager-tier,
 * except `setProductAvailability` which kitchen-tier may also call ("86"-ing an
 * item).
 */

import {
  type Client,
  type ServiceResult,
  ok,
  fail,
  toServiceError,
} from './_shared';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types';

export type Category = Tables<'categories'>;
export type Product = Tables<'products'>;
export type ProductImage = Tables<'product_images'>;
export type Modifier = Tables<'modifiers'>;
export type ModifierOption = Tables<'modifier_options'>;

/** A product with its images and the modifier groups that apply to it. */
export interface ProductWithModifiers extends Product {
  product_images: ProductImage[];
  modifiers: (Modifier & { modifier_options: ModifierOption[] })[];
}

/** A category with its in-stock-ordered products fully hydrated. */
export interface MenuCategory extends Category {
  products: ProductWithModifiers[];
}

/** Active categories for a restaurant, ordered for display. */
export async function getCategories(
  client: Client,
  restaurantId: string,
): Promise<ServiceResult<Category[]>> {
  const { data, error } = await client
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/**
 * The full menu: categories, each with products, each product with images and
 * modifier groups + options. One round-trip via nested selects. Note the
 * embedded relationship from the join table `product_modifiers` to `modifiers`.
 */
export async function getFullMenu(
  client: Client,
  restaurantId: string,
): Promise<ServiceResult<MenuCategory[]>> {
  const { data: categories, error: catError } = await client
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (catError) return fail(catError.message, toServiceError(catError).code);

  const { data: products, error: prodError } = await client
    .from('products')
    .select(
      `*,
       product_images (*),
       product_modifiers (
         modifiers (
           *,
           modifier_options (*)
         )
       )`,
    )
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true });

  if (prodError) return fail(prodError.message, toServiceError(prodError).code);

  // Reshape the join-table nesting into a flat modifiers array per product.
  type RawProduct = Product & {
    product_images: ProductImage[];
    product_modifiers: {
      modifiers: (Modifier & { modifier_options: ModifierOption[] }) | null;
    }[];
  };

  const shaped: ProductWithModifiers[] = (products as RawProduct[]).map((p) => ({
    ...p,
    product_images: p.product_images ?? [],
    modifiers: (p.product_modifiers ?? [])
      .map((pm) => pm.modifiers)
      .filter((m): m is Modifier & { modifier_options: ModifierOption[] } => m !== null)
      .map((m) => ({
        ...m,
        modifier_options: (m.modifier_options ?? []).sort(
          (a, b) => a.sort_order - b.sort_order,
        ),
      })),
  }));

  const byCategory = new Map<string, ProductWithModifiers[]>();
  for (const product of shaped) {
    const key = product.category_id ?? '__uncategorized__';
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(product);
    else byCategory.set(key, [product]);
  }

  const menu: MenuCategory[] = categories.map((category: Category) => ({
    ...category,
    products: byCategory.get(category.id) ?? [],
  }));

  return ok(menu);
}

/** A single product with images and modifiers (e.g. the product modal). */
export async function getProduct(
  client: Client,
  productId: string,
): Promise<ServiceResult<ProductWithModifiers>> {
  const { data, error } = await client
    .from('products')
    .select(
      `*,
       product_images (*),
       product_modifiers (
         modifiers (
           *,
           modifier_options (*)
         )
       )`,
    )
    .eq('id', productId)
    .single();

  if (error) return fail(error.message, toServiceError(error).code);

  type RawProduct = Product & {
    product_images: ProductImage[];
    product_modifiers: {
      modifiers: (Modifier & { modifier_options: ModifierOption[] }) | null;
    }[];
  };
  const raw = data as RawProduct;

  const shaped: ProductWithModifiers = {
    ...raw,
    product_images: raw.product_images ?? [],
    modifiers: (raw.product_modifiers ?? [])
      .map((pm) => pm.modifiers)
      .filter((m): m is Modifier & { modifier_options: ModifierOption[] } => m !== null)
      .map((m) => ({
        ...m,
        modifier_options: (m.modifier_options ?? []).sort(
          (a, b) => a.sort_order - b.sort_order,
        ),
      })),
  };

  return ok(shaped);
}

/**
 * Toggles a product's availability. Allowed for manager-tier AND kitchen-tier
 * under RLS — this is the "86" action. Sends only the one column so a kitchen
 * user (who cannot edit other fields) succeeds.
 */
export async function setProductAvailability(
  client: Client,
  productId: string,
  isAvailable: boolean,
): Promise<ServiceResult<Product>> {
  const { data, error } = await client
    .from('products')
    .update({ is_available: isAvailable })
    .eq('id', productId)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Creates a product (manager-tier). */
export async function createProduct(
  client: Client,
  input: TablesInsert<'products'>,
): Promise<ServiceResult<Product>> {
  const { data, error } = await client
    .from('products')
    .insert(input)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Updates a product's editable fields (manager-tier). */
export async function updateProduct(
  client: Client,
  productId: string,
  patch: TablesUpdate<'products'>,
): Promise<ServiceResult<Product>> {
  const { data, error } = await client
    .from('products')
    .update(patch)
    .eq('id', productId)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}
