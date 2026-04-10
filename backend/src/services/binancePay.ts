import crypto from 'crypto';
import { env } from '../config/env';

const BASE_URL = env.BINANCE_PAY_BASE_URL || 'https://bpay.binanceapi.com';

function randomNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** Firma el payload y devuelve headers para la request. */
function signRequest(body: string): { timestamp: string; nonce: string; signature: string } {
  const timestamp = String(Date.now());
  const nonce = randomNonce();
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  const sig = crypto
    .createHmac('sha512', env.BINANCE_PAY_SECRET_KEY)
    .update(payload)
    .digest('hex')
    .toUpperCase();
  return { timestamp, nonce, signature: sig };
}

/** Headers requeridos por Binance Pay. */
function buildHeaders(body: string): Record<string, string> {
  const { timestamp, nonce, signature } = signRequest(body);
  return {
    'Content-Type': 'application/json',
    'BinancePay-Timestamp': timestamp,
    'BinancePay-Nonce': nonce,
    'BinancePay-Certificate-SN': env.BINANCE_PAY_API_KEY,
    'BinancePay-Signature': signature,
  };
}

export interface BinanceCreateOrderParams {
  merchantTradeNo: string;
  orderAmount: number;
  description: string;
  goodsName: string;
}

export interface BinanceCreateOrderResult {
  prepayId: string;
  checkoutUrl: string;
  qrcodeLink: string;
  qrContent: string;
  expireTime: number;
  currency: string;
  totalFee: string;
}

export async function createBinancePayOrder(params: BinanceCreateOrderParams): Promise<BinanceCreateOrderResult> {
  const body = JSON.stringify({
    env: { terminalType: 'WEB' },
    merchantTradeNo: params.merchantTradeNo,
    orderAmount: params.orderAmount,
    currency: 'USDT',
    description: params.description.slice(0, 256),
    goodsDetails: [
      {
        goodsType: '02',
        goodsCategory: 'Z000',
        referenceGoodsId: params.merchantTradeNo,
        goodsName: params.goodsName.slice(0, 256).replace(/["\\]/g, ''),
        goodsDetail: params.description.slice(0, 256),
      },
    ],
  });
  const res = await fetch(`${BASE_URL}/binancepay/openapi/v3/order`, {
    method: 'POST',
    headers: buildHeaders(body),
    body,
  });
  const data = (await res.json()) as {
    status: string;
    code: string;
    data?: {
      prepayId: string;
      checkoutUrl: string;
      qrcodeLink: string;
      qrContent: string;
      expireTime: number;
      currency: string;
      totalFee: string;
    };
    errorMessage?: string;
  };
  if (data.status !== 'SUCCESS' || !data.data) {
    throw new Error(data.errorMessage || `Binance Pay: ${data.code}`);
  }
  return {
    prepayId: data.data.prepayId,
    checkoutUrl: data.data.checkoutUrl,
    qrcodeLink: data.data.qrcodeLink,
    qrContent: data.data.qrContent,
    expireTime: data.data.expireTime,
    currency: data.data.currency,
    totalFee: data.data.totalFee,
  };
}

export interface BinanceQueryOrderResult {
  status: string; // INITIAL, PENDING, PAID, CANCELED, ERROR, EXPIRED, etc.
  prepayId?: string;
  merchantTradeNo?: string;
}

export async function queryBinancePayOrder(merchantTradeNo: string): Promise<BinanceQueryOrderResult> {
  const body = JSON.stringify({ merchantTradeNo });
  const res = await fetch(`${BASE_URL}/binancepay/openapi/v2/order/query`, {
    method: 'POST',
    headers: buildHeaders(body),
    body,
  });
  const data = (await res.json()) as {
    status: string;
    code: string;
    data?: {
      status: string;
      prepayId?: string;
      merchantTradeNo?: string;
    };
    errorMessage?: string;
  };
  if (data.status !== 'SUCCESS') {
    throw new Error(data.errorMessage || `Binance Pay query: ${data.code}`);
  }
  return {
    status: data.data?.status ?? 'UNKNOWN',
    prepayId: data.data?.prepayId,
    merchantTradeNo: data.data?.merchantTradeNo,
  };
}

/** Headers del webhook Binance Pay (para verificación de firma). */
export interface BinancePayWebhookHeaders {
  'BinancePay-Timestamp'?: string;
  'BinancePay-Nonce'?: string;
  'BinancePay-Signature'?: string;
  'BinancePay-Certificate-SN'?: string;
}

/** Verifica la firma RSA-SHA256 del webhook. Payload = timestamp + "\\n" + nonce + "\\n" + body + "\\n". */
export function verifyBinancePayWebhookSignature(
  rawBody: Buffer,
  headers: BinancePayWebhookHeaders,
  publicKeyPem: string
): boolean {
  const timestamp = headers['BinancePay-Timestamp'] ?? headers['binancepay-timestamp'] ?? '';
  const nonce = headers['BinancePay-Nonce'] ?? headers['binancepay-nonce'] ?? '';
  const signatureB64 = headers['BinancePay-Signature'] ?? headers['binancepay-signature'] ?? '';
  if (!timestamp || !nonce || !signatureB64 || !publicKeyPem) return false;
  const bodyStr = rawBody.toString('utf8');
  const payload = `${timestamp}\n${nonce}\n${bodyStr}\n`;
  const signature = Buffer.from(signatureB64, 'base64');
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify('RSA-SHA256', Buffer.from(payload, 'utf8'), key, signature);
  } catch {
    return false;
  }
}
