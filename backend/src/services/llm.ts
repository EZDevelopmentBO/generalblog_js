import { env } from '../config/env';
import type { LLMGeneratedPost, BlogCategory } from '../types';
import { getOrderedCategorySlugs, isValidCategory } from './blogCategory';
import { getLLMProvider } from './llm/factory';

function allowedCategoriesForPrompt(): string {
  const s = getOrderedCategorySlugs();
  const list = s.length ? s : ['analysis', 'crypto', 'metals', 'stocks', 'forex', 'bots', 'indicadores'];
  return list.join('", "');
}

function systemPromptEs(): string {
  const ALLOWED_CATEGORIES_STR = allowedCategoriesForPrompt();
  return `Eres un redactor especializado en mercados financieros para un blog de traders. El blog cubre: criptomonedas, metales preciosos, acciones, forex y análisis general.

IMPORTANTE: El artículo debe estar escrito íntegramente en español. El cuerpo del artículo (content) debe tener entre 2000 y 3000 palabras. No devuelvas artículos más cortos.

Debes devolver ÚNICAMENTE un objeto JSON válido, sin texto antes ni después. No uses saltos de línea literales dentro de los strings; usa \\n para nuevas líneas.

Claves exactas del JSON (todas obligatorias salvo related_title y related_year):
- title (string): título del artículo en español
- content (string): cuerpo del artículo en HTML (párrafos <p>, listas <ul><li>, negritas <strong>, etc.). Sin <script>. Entre 2000 y 3000 palabras. Usa \\n solo si hace falta dentro del string.
- excerpt (string): resumen corto en 1-2 frases en español para listados y meta description
- meta_title (string): título para SEO en español (máx. 60 caracteres)
- meta_description (string): descripción para SEO en español (máx. 160 caracteres)
- meta_keywords (string): palabras clave en español separadas por comas
- category (string): una de: "${ALLOWED_CATEGORIES_STR}"
- related_title (string, opcional): si el artículo está ligado a un activo o instrumento concreto
- related_year (string, opcional): si aplica año de referencia
- conclusion (string): conclusión del artículo en HTML (párrafos <p>, resumen de puntos clave y/o recomendaciones para el trader). Entre 100 y 300 palabras.

El contenido debe ser útil para traders: datos, análisis técnico o fundamental, noticias de mercado, sin dar consejos de inversión personales.`;
}

function systemPromptEn(): string {
  const ALLOWED_CATEGORIES_STR = allowedCategoriesForPrompt();
  return `LANGUAGE RULE: You must write the ENTIRE article in ENGLISH only. Do not use Spanish or any other language. Every field (title, content, excerpt, meta_title, meta_description, meta_keywords) must be in English.

You are a writer specialized in financial markets for a traders' blog. The blog covers: cryptocurrencies, precious metals, stocks, forex and general analysis.

The article body (content) must be between 2000 and 3000 words. Do not return shorter articles.

You must return ONLY a valid JSON object, with no text before or after. Do not use literal newlines inside strings; use \\n for line breaks.

Exact keys of the JSON (all required except related_title and related_year):
- title (string): article title in English only
- content (string): article body in HTML (<p>, <ul><li>, <strong>, etc.), in English only. No <script>. Between 2000 and 3000 words. Use \\n only if needed inside the string.
- excerpt (string): short summary in 1-2 sentences in English for listings and meta description
- meta_title (string): title for SEO in English (max 60 chars)
- meta_description (string): description for SEO in English (max 160 chars)
- meta_keywords (string): comma-separated keywords in English
- category (string): one of: "${ALLOWED_CATEGORIES_STR}"
- related_title (string, optional): if the article is tied to a specific asset or instrument
- related_year (string, optional): reference year if applicable
- conclusion (string): conclusion of the article in HTML (<p> tags, summary of key points and/or recommendations for the trader). Between 100 and 300 words.

Content must be useful for traders: data, technical or fundamental analysis, market news, without giving personal investment advice.`;
}

