/** Mensaje para chat completion (compatible OpenAI/SiliconFlow/Groq). */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface LLMCompletionResult {
  content: string;
  usage?: LLMCompletionUsage;
}

export interface LLMCompletionOptions {
  model?: string;
  temperature?: number;
  /** Override de API key (ej. desde el body en admin). */
  apiKey?: string;
}

/**
 * Proveedor de LLM unificado: Groq, SiliconFlow u otros compatibles.
 * El factory devuelve el proveedor configurado según env (LLM_PROVIDER + keys/models).
 */
export interface LLMProvider {
  readonly name: string;
  createCompletion(
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult>;
}
