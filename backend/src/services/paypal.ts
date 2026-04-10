import { env } from '../config/env';

const BASE_URL =
  env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

let cachedToken: { access_token: string; expires_at: number } | null = null;

/** Obtiene access token (OAuth2 client credentials). Cache breve para no pedir en cada request. */
export async function getPayPalAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) {
    return cachedToken.access_token;
  }
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal auth failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export interface CreateOrderParams {
  amount: string;
  currency_code: string;
  description?: string;
  return_url: string;
  cancel_url: string;
}

export interface CreateOrderResult {
  id: string;
  status: string;
  approval_url: string;
}

/** Crea una orden en PayPal (intent CAPTURE). */
export async function createPayPalOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const token = await getPayPalAccessToken();
  const body = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: params.currency_code,
          value: params.amount,
        },
        description: params.description?.slice(0, 127) || undefined,
      },
    ],
    application_context: {
      return_url: params.return_url,
      cancel_url: params.cancel_url,
      brand_name: 'Mi blog',
    },
  };
  const res = await fetch(`${BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal create order failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as {
    id: string;
    status: string;
    links?: Array< { rel: string; href: string }>;
  };
  const approveLink = data.links?.find((l) => l.rel === 'approve');
  return {
    id: data.id,
    status: data.status,
    approval_url: approveLink?.href || '',
  };
}

export interface CaptureResult {
  id: string;
  status: string;
  payer_email?: string;
  payer_id?: string;
}

/** Captura el pago de una orden ya aprobada por el usuario. */
export async function capturePayPalOrder(orderId: string): Promise<CaptureResult> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: '{}',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal capture failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as {
    id: string;
    status: string;
    payment_source?: { paypal?: { email_address?: string; account_id?: string } };
    payer?: { email_address?: string; payer_id?: string };
  };
  const payer = data.payer ?? data.payment_source?.paypal;
  return {
    id: data.id,
    status: data.status,
    payer_email: payer?.email_address ?? undefined,
    payer_id: payer?.payer_id ?? payer?.account_id ?? undefined,
  };
}

/** Headers que envía PayPal en el webhook (case-insensitive). */
export interface PayPalWebhookHeaders {
  'paypal-transmission-id'?: string;
  'paypal-transmission-sig'?: string;
  'paypal-transmission-time'?: string;
  'paypal-auth-algo'?: string;
  'paypal-cert-url'?: string;
}

/** Verifica la firma del webhook con la API de PayPal. */
export async function verifyPayPalWebhookSignature(
  headers: PayPalWebhookHeaders,
  webhookEvent: object
): Promise<boolean> {
  const transmissionId = headers['paypal-transmission-id'];
  const transmissionSig = headers['paypal-transmission-sig'];
  const transmissionTime = headers['paypal-transmission-time'];
  const authAlgo = headers['paypal-auth-algo'];
  const certUrl = headers['paypal-cert-url'];
  if (!transmissionId || !transmissionSig || !transmissionTime || !authAlgo || !certUrl || !env.PAYPAL_WEBHOOK_ID) {
    return false;
  }
  const token = await getPayPalAccessToken();
  const body = {
    auth_algo: authAlgo,
    cert_url: certUrl,
    transmission_id: transmissionId,
    transmission_sig: transmissionSig,
    transmission_time: transmissionTime,
    webhook_id: env.PAYPAL_WEBHOOK_ID,
    webhook_event: webhookEvent,
  };
  const res = await fetch(`${BASE_URL}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === 'SUCCESS';
}

/** Extrae el order ID (paypal_order_id) del resource en PAYMENT.CAPTURE.COMPLETED. */
export function getOrderIdFromCaptureEvent(resource: { links?: Array<{ rel?: string; href?: string }> }): string | null {
  const links = resource?.links ?? [];
  const upLink = links.find((l) => (l.rel || '').toLowerCase() === 'up');
  const href = upLink?.href || '';
  const match = href.match(/\/v2\/checkout\/orders\/([A-Z0-9]+)/i);
  return match ? match[1] : null;
}
