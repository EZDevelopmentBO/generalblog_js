import { query } from '../config/database';

const DEFAULT_DOWNLOAD_TOKEN_HOURS = 48;
const MIN_HOURS = 1;
const MAX_HOURS = 168; // 7 días

const DEFAULT_DOWNLOAD_MAX_COUNT = 1;
const MIN_DOWNLOAD_MAX_COUNT = 1;
const MAX_DOWNLOAD_MAX_COUNT = 100;

export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await query<{ value: string }>(
    'SELECT value FROM system_settings WHERE key = $1',
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const { rows } = await query<{ key: string; value: string }>(
    'SELECT key, value FROM system_settings'
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

/** Horas de vigencia del token de descarga (1–168). Por defecto 48. */
export async function getDownloadTokenHours(): Promise<number> {
  const raw = await getSetting('download_token_hours');
  if (raw == null || raw === '') return DEFAULT_DOWNLOAD_TOKEN_HOURS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_HOURS) return DEFAULT_DOWNLOAD_TOKEN_HOURS;
  if (n > MAX_HOURS) return MAX_HOURS;
  return n;
}

export function clampDownloadTokenHours(hours: number): number {
  if (!Number.isFinite(hours) || hours < MIN_HOURS) return DEFAULT_DOWNLOAD_TOKEN_HOURS;
  if (hours > MAX_HOURS) return MAX_HOURS;
  return Math.floor(hours);
}

/** Número máximo de descargas permitidas por token (en su vigencia). Por defecto 1. */
export async function getDownloadMaxCount(): Promise<number> {
  const raw = await getSetting('download_max_count');
  if (raw == null || raw === '') return DEFAULT_DOWNLOAD_MAX_COUNT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_DOWNLOAD_MAX_COUNT) return DEFAULT_DOWNLOAD_MAX_COUNT;
  if (n > MAX_DOWNLOAD_MAX_COUNT) return MAX_DOWNLOAD_MAX_COUNT;
  return n;
}

export function clampDownloadMaxCount(n: number): number {
  if (!Number.isFinite(n) || n < MIN_DOWNLOAD_MAX_COUNT) return DEFAULT_DOWNLOAD_MAX_COUNT;
  if (n > MAX_DOWNLOAD_MAX_COUNT) return MAX_DOWNLOAD_MAX_COUNT;
  return Math.floor(n);
}

export const DOWNLOAD_TOKEN_HOURS_MIN = MIN_HOURS;
export const DOWNLOAD_TOKEN_HOURS_MAX = MAX_HOURS;
export const DOWNLOAD_TOKEN_HOURS_DEFAULT = DEFAULT_DOWNLOAD_TOKEN_HOURS;
export const DOWNLOAD_MAX_COUNT_MIN = MIN_DOWNLOAD_MAX_COUNT;
export const DOWNLOAD_MAX_COUNT_MAX = MAX_DOWNLOAD_MAX_COUNT;
export const DOWNLOAD_MAX_COUNT_DEFAULT = DEFAULT_DOWNLOAD_MAX_COUNT;
