/**
 * Provider-agnostic AI types for Edge Functions.
 *
 * `AIProvider` is the seam: every provider (Anthropic today, OpenAI/Gemini
 * later) implements this interface, so callers (the ai-menu-import function)
 * never reference a specific vendor SDK.
 */

export interface ExtractedMenuItem {
  name: string;
  description: string | null;
  price: number;
}

export interface ExtractedMenuCategory {
  name: string;
  items: ExtractedMenuItem[];
}

export interface ExtractedMenu {
  restaurant_name: string | null;
  categories: ExtractedMenuCategory[];
}

export interface MenuExtractionInput {
  /** Raw menu text/markdown pasted by the owner (copied from a site, PDF, or doc). */
  sourceText: string;
}

export interface SiteContent {
  tagline: string;
  about_heading: string;
  about_text: string;
}

export interface WebsiteContentInput {
  restaurantName: string;
  restaurantType: string;
  /** A handful of real category/item names already on the menu, for grounding. */
  menuHighlights: string[];
}

export interface AIProvider {
  readonly name: string;
  extractMenu(input: MenuExtractionInput): Promise<ExtractedMenu>;
  generateWebsiteContent(input: WebsiteContentInput): Promise<SiteContent>;
}