/** Returns the last non-whitespace character before index, or null. */
function lastNonWhitespace(str: string, beforeIndex: number): string | null {
  for (let j = beforeIndex - 1; j >= 0; j--) {
    const ch = str[j];
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue;
    return ch;
  }
  return null;
}

function sanitizeJsonString(str: string): string {
  let result = '';
  let inString = false;
  let escape = false;
  let quote = '"';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escape) {
      result += c;
      escape = false;
      continue;
    }
    if (c === '\\') {
      result += c;
      escape = true;
      continue;
    }
    if (inString) {
      if (c === quote) {
        inString = false;
        result += c;
        continue;
      }
      if (c === '\n') {
        result += '\\n';
        continue;
      }
      if (c === '\r') {
        result += '\\r';
        continue;
      }
      if (c === '\t') {
        result += '\\t';
        continue;
      }
      // Cualquier otro carácter de control (ASCII 0-31) escapar para JSON válido
      if (c.charCodeAt(0) < 32) {
        result += '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
        continue;
      }
      result += c;
      continue;
    }
    const prev = lastNonWhitespace(str, i);
    const isOpeningQuote =
      (c === '"' || c === "'") && (prev === ':' || prev === ',' || prev === '[' || prev === '{');
    if (isOpeningQuote) {
      inString = true;
      quote = c;
      result += c;
      continue;
    }
    result += c;
  }
  return result;
}

function extractFirstJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) return text;
  let depth = 0;
  let inString = false;
  let quote = '"';
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (inString) {
      if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

export interface GenerateResult {
  post: LLMGeneratedPost;
  prompt_sent?: { system: string; user: string };
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export async function generatePostWithLLM(
  topic: string,
  language: 'es' | 'en',
  apiKey?: string
): Promise<GenerateResult> {
  const provider = getLLMProvider();
  if (!provider) {
    throw new Error('LLM no configurado: define GROQ_API_KEY o SILICONFLOW_API_KEY y LLM_PROVIDER.');
  }
  const systemPrompt = language === 'es' ? systemPromptEs() : systemPromptEn();
  const userPrompt =
    language === 'es'
      ? `Escribe un artículo de entre 2000 y 3000 palabras para el blog de traders, íntegramente en español, sobre: ${topic}`
      : `Write a blog article of 2000 to 3000 words for traders. The article must be 100% in English (no Spanish). Topic: ${topic}`;

  const result = await provider.createCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.5, apiKey: apiKey ?? undefined }
  );

  let raw = result.content ?? '';
  // Quitar envoltura markdown ```json ... ``` si existe
  raw = raw.replace(/^\s*```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  const jsonStr = extractFirstJson(raw);
  const sanitized = sanitizeJsonString(jsonStr);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(sanitized) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`LLM returned invalid JSON: ${(e as Error).message}. Raw: ${raw.slice(0, 500)}`);
  }

  const category = String(data.category ?? 'analysis').toLowerCase();
  if (!isValidCategory(category)) {
    throw new Error(`Invalid category from LLM: ${category}`);
  }

  const post: LLMGeneratedPost = {
    title: String(data.title ?? ''),
    content: String(data.content ?? ''),
    excerpt: String(data.excerpt ?? ''),
    meta_title: String(data.meta_title ?? data.title ?? ''),
    meta_description: String(data.meta_description ?? data.excerpt ?? ''),
    meta_keywords: String(data.meta_keywords ?? ''),
    category: category as BlogCategory,
    related_title: data.related_title != null ? String(data.related_title) : null,
    related_year: data.related_year != null ? String(data.related_year) : null,
    conclusion: data.conclusion != null ? String(data.conclusion) : null,
  };

  if (!post.title || !post.content) {
    throw new Error('LLM response missing title or content');
  }

  const usage = result.usage;

  return {
    post,
    prompt_sent: { system: systemPrompt, user: userPrompt },
    usage,
  };
}

export interface SignalAnalysisInput {
  symbol: string;
  action: string;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  timeframe: string;
  executedAt: string;
}

export interface SignalAnalysisResult {
  analysis: string;
  excerpt: string;
}

const SIGNAL_ANALYSIS_SYSTEM_ES = `Eres un experto en trading y finanzas que escribe análisis para un blog de traders. Te pasan las últimas velas OHLC (y volumen si está disponible) de un par y una señal de trading (dirección, entrada, SL, TP). Tu tarea es escribir un análisis en español de entre 100 y 200 palabras (mínimo 100, máximo 200) que:

1) ACTÚA COMO EXPERTO: Usa lenguaje técnico apropiado (soporte/resistencia, momentum, volumen, aperturas/cierres, tendencia) y da una lectura profesional del mercado.
2) PAR Y TIMEFRAME: Incluye de forma explícita y relevante el par (símbolo) y el timeframe en tu análisis; son datos clave para el lector.
3) ANÁLISIS BASADO EN DATOS: Interpreta el precio (open, high, low, close) y, si se proporciona volumen, comenta qué indica el volumen sobre la fuerza del movimiento y la confirmación de la señal.
4) PERSPECTIVA A FUTURO: Incluye una valoración de hacia dónde puede ir el precio y por qué la configuración actual respalda esa expectativa.
5) APOYA LA SEÑAL: Da la razón a la señal que generamos: explica por qué la dirección (compra/venta), la entrada y los niveles SL/TP tienen sentido según el contexto técnico. No contradigas la señal; justifícala con el análisis.
6) IDIOMA: ÚNICAMENTE español. Texto ORIGINAL en español, no traducción.
7) SOLO ANÁLISIS: No incluyas en tu salida los datos numéricos de la señal (entrada, SL, TP); esos se mostrarán aparte con encabezados. Tu salida es solo el texto de análisis.

