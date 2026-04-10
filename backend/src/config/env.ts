import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Raíz del backend: desde dist/config o src/config subimos dos niveles (contiene dist/ o src/)
const backendDir = path.resolve(__dirname, '..', '..');
const cwd = process.cwd();

const candidates: string[] = [
  path.join(backendDir, '.env'),           // backend/.env (prioridad: mismo lugar que el ejecutable)
  path.join(backendDir, '.env.test'),
  path.join(cwd, '.env'),                   // cwd/.env (p. ej. /app en Docker)
  path.join(cwd, 'backend', '.env'),        // repo raíz: cwd/backend/.env
  path.join(cwd, 'backend', '.env.test'),
];

let envPathLoaded: string | null = null;
for (const envPath of candidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    envPathLoaded = envPath;
    break;
  }
}
if (!envPathLoaded) {
  dotenv.config(); // último recurso: cwd por defecto de dotenv
}

/** Ruta del .env que se cargó (para depuración de "Google OAuth not configured") */
export const loadedEnvPath = envPathLoaded;

export const env = {
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  API_URL: process.env.API_URL ?? 'http://localhost:4000',
  FRONTEND_URL: process.env.FRONTEND_URL ?? process.env.API_URL ?? 'http://localhost:5173',
  /** Ruta al build del frontend (ej. ../frontend/dist). Si se define, el backend sirve el SPA y devuelve HTML con meta OG a los crawlers para URLs de posts. */
  FRONTEND_DIST: process.env.FRONTEND_DIST ?? '',
  /** Zona horaria para mostrar fechas en títulos de posts (ej. America/La_Paz). Si no se define, se usa UTC. */
  SITE_TIMEZONE: process.env.SITE_TIMEZONE ?? 'UTC',
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  /** Proveedor LLM: groq | siliconflow. Por defecto groq. */
  LLM_PROVIDER: (process.env.LLM_PROVIDER ?? 'groq').toLowerCase(),
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
  GROQ_MODEL: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
  SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY ?? '',
  /** Modelo por defecto en SiliconFlow (ej. Qwen/QwQ-32B, deepseek-ai/DeepSeek-V3). */
  SILICONFLOW_MODEL: process.env.SILICONFLOW_MODEL ?? 'Qwen/QwQ-32B',
  SESSION_SECRET: process.env.SESSION_SECRET ?? 'change-me-in-production',
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID ?? '',
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET ?? '',
  PAYPAL_MODE: (process.env.PAYPAL_MODE ?? 'sandbox') as 'sandbox' | 'live',
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID ?? '',
  BINANCE_PAY_API_KEY: process.env.BINANCE_PAY_API_KEY ?? '',
  BINANCE_PAY_SECRET_KEY: process.env.BINANCE_PAY_SECRET_KEY ?? '',
  BINANCE_PAY_BASE_URL: process.env.BINANCE_PAY_BASE_URL ?? 'https://bpay.binanceapi.com',
  /** Si true, Binance Pay se simula en local (no hay sandbox oficial). create-order devuelve datos falsos y GET /status?simulate=paid marca como PAID. */
  BINANCE_PAY_SANDBOX: process.env.BINANCE_PAY_SANDBOX === 'true',
  /** Clave pública PEM para verificar firma del webhook Binance Pay (opcional). Si no se define, el webhook no verifica firma. */
  BINANCE_PAY_WEBHOOK_PUBLIC_KEY: process.env.BINANCE_PAY_WEBHOOK_PUBLIC_KEY ?? '',
  /** API de Wallet (cuenta personal) para validar depósitos directos. Usar API key con solo "Enable Reading". */
  BINANCE_API_KEY: process.env.BINANCE_API_KEY ?? '',
  BINANCE_SECRET_KEY: process.env.BINANCE_SECRET_KEY ?? '',
  /** Red para depósitos USDT (ej. BEP20, ERC20). Por defecto BEP20 (comisiones bajas). */
  BINANCE_DEPOSIT_NETWORK: process.env.BINANCE_DEPOSIT_NETWORK ?? 'BEP20',

};
