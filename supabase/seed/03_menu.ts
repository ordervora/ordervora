/**
 * Seed 03 — menu.
 *
 * A realistic neighborhood-deli menu: categories, products (with calories,
 * protein, tags), a placeholder image per product, modifier GROUPS with their
 * options, and the product↔modifier links. Everything is scoped by
 * restaurant_id. The data is structured so the customer app, KDS, and checkout
 * all have meaningful content to render and price.
 *
 * Idempotent: the menu is cleared for this restaurant before reinsert so
 * re-running yields the same clean catalog rather than duplicates.
 */

import { type SeedClient, unwrap, logStep } from './_shared';

export interface SeededMenu {
  /** product name -> product id, for orders to reference. */
  productByName: Record<string, { id: string; price: number }>;
  /** option name -> option id, for order modifiers to reference. */
  optionByName: Record<string, { id: string; priceDelta: number }>;
}

interface ModifierGroupSpec {
  name: string;
  subtitle: string;
  minSelect: number;
  maxSelect: number | null;
  isRequired: boolean;
  options: { name: string; priceDelta: number }[];
}

interface ProductSpec {
  name: string;
  description: string;
  price: number;
  tag: string | null;
  calories: number;
  protein: number;
  cost: number;
  modifierGroups: string[]; // references group names
  imageColor: string; // for the generated placeholder image
}

interface CategorySpec {
  name: string;
  emoji: string;
  blurb: string;
  products: ProductSpec[];
}

// ---- Modifier groups (shared across products by name) ----------------------
const MODIFIER_GROUPS: ModifierGroupSpec[] = [
  {
    name: 'Bread',
    subtitle: 'Choose one',
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    options: [
      { name: 'Hero roll', priceDelta: 0 },
      { name: 'Whole wheat', priceDelta: 0 },
      { name: 'Ciabatta', priceDelta: 0.75 },
      { name: 'Gluten-free wrap', priceDelta: 1.5 },
    ],
  },
  {
    name: 'Add-ons',
    subtitle: 'Pile it on',
    minSelect: 0,
    maxSelect: 5,
    isRequired: false,
    options: [
      { name: 'Extra cheese', priceDelta: 1.25 },
      { name: 'Avocado', priceDelta: 2.0 },
      { name: 'Bacon', priceDelta: 2.5 },
      { name: 'Fried egg', priceDelta: 1.75 },
      { name: 'Extra patty', priceDelta: 3.5 },
    ],
  },
  {
    name: 'Remove',
    subtitle: 'Hold anything',
    minSelect: 0,
    maxSelect: null,
    isRequired: false,
    options: [
      { name: 'No onions', priceDelta: 0 },
      { name: 'No pickles', priceDelta: 0 },
      { name: 'No mayo', priceDelta: 0 },
      { name: 'No tomato', priceDelta: 0 },
    ],
  },
  {
    name: 'Make it a combo',
    subtitle: 'Add fries + a drink',
    minSelect: 0,
    maxSelect: 1,
    isRequired: false,
    options: [
      { name: 'Add combo', priceDelta: 4.5 },
    ],
  },
  {
    name: 'Temperature',
    subtitle: 'How would you like it',
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    options: [
      { name: 'Medium', priceDelta: 0 },
      { name: 'Medium well', priceDelta: 0 },
      { name: 'Well done', priceDelta: 0 },
    ],
  },
  {
    name: 'Milk',
    subtitle: 'Choose one',
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    options: [
      { name: 'Whole', priceDelta: 0 },
      { name: 'Oat', priceDelta: 0.65 },
      { name: 'Almond', priceDelta: 0.65 },
      { name: 'Skim', priceDelta: 0 },
    ],
  },
  {
    name: 'Size',
    subtitle: 'Choose one',
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    options: [
      { name: 'Small size', priceDelta: 0 },
      { name: 'Medium size', priceDelta: 0.75 },
      { name: 'Large size', priceDelta: 1.5 },
    ],
  },
];