Devuelve ÚNICAMENTE un objeto JSON válido con estas claves:
- analysis (string): análisis en HTML (párrafos <p>). Sin <script>. Entre 100 y 200 palabras (mínimo 100, máximo 200). Debe mencionar el par y el timeframe.
- excerpt (string): 1 o 2 frases para resumen/listado (máx. 160 caracteres).`;

const SIGNAL_ANALYSIS_SYSTEM_EN = `You are an expert in trading and finance writing analysis for a traders' blog. You receive the last OHLC candles (and volume when available) of a pair and a trading signal (direction, entry, SL, TP). Your task is to write an analysis in English of between 100 and 200 words (minimum 100, maximum 200) that:

1) ACT AS AN EXPERT: Use appropriate technical language (support/resistance, momentum, volume, opens/closes, trend) and give a professional reading of the market.
2) PAIR AND TIMEFRAME: Explicitly and relevantly include the pair (symbol) and timeframe in your analysis; they are key context for the reader.
3) DATA-DRIVEN ANALYSIS: Interpret price (open, high, low, close) and, when volume is provided, comment on what volume says about the strength of the move and confirmation of the signal.
4) FORWARD-LOOKING VIEW: Include an assessment of where price may go and why the current setup supports that expectation.
5) SUPPORT OUR SIGNAL: Justify the signal we generated—explain why the direction (buy/sell), entry and SL/TP levels make sense given the technical context. Do not contradict the signal; back it with your analysis.
6) LANGUAGE: ONLY English. ORIGINAL text in English, not a translation.
7) ANALYSIS ONLY: Do not include the signal's numeric data (entry, SL, TP) in your output; those will be shown separately with headers. Your output is only the analysis text.

