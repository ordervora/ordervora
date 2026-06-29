/**
 * AI menu import — applies an AI-extracted menu (reviewed/edited by the
 * owner first) to the live catalog. Manager-tier, writing through the same
 * RLS-bound client `createProduct` already uses — no service-role path
 * needed since categories/products already grant manager-tier inserts.
 */

import { type Client, type ServiceResult, ok, fail, toServiceError } from './_shared';

export interface ExtractedMenuItem {
  name: string;
  description: string | null;
  price: number;
}

export interface ExtractedMenuCategory {
  name: string;
  items: ExtractedMenuItem[];
}

export interface ApplyImportSummary {
  categoriesCreated: number;
  productsCreated: number;
}

/** Inserts AI-extracted categories and products for a restaurant. */
export async function applyExtractedMenu(
  client: Client,
  restaurantId: string,
  categories: ExtractedMenuCategory[],
): Promise<ServiceResult<ApplyImportSummary>> {
  let categoriesCreated = 0;
  let productsCreated = 0;

  for (const category of categories) {
    const { data: categoryRow, error: categoryError } = await client
      .from('categories')
      .insert({
        restaurant_id: restaurantId,
        name: category.name,
        sort_order: categoriesCreated,
      })
      .select('id')
      .single();

    if (categoryError) {
      return fail(categoryError.message, toServiceError(categoryError).code);
    }
    categoriesCreated += 1;

    if (category.items.length === 0) continue;

    const { error: productsError } = await client.from('products').insert(
      category.items.map((item, index) => ({
        restaurant_id: restaurantId,
        category_id: categoryRow.id,
        name: item.name,
        description: item.description,
        price: item.price,
        sort_order: index,
      })),
    );

    if (productsError) {
      return fail(productsError.message, toServiceError(productsError).code);
    }
    productsCreated += category.items.length;
  }

  return ok({ categoriesCreated, productsCreated });
}