// ---- Categories + products -------------------------------------------------
const CATEGORIES: CategorySpec[] = [
  {
    name: 'Breakfast',
    emoji: '🍳',
    blurb: 'Served until 11am',
    products: [
      {
        name: 'Bacon Egg & Cheese',
        description: 'Crispy bacon, two eggs, melted American cheese on a hero roll.',
        price: 6.5,
        tag: 'Best Seller',
        calories: 620,
        protein: 28,
        cost: 2.1,
        modifierGroups: ['Bread', 'Add-ons', 'Remove'],
        imageColor: 'F2A33C',
      },
      {
        name: 'Avocado Toast',
        description: 'Smashed avocado, chili flakes, lemon, sea salt on sourdough.',
        price: 7.25,
        tag: 'Vegan',
        calories: 410,
        protein: 11,
        cost: 2.4,
        modifierGroups: ['Add-ons'],
        imageColor: '3E7D54',
      },
      {
        name: 'Breakfast Burrito',
        description: 'Eggs, potato, cheddar, pico, and salsa verde in a warm flour tortilla.',
        price: 8.0,
        tag: null,
        calories: 720,
        protein: 26,
        cost: 2.8,
        modifierGroups: ['Add-ons', 'Remove'],
        imageColor: 'C8842E',
      },
    ],
  },
  {
    name: 'Sandwiches',
    emoji: '🥪',
    blurb: 'Made to order on fresh bread',
    products: [
      {
        name: 'Italian Combo',
        description: 'Salami, capicola, provolone, lettuce, tomato, oil & vinegar.',
        price: 9.5,
        tag: 'Best Seller',
        calories: 780,
        protein: 34,
        cost: 3.3,
        modifierGroups: ['Bread', 'Add-ons', 'Remove', 'Make it a combo'],
        imageColor: 'B3402F',
      },
      {
        name: 'Turkey Club',
        description: 'Roast turkey, bacon, lettuce, tomato, mayo, triple-stacked.',
        price: 9.75,
        tag: null,
        calories: 690,
        protein: 38,
        cost: 3.5,
        modifierGroups: ['Bread', 'Add-ons', 'Remove', 'Make it a combo'],
        imageColor: 'C8842E',
      },
      {
        name: 'Caprese Press',
        description: 'Fresh mozzarella, tomato, basil, balsamic glaze on ciabatta.',
        price: 8.75,
        tag: 'Vegetarian',
        calories: 540,
        protein: 22,
        cost: 2.9,
        modifierGroups: ['Bread', 'Add-ons', 'Remove'],
        imageColor: '3E7D54',
      },
    ],
  },
  {
    name: 'Burgers',
    emoji: '🍔',
    blurb: 'Smashed, never frozen',
    products: [
      {
        name: 'Classic Smash',
        description: 'Single smash patty, American cheese, pickles, house sauce.',
        price: 8.5,
        tag: 'Best Seller',
        calories: 650,
        protein: 31,
        cost: 2.7,
        modifierGroups: ['Temperature', 'Add-ons', 'Remove', 'Make it a combo'],
        imageColor: 'B3402F',
      },
      {
        name: 'Double Stack',
        description: 'Two smash patties, double cheese, grilled onions, house sauce.',
        price: 11.5,
        tag: null,
        calories: 940,
        protein: 48,
        cost: 4.1,
        modifierGroups: ['Temperature', 'Add-ons', 'Remove', 'Make it a combo'],
        imageColor: '1A1714',
      },
      {
        name: 'Mushroom Swiss',
        description: 'Smash patty, sautéed mushrooms, Swiss, garlic aioli.',
        price: 10.25,
        tag: null,
        calories: 720,
        protein: 35,
        cost: 3.4,
        modifierGroups: ['Temperature', 'Add-ons', 'Remove'],
        imageColor: '6F655C',
      },
    ],
  },
  {
    name: 'Sides',
    emoji: '🍟',
    blurb: 'Perfect with anything',
    products: [
      {
        name: 'Hand-Cut Fries',
        description: 'Skin-on fries, sea salt, fried twice for crunch.',
        price: 3.75,
        tag: null,
        calories: 380,
        protein: 5,
        cost: 0.9,
        modifierGroups: ['Size'],
        imageColor: 'F2A33C',
      },
      {
        name: 'Mac & Cheese',
        description: 'Three-cheese baked mac with a toasted breadcrumb top.',
        price: 4.5,
        tag: 'Vegetarian',
        calories: 520,
        protein: 18,
        cost: 1.4,
        modifierGroups: ['Size'],
        imageColor: 'C8842E',
      },
    ],
  },
  {
    name: 'Drinks',
    emoji: '🥤',
    blurb: 'Cold-pressed & brewed in-house',
    products: [
      {
        name: 'Iced Latte',
        description: 'Double shot over ice with your choice of milk.',
        price: 4.25,
        tag: null,
        calories: 120,
        protein: 6,
        cost: 0.8,
        modifierGroups: ['Milk', 'Size'],
        imageColor: '6F655C',
      },
      {
        name: 'House Lemonade',
        description: 'Fresh-squeezed, lightly sweetened, real lemons.',
        price: 3.5,
        tag: 'Vegan',
        calories: 150,
        protein: 0,
        cost: 0.6,
        modifierGroups: ['Size'],
        imageColor: 'F2A33C',
      },
    ],
  },
];

