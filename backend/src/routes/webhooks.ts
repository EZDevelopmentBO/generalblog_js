import { Router, Request, Response } from 'express';
import {
  verifyPayPalWebhookSignature,
  getOrderIdFromCaptureEvent,
  type PayPalWebhookHeaders,
} from '../services/paypal';
import { verifyBinancePayWebhookSignature, type BinancePayWebhookHeaders } from '../services/binancePay';
import {
  getPaymentByPaypalOrderId,
  getPaymentByBinanceMerchantTradeNo,
  setPaymentCaptured,
  createDownloadUrlForPayment,
} from '../services/payment';
import { env } from '../config/env';

export const webhooksRouter = Router();

/** Normaliza headers a minúsculas para leer los de PayPal. */
function getPayPalWebhookHeaders(req: Request): PayPalWebhookHeaders {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') h[k.toLowerCase()] = v;
  }
  return {
    'paypal-transmission-id': h['paypal-transmission-id'],
    'paypal-transmission-sig': h['paypal-transmission-sig'],
    'paypal-transmission-time': h['paypal-transmission-time'],
    'paypal-auth-algo': h['paypal-auth-algo'],
    'paypal-cert-url': h['paypal-cert-url'],
  };
}

webhooksRouter.post('/paypal', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      event_type?: string;
      resource?: { links?: Array<{ rel?: string; href?: string }> };
    };
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid body' });
      return;
    }
    if (env.PAYPAL_WEBHOOK_ID) {
      const headers = getPayPalWebhookHeaders(req);
      const valid = await verifyPayPalWebhookSignature(headers, body);
      if (!valid) {
        res.status(401).send();
        return;
      }
    }
    const eventType = body.event_type;

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const resource = body.resource;
      const orderId = resource ? getOrderIdFromCaptureEvent(resource) : null;
      if (!orderId) {
        res.status(200).send(); // ACK para no reintentar; no tenemos order id
        return;
      }
      const payment = await getPaymentByPaypalOrderId(orderId);
      if (payment && payment.status !== 'captured') {
        await setPaymentCaptured(payment.id);
      }
      res.status(200).send();
      return;
    }

    // Otros eventos: solo ACK
    res.status(200).send();
  } catch (e) {
    console.error('[webhook paypal]', e);
    res.status(500).send();
  }
});

/** Handler del webhook Binance Pay. Debe recibir req.rawBody (Buffer) y req.body (parsed). Se monta en index antes de express.json() con express.raw(). */
export async function binancePayWebhookHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const body = req.body as {
      bizType?: string;
      bizStatus?: string;
      data?: string | { merchantTradeNo?: string };
    };
    if (!body || typeof body !== 'object') {
      res.status(400).send();
      return;
    }
    if (body.bizType !== 'PAY' || body.bizStatus !== 'PAY_SUCCESS') {
      res.status(200).send();
      return;
    }
    let merchantTradeNo: string | null = null;
    if (typeof body.data === 'string') {
      try {
        const data = JSON.parse(body.data) as { merchantTradeNo?: string };
        merchantTradeNo = data.merchantTradeNo ?? null;
      } catch {
        res.status(200).send();
        return;
      }
    } else if (body.data && typeof body.data === 'object' && body.data.merchantTradeNo) {
      merchantTradeNo = body.data.merchantTradeNo;
    }
    if (!merchantTradeNo) {
      res.status(200).send();
      return;
    }
    if (env.BINANCE_PAY_WEBHOOK_PUBLIC_KEY && rawBody) {
      const headers: BinancePayWebhookHeaders = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') (headers as Record<string, string>)[k] = v;
      }
      const valid = verifyBinancePayWebhookSignature(rawBody, headers, env.BINANCE_PAY_WEBHOOK_PUBLIC_KEY);
      if (!valid) {
        res.status(401).send();
        return;
      }
    }
    const payment = await getPaymentByBinanceMerchantTradeNo(merchantTradeNo);
    if (payment && payment.status !== 'captured') {
      await setPaymentCaptured(payment.id);
      await createDownloadUrlForPayment(payment.post_id);
    }
    res.status(200).send();
  } catch (e) {
    console.error('[webhook binance-pay]', e);
    res.status(500).send();
  }
}
