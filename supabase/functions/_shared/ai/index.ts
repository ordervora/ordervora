/**
 * AI provider factory.
 *
 * Selects the active provider from `AI_PROVIDER` (default "anthropic").
 * Adding OpenAI or Gemini later means adding a class + a case here — call
 * sites (ai-menu-import) only ever depend on the `AIProvider` interface.
 */

import type { AIProvider } from './types.ts';
import { AnthropicProvider } from './anthropic.ts';

export type {
  AIProvider,
  ExtractedMenu,
  ExtractedMenuCategory,
  ExtractedMenuItem,
  MenuExtractionInput,
  SiteContent,
  WebsiteContentInput,
} from './types.ts';

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      'AI features are not configured. ' +
      'Set the ANTHROPIC_API_KEY environment variable in your Supabase project ' +
      '(Dashboard → Settings → Edge Functions → Secrets) to enable AI Menu Import ' +
      'and AI Website Builder.',
    );
    this.name = 'AiNotConfiguredError';
  }
}

export function getAIProvider(): AIProvider {
  const providerName = Deno.env.get('AI_PROVIDER') ?? 'anthropic';

  switch (providerName) {
    case 'anthropic': {
      const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
      if (!apiKey) throw new AiNotConfiguredError();
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
