import { env } from '../../config/env';
import type { LLMProvider } from './types';
import { createGroqProvider } from './providers/groq';
import { createSiliconFlowProvider } from './providers/siliconflow';

export type LLMProviderId = 'groq' | 'siliconflow';

let cachedProvider: LLMProvider | null = null;

/**
 * Devuelve el proveedor LLM configurado (env.LLM_PROVIDER).
 * Por defecto "groq". Para SiliconFlow: LLM_PROVIDER=siliconflow, SILICONFLOW_API_KEY, SILICONFLOW_MODEL.
 */
export function getLLMProvider(): LLMProvider | null {
  if (cachedProvider) return cachedProvider;
  const id = (env.LLM_PROVIDER || 'groq').toLowerCase() as LLMProviderId;
  switch (id) {
    case 'groq':
      if (env.GROQ_API_KEY) {
        cachedProvider = createGroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL);
        return cachedProvider;
      }
      return null;
    case 'siliconflow':
      if (env.SILICONFLOW_API_KEY) {
        cachedProvider = createSiliconFlowProvider(
          env.SILICONFLOW_API_KEY,
          env.SILICONFLOW_MODEL
        );
        return cachedProvider;
      }
      return null;
    default:
      if (env.GROQ_API_KEY) {
        cachedProvider = createGroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL);
        return cachedProvider;
      }
      return null;
  }
}

/** Fuerza a recargar el proveedor en el próximo getLLMProvider (útil en tests). */
export function resetLLMProvider(): void {
  cachedProvider = null;
}
