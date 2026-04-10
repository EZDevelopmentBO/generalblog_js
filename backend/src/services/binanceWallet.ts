import crypto from 'crypto';
import { env } from '../config/env';

const BASE_URL = 'https://api.binance.com';

/** Construye query string y firma HMAC-SHA256 para peticiones SIGNED (Wallet API). */
function signQuery(params: Record<string, string | number | boolean>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const signature = crypto.createHmac('sha256', env.BINANCE_SECRET_KEY).update(sorted).digest('hex');
  return `${sorted}&signature=${signature}`;
}

/** GET con autenticación (USER_DATA). */
async function signedGet<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const timestamp = Date.now();
  const query = signQuery({ ...params, timestamp });
  const url = `${BASE_URL}${path}?${query}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-MBX-APIKEY': env.BINANCE_API_KEY },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { msg?: string }).msg || res.statusText);
  }
  return res.json() as Promise<T>;
}

export interface DepositAddressResult {
  address: string;
  coin: string;
  tag: string;
  url?: string;
}

/** Nombres de red que la API de Binance acepta. */
const NETWORK_ALIAS: Record<string, string> = {
  BEP20: 'BSC',
  BSC: 'BSC',
  ERC20: 'ETH',
  ETH: 'ETH',
  TRC20: 'TRX',
  TRON: 'TRX',
  TRX: 'TRX',
};

/** Obtiene la dirección de depósito para una moneda y red (tu cuenta Binance). */
export async function getDepositAddress(coin: string, network: string): Promise<DepositAddressResult> {
  const apiNetwork = NETWORK_ALIAS[network.toUpperCase()] ?? network;
  return signedGet<DepositAddressResult>('/sapi/v1/capital/deposit/address', { coin, network: apiNetwork });
}

export interface DepositRecord {
  id: string;
  amount: string;
  coin: string;
  network: string;
  status: number;
  address: string;
  addressTag: string;
  txId: string;
  insertTime: number;
  completeTime?: number;
  sourceAddress?: string;
}

/** Historial de depósitos (status 1 = success). includeSource: true devuelve sourceAddress (quién envió). */
export async function getDepositHistory(params: {
  coin?: string;
  status?: number;
  startTime?: number;
  endTime?: number;
  limit?: number;
  includeSource?: boolean;
}): Promise<DepositRecord[]> {
  const q: Record<string, string | number | boolean> = {};
  if (params.coin) q.coin = params.coin;
  if (params.status !== undefined) q.status = params.status;
  if (params.startTime !== undefined) q.startTime = params.startTime;
  if (params.endTime !== undefined) q.endTime = params.endTime;
  if (params.limit !== undefined) q.limit = params.limit;
  if (params.includeSource === true) q.includeSource = true;
  const out = await signedGet<DepositRecord[]>('/sapi/v1/capital/deposit/hisrec', q);
  return Array.isArray(out) ? out : [];
}
