import Groq from 'groq-sdk';
import type { ChatMessage, LLMCompletionOptions, LLMCompletionResult, LLMProvider } from '../types';

export function createGroqProvider(apiKey: string, defaultModel: string): LLMProvider {
  return {
    name: 'groq',
    async createCompletion(
      messages: ChatMessage[],
      options?: LLMCompletionOptions
    ): Promise<LLMCompletionResult> {
      const key = options?.apiKey ?? apiKey;
      if (!key) throw new Error('Groq API key not configured');
      const groq = new Groq({ apiKey: key });
      const completion = await groq.chat.completions.create({
        model: options?.model ?? defaultModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.5,
      });
      const content = completion.choices[0]?.message?.content?.trim() ?? '';
      const usage = completion.usage
        ? {
            prompt_tokens: completion.usage.prompt_tokens ?? 0,
            completion_tokens: completion.usage.completion_tokens ?? 0,
          }
        : undefined;
      return { content, usage };
    },
  };
}
