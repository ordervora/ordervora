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

import type { AIProvider, ExtractedMenu, MenuExtractionInput } from './types.ts';

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

const SYSTEM_PROMPT = `You extract structured menu data from raw restaurant menu text (copied from a website, PDF, or document). Identify the restaurant name if present, group items into the categories implied by the source text (e.g. "Appetizers", "Entrees", "Drinks"), and extract each item's name, description, and price as a plain number (no currency symbol). If a field isn't present in the source, use null. Do not invent items, prices, or categories that aren't in the source text.`;

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
      system: SYSTEM_PROMPT,
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
}
