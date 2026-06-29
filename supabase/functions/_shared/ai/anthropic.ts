/**
 * Anthropic implementation of `AIProvider`.
 *
 * Uses `messages.parse()` with a Zod output schema (`output_config.format`)
 * so the model is constrained to return exactly the menu shape we need —
 * no free-text parsing, no prefill (removed on current models).
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import type {
  AIProvider,
  ExtractedMenu,
  MenuExtractionInput,
  SiteContent,
  WebsiteContentInput,
} from './types.ts';

const MODEL = 'claude-opus-4-8';

const MenuSchema = z.object({
  restaurant_name: z.string().nullable(),
  categories: z.array(
    z.object({
      name: z.string(),
      items: z.array(
        z.object({
          name: z.string(),
          description: z.string().nullable(),
          price: z.number(),
        }),
      ),
    }),
  ),
});

const MENU_SYSTEM_PROMPT = `You extract structured menu data from raw restaurant menu text (copied from a website, PDF, or document). Identify the restaurant name if present, group items into the categories implied by the source text (e.g. "Appetizers", "Entrees", "Drinks"), and extract each item's name, description, and price as a plain number (no currency symbol). If a field isn't present in the source, use null. Do not invent items, prices, or categories that aren't in the source text.`;

const SiteContentSchema = z.object({
  tagline: z.string(),
  about_heading: z.string(),
  about_text: z.string(),
});

const SITE_CONTENT_SYSTEM_PROMPT = `You write short, warm marketing copy for a restaurant's ordering website, grounded only in the restaurant's real name, type, and a sample of its actual menu items — never invent dishes, awards, history, or claims that aren't implied by what you're given. Return:
- tagline: a single punchy line (max ~10 words) for the hero section, under the restaurant's name.
- about_heading: a short heading for the About section (e.g. "Our story", "Why we cook").
- about_text: 2-3 sentences (40-70 words) introducing the restaurant to a first-time customer in a friendly, specific voice — reference the cuisine/menu style, not generic filler.`;

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async extractMenu(input: MenuExtractionInput): Promise<ExtractedMenu> {
    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: MENU_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: input.sourceText }],
      output_config: {
        format: zodOutputFormat(MenuSchema),
      },
    });

    if (!response.parsed_output) {
      throw new Error('The AI could not extract a menu from this text.');
    }

    return response.parsed_output;
  }

  async generateWebsiteContent(input: WebsiteContentInput): Promise<SiteContent> {
    const prompt = `Restaurant name: ${input.restaurantName}
Restaurant type: ${input.restaurantType}
Sample menu items: ${input.menuHighlights.length > 0 ? input.menuHighlights.join(', ') : '(no menu items yet)'}`;

    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: SITE_CONTENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      output_config: {
        format: zodOutputFormat(SiteContentSchema),
      },
    });

    if (!response.parsed_output) {
      throw new Error('The AI could not generate website content.');
    }

    return response.parsed_output;
  }
}