Return ONLY a valid JSON object with these keys:
- analysis (string): analysis in HTML (<p> paragraphs). No <script>. Between 100 and 200 words (minimum 100, maximum 200). Must mention the pair and timeframe.
- excerpt (string): 1 or 2 sentences for summary/listings (max 160 characters).`;

/** Tipo de vela para análisis LLM (volume opcional). */
export type LLMCandle = { time: number; open: number; high: number; low: number; close: number; volume?: number };

/** Genera análisis de la señal con IA (proveedor configurado). Velas = últimas 100; incluye volumen si está disponible. Idioma es o en. */
export async function generateSignalAnalysisWithLLM(
  candles: LLMCandle[],
  signal: SignalAnalysisInput,
  language: 'es' | 'en',
  apiKey?: string
): Promise<SignalAnalysisResult> {
  const provider = getLLMProvider();
  if (!provider) {
    throw new Error('LLM no configurado: define GROQ_API_KEY o SILICONFLOW_API_KEY y LLM_PROVIDER.');
  }
  // Usamos solo las últimas 60 velas para reducir tokens y mantener contexto suficiente
  const lastCandles = candles.slice(-60);
  const hasVolume = lastCandles.some((c) => c.volume != null && Number(c.volume) >= 0);
  const candleLines = lastCandles
    .map((c) =>
      hasVolume
        ? `${c.time}\t${c.open}\t${c.high}\t${c.low}\t${c.close}\t${c.volume ?? ''}`
        : `${c.time}\t${c.open}\t${c.high}\t${c.low}\t${c.close}`
    )
    .join('\n');
  const slStr = signal.stop_loss != null ? String(signal.stop_loss) : '—';
  const tpStr = signal.take_profit != null ? String(signal.take_profit) : '—';
  const columnsEs = hasVolume ? 'timestamp, open, high, low, close, volume' : 'timestamp, open, high, low, close';
  const columnsEn = hasVolume ? 'timestamp, open, high, low, close, volume' : 'timestamp, open, high, low, close';

  const userPrompt =
    language === 'es'
      ? `Datos de las últimas velas (${columnsEs}), una por línea:\n${candleLines}\n\nNuestra señal: Par ${signal.symbol}, Timeframe ${signal.timeframe}, Dirección ${signal.action.toUpperCase()}, Entrada ${signal.entry_price}, SL ${slStr}, TP ${tpStr}. Hora señal: ${signal.executedAt}.\n\nEscribe un análisis experto en trading y finanzas en español: entre 100 y 200 palabras (mínimo 100, máximo 200). Incluye de forma clara el par (${signal.symbol}) y el timeframe (${signal.timeframe}). Usa precio y volumen (si aplica), da perspectiva a futuro y justifica esta señal. Solo el texto de análisis, sin repetir los datos numéricos de la señal. Salida en español, original.`
      : `Last candles data (${columnsEn}), one per line:\n${candleLines}\n\nOur signal: Pair ${signal.symbol}, Timeframe ${signal.timeframe}, Direction ${signal.action.toUpperCase()}, Entry ${signal.entry_price}, SL ${slStr}, TP ${tpStr}. Signal time: ${signal.executedAt}.\n\nWrite an expert trading and finance analysis in English: between 100 and 200 words (minimum 100, maximum 200). Clearly include the pair (${signal.symbol}) and timeframe (${signal.timeframe}). Use price and volume (if applicable), give a forward-looking view and justify this signal. Analysis text only, do not repeat the signal numeric data. Output in English, original.`;

  const systemPrompt = language === 'es' ? SIGNAL_ANALYSIS_SYSTEM_ES : SIGNAL_ANALYSIS_SYSTEM_EN;

  const result = await provider.createCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.6, apiKey: apiKey ?? undefined }
  );

  let raw = result.content ?? '';
  raw = raw.replace(/^\s*```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  const jsonStr = extractFirstJson(raw);
  const sanitized = sanitizeJsonString(jsonStr);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(sanitized) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`LLM signal analysis invalid JSON: ${(e as Error).message}. Raw: ${raw.slice(0, 400)}`);
  }

  const analysis = String(data.analysis ?? '').trim();
  const excerpt = String(data.excerpt ?? '').trim();
  if (!analysis) throw new Error('LLM signal analysis missing analysis field');

  return { analysis, excerpt: excerpt || analysis.slice(0, 160) };
}
