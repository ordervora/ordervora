/**
 * AI provider factory.
 *
 * Selects the active provider from `AI_PROVIDER` (default "anthropic").
 * Adding OpenAI or Gemini later means adding a class + a case here — call
 * sites (ai-menu-import) only ever depend on the `AIProvider` interface.
 */

import type { AIProvider } from './types.ts';
import { AnthropicProvider } from './anthropic.ts';

export type { AIProvider, ExtractedMenu, ExtractedMenuCategory, ExtractedMenuItem, MenuExtractionInput } from './types.ts';

export function getAIProvider(): AIProvider {
  const providerName = Deno.env.get('AI_PROVIDER') ?? 'anthropic';

  switch (providerName) {
    case 'anthropic': {
      const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
      if (!apiKey) {
        throw new Error('Missing ANTHROPIC_API_KEY environment variable.');
      }
      return new AnthropicProvider(apiKey);
    }
    case 'openai':
      throw new Error('AI_PROVIDER=openai is not implemented yet.');
    case 'gemini':
      throw new Error('AI_PROVIDER=gemini is not implemented yet.');
    default:
      throw new Error(`Unknown AI_PROVIDER: ${providerName}`);
  }
}
