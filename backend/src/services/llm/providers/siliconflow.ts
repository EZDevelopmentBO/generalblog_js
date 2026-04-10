import type { ChatMessage, LLMCompletionOptions, LLMCompletionResult, LLMProvider } from '../types';

const SILICONFLOW_BASE = 'https://api.siliconflow.com/v1';

export function createSiliconFlowProvider(apiKey: string, defaultModel: string): LLMProvider {
  return {
    name: 'siliconflow',
    async createCompletion(
      messages: ChatMessage[],
      options?: LLMCompletionOptions
    ): Promise<LLMCompletionResult> {
      const key = options?.apiKey ?? apiKey;
      if (!key) throw new Error('SiliconFlow API key not configured');
      const model = options?.model ?? defaultModel;
      const res = await fetch(`${SILICONFLOW_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: options?.temperature ?? 0.5,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`SiliconFlow API error ${res.status}: ${err.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content?.trim() ?? '';
      const usage = data.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens ?? 0,
            completion_tokens: data.usage.completion_tokens ?? 0,
          }
        : undefined;
      return { content, usage };
    },
  };
}