/** A lightweight inline SVG data URL so products have an image with no upload. */
function placeholderImage(label: string, hex: string): string {
  const initials = label
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">` +
    `<rect width="320" height="320" fill="#${hex}"/>` +
    `<text x="50%" y="52%" font-family="sans-serif" font-size="120" font-weight="800" ` +
    `fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function seedMenu(
  client: SeedClient,
  restaurantId: string,
): Promise<SeededMenu> {
  logStep('Menu (categories, products, modifiers)');

  // Idempotent reset of this restaurant's catalog. Cascades clear children.
  await client.from('categories').delete().eq('restaurant_id', restaurantId);
  await client.from('modifiers').delete().eq('restaurant_id', restaurantId);

  // 1. Modifier groups + options.
  const groupIdByName: Record<string, string> = {};
  const optionByName: Record<string, { id: string; priceDelta: number }> = {};

  for (let gi = 0; gi < MODIFIER_GROUPS.length; gi += 1) {
    const group = MODIFIER_GROUPS[gi]!;
    const groupRow = unwrap(
      await client
        .from('modifiers')
        .insert({
          restaurant_id: restaurantId,
          name: group.name,
          subtitle: group.subtitle,
          min_select: group.minSelect,
          max_select: group.maxSelect,
          is_required: group.isRequired,
          sort_order: gi,
        })
        .select('id')
        .single(),
    );
    groupIdByName[group.name] = groupRow.id;

    for (let oi = 0; oi < group.options.length; oi += 1) {
      const option = group.options[oi]!;
      const optionRow = unwrap(
        await client
          .from('modifier_options')
          .insert({
            restaurant_id: restaurantId,
            modifier_id: groupRow.id,
            name: option.name,
            price_delta: option.priceDelta,
            is_available: true,
            sort_order: oi,
          })
          .select('id')
          .single(),
      );
      // Option names are unique within this demo menu.
      optionByName[option.name] = {
        id: optionRow.id,
        priceDelta: option.priceDelta,
      };
    }
  }

  // 2. Categories + products + images + product↔modifier links.
  const productByName: Record<string, { id: string; price: number }> = {};

  for (let ci = 0; ci < CATEGORIES.length; ci += 1) {
    const category = CATEGORIES[ci]!;
    const categoryRow = unwrap(
      await client
        .from('categories')
        .insert({
          restaurant_id: restaurantId,
          name: category.name,
          emoji: category.emoji,
          blurb: category.blurb,
          sort_order: ci,
          is_active: true,
        })
        .select('id')
        .single(),
    );

    for (let pi = 0; pi < category.products.length; pi += 1) {
      const product = category.products[pi]!;
      const productRow = unwrap(
        await client
          .from('products')
          .insert({
            restaurant_id: restaurantId,
            category_id: categoryRow.id,
            name: product.name,
            description: product.description,
            price: product.price,
            tag: product.tag,
            calories: product.calories,
            protein: product.protein,
            is_available: true,
            stock: null,
            sort_order: pi,
          })
          .select('id')
          .single(),
      );
      productByName[product.name] = { id: productRow.id, price: product.price };

      // Food cost (manager-tier; separated from public products).
      unwrap(
        await client
          .from('product_costs')
          .insert({
            product_id: productRow.id,
            restaurant_id: restaurantId,
            cost_price: product.cost,
            supplier: 'Demo Provisions Co.',
          })
          .select('product_id')
          .single(),
      );

      // Image (inline SVG data URL — no external asset needed).
      unwrap(
        await client
          .from('product_images')
          .insert({
            restaurant_id: restaurantId,
            product_id: productRow.id,
            url: placeholderImage(product.name, product.imageColor),
            alt: product.name,
            is_primary: true,
            sort_order: 0,
          })
          .select('id')
          .single(),
      );

      // Link applicable modifier groups.
      for (let mi = 0; mi < product.modifierGroups.length; mi += 1) {
        const groupName = product.modifierGroups[mi]!;
        const groupId = groupIdByName[groupName];
        if (!groupId) continue;
        unwrap(
          await client
            .from('product_modifiers')
            .insert({
              restaurant_id: restaurantId,
              product_id: productRow.id,
              modifier_id: groupId,
              sort_order: mi,
            })
            .select('id')
            .single(),
        );
      }
    }
  }

  logStep(
    `  → ${CATEGORIES.length} categories, ${Object.keys(productByName).length} products, ${Object.keys(optionByName).length} options`,
  );

  return { productByName, optionByName };
}
