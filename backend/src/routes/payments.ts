import { Router, Request, Response } from 'express';
import type { User } from '../types';
import { getPostById, buildPostPublicUrl, getPostDownloadInfoForPayment } from '../services/blog';
import { getPostDownloadByPostId } from '../services/blog';
import { createPayPalOrder, capturePayPalOrder } from '../services/paypal';
import { createBinancePayOrder } from '../services/binancePay';
import {
  createPayment,
  getPaymentByPaypalOrderId,
  getPaymentByBinanceMerchantTradeNo,
  getPaymentByBinanceDepositReference,
  setPaymentCaptured,
  setBinanceDepositCaptureDetails,
  createDownloadUrlForPayment,
  recordFreeDownloadAndCreateToken,
} from '../services/payment';
import { validateCode, recordUse, getCouponInfoForDisplay } from '../services/discountCode';
import { sendDownloadLinkEmail } from '../services/email';
import { logNotification } from '../services/notificationLog';
import { getDepositAddress } from '../services/binanceWallet';
import { env } from '../config/env';
import { query } from '../config/database';

async function getPreferredLanguageByUserId(userId: number | null): Promise<string | null> {
  if (userId == null || !Number.isFinite(userId)) return null;
  const { rows } = await query<{ preferred_language: string | null }>(
    'SELECT preferred_language FROM users WHERE id = $1',
    [userId]
  );
  return rows[0]?.preferred_language ?? null;
}

function getSessionEmail(req: Request): string | null {
  if (!req.isAuthenticated() || !req.user) return null;
  const email = (req.user as User).email;
  return typeof email === 'string' && email.trim() ? email.trim() : null;
}

function getSessionUserId(req: Request): number | null {
  if (!req.isAuthenticated() || !req.user) return null;
  const id = (req.user as User).id;
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

async function trySendDownloadEmail(params: {
  postId: number;
  toEmail: string | null | undefined;
  downloadUrl: string;
  expiresAt: string;
  paymentId?: number;
  /** Idioma del destinatario (p. ej. user.preferred_language). Por defecto 'en'. */
  preferredLanguage?: string | null;
}): Promise<{ sent: boolean; error?: string } | null> {
  if (!params.toEmail || !params.toEmail.trim()) return null;
  try {
    const post = await getPostById(params.postId);
    const postTitle = post?.title ?? '';
    const postUrl = post
      ? buildPostPublicUrl(post.slug, post.category, post.language ?? 'es', env.FRONTEND_URL)
      : '';
    const expiresAtFormatted = new Date(params.expiresAt).toLocaleString();
    const result = await sendDownloadLinkEmail({
      to: params.toEmail.trim(),
      downloadUrl: params.downloadUrl,
      postTitle,
      postUrl,
      expiresAt: expiresAtFormatted,
      preferredLanguage: params.preferredLanguage ?? 'en',
    });
    if (!result.sent && result.error) {
      console.error('[email] sendDownloadLinkEmail failed:', result.error);
    }
    if (params.paymentId != null) {
      await logNotification({
        channel: 'email',
        recipient: params.toEmail.trim(),
        subject_or_template: 'download_link',
        related_type: 'payment',
        related_id: params.paymentId,
        status: result.sent ? 'sent' : 'failed',
        error_message: result.error ?? null,
      });
    }
    return result;
  } catch (e) {
    console.error('[email] sendDownloadLinkEmail error:', e);
    if (params.paymentId != null && params.toEmail?.trim()) {
      await logNotification({
        channel: 'email',
        recipient: params.toEmail.trim(),
        subject_or_template: 'download_link',
        related_type: 'payment',
        related_id: params.paymentId,
        status: 'failed',
        error_message: e instanceof Error ? e.message : String(e),
      }).catch(() => {});
    }
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const paymentsRouter = Router();

async function paidResponse(postId: number, downloadUrl: string, expiresAt: string) {
  const postInfo = await getPostDownloadInfoForPayment(postId);
  return {
    status: 'PAID' as const,
    downloadUrl,
    expiresAt,
    ...(postInfo && {
      postId: postInfo.postId,
      postSlug: postInfo.slug,
      postCategory: postInfo.category,
      postLanguage: postInfo.language,
      download_file_is_image: postInfo.download_file_is_image,
    }),
  };
}

function generateMerchantTradeNo(postId: number): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `p${postId}_${t}_${r}`.slice(0, 32);
}

/** Mínimo USDT en Binance para depósitos. Máximo 6 decimales (límite de Binance). */
const BINANCE_MIN_USDT = 0.01;
const BINANCE_DECIMALS = 6;

/** Monto único para transferencia directa (máx. 6 decimales en Binance).
 * - Si el post es 0.01 (mínimo): sumamos un pequeño random (ej. 0.010001..0.010099) para ser únicos.
 * - Si el post es > 0.01: restamos un pequeño random (ej. 1.00 → 0.999967) y nunca bajamos de 0.01. */
function uniqueDepositAmount(baseUsd: number): string {
  const base = Math.floor(baseUsd * 10000) / 10000;
  if (base <= BINANCE_MIN_USDT) {
    const add = 0.000001 + Math.random() * 0.000098;
    return (BINANCE_MIN_USDT + add).toFixed(BINANCE_DECIMALS);
  }
  const subtract = 0.000001 + Math.random() * 0.000098;
  const amount = Math.max(BINANCE_MIN_USDT, base - subtract);
  return amount.toFixed(BINANCE_DECIMALS);
}

function generateDepositReference(): string {
  return 'BD' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Información del cupón para mostrar en banner (sin postId). Público. */
paymentsRouter.get('/coupon-info', async (req: Request, res: Response) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    if (!code) {
      res.status(400).json({ error: 'code requerido' });
      return;
    }
    const userId = getSessionUserId(req);
    const info = await getCouponInfoForDisplay(code, userId);
    res.json(info);
  } catch (e) {
    console.error('[payments] coupon-info', e);
    res.status(500).json({ error: 'Error al consultar cupón' });
  }
});

/** Valida un cupón y devuelve el monto con descuento (sin crear orden). */
paymentsRouter.post('/validate-coupon', async (req: Request, res: Response) => {
  try {
    const postId = parseInt(String(req.body?.postId), 10);
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!postId || Number.isNaN(postId) || !code) {
      res.status(400).json({ error: 'postId y code requeridos' });
      return;
    }
    const post = await getPostById(postId);
    if (!post || !post.has_download) {
      res.status(404).json({ error: 'Post no encontrado o sin descarga' });
      return;
    }
    const amount = Number(post.download_price_usd);
    if (amount <= 0 || !Number.isFinite(amount)) {
      res.status(400).json({ error: 'Precio inválido' });
      return;
    }
    const validation = await validateCode({
      code,
      postId,
      postCategory: post.category,
      userId: getSessionUserId(req) ?? null,
      amountUsd: amount,
    });
    if (validation.valid && validation.discountedAmount != null) {
      return res.json({
        valid: true,
        discountedAmount: validation.discountedAmount,
        amountBeforeDiscount: validation.amountBeforeDiscount,
      });
    }
    res.status(400).json({
      valid: false,
      error: validation.error ?? 'Código no válido',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al validar cupón' });
  }
});

paymentsRouter.post('/create-order', async (req: Request, res: Response) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'login_required', message: 'Debes iniciar sesión para comprar y descargar.' });
      return;
    }
    const postId = parseInt(String(req.body?.postId), 10);
    const provider =
      req.body?.provider === 'paypal'
        ? 'paypal'
        : req.body?.provider === 'binance_pay'
          ? 'binance_pay'
          : req.body?.provider === 'binance_deposit'
            ? 'binance_deposit'
            : null;
    if (!postId || Number.isNaN(postId) || !provider) {
      res.status(400).json({ error: 'postId y provider ("paypal", "binance_pay" o "binance_deposit") requeridos' });
      return;
    }
    const post = await getPostById(postId);
    if (!post || !post.has_download) {
      res.status(404).json({ error: 'Post no encontrado o sin descarga' });
      return;
    }
    const allowedMethods = (post.payment_methods?.length ? post.payment_methods : ['paypal', 'binance_pay', 'binance_deposit']) as string[];
    if (!allowedMethods.includes(provider)) {
      res.status(400).json({ error: 'Este post no acepta el método de pago seleccionado' });
      return;
    }
    const download = await getPostDownloadByPostId(postId);
    if (!download) {
      res.status(400).json({ error: 'Este post no tiene archivo de descarga' });
      return;
    }
    let amount = Number(post.download_price_usd);
    if (amount <= 0 || !Number.isFinite(amount)) {
      res.status(400).json({ error: 'Precio inválido' });
      return;
    }
    let discountCodeId: number | null = null;
    let amountBeforeDiscount: number | null = null;
    const discountCode = typeof req.body?.discountCode === 'string' ? req.body.discountCode.trim() : '';
    if (discountCode) {
      const validation = await validateCode({
        code: discountCode,
        postId,
        postCategory: post.category,
        userId: getSessionUserId(req) ?? null,
        amountUsd: amount,
      });
      if (!validation.valid) {
        res.status(400).json({ error: validation.error ?? 'Código no válido' });
        return;
      }
      if (validation.discountedAmount != null) {
        amount = validation.discountedAmount;
        discountCodeId = validation.discountCodeId ?? null;
        amountBeforeDiscount = validation.amountBeforeDiscount ?? null;
      }
    }

    // Cupón 100% (o equivalente): capturar directo sin pasarela y entregar enlace.
    if (amount <= 0) {
      const uid = getSessionUserId(req);
      if (!uid) {
        res.status(401).json({ error: 'login_required', message: 'Debes iniciar sesión para descargar.' });
        return;
      }
      const freePayment = await createPayment({
        post_id: postId,
        provider: 'free_download',
        amount_usd: 0,
        user_id: uid,
        discount_code_id: discountCodeId ?? undefined,
        amount_before_discount: amountBeforeDiscount ?? undefined,
      });
      await setPaymentCaptured(freePayment.id, getSessionEmail(req), undefined, uid);
      if (discountCodeId) {
        await recordUse({
          discountCodeId,
          paymentId: freePayment.id,
          userId: uid,
        });
      }
      const { downloadUrl, expiresAt } = await recordFreeDownloadAndCreateToken(postId, uid);
      const postInfo = await getPostDownloadInfoForPayment(postId);
      const preferredLanguage = await getPreferredLanguageByUserId(uid);
      await trySendDownloadEmail({
        postId,
        toEmail: getSessionEmail(req),
        downloadUrl,
        expiresAt,
        paymentId: freePayment.id,
        preferredLanguage,
      });
      res.json({
        status: 'captured',
        free: true,
        downloadUrl,
        expiresAt,
        ...(postInfo && {
          postId: postInfo.postId,
          postSlug: postInfo.slug,
          postCategory: postInfo.category,
          postLanguage: postInfo.language,
          download_file_is_image: postInfo.download_file_is_image,
        }),
      });
      return;
    }

    if (provider === 'paypal') {
      if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
        res.status(503).json({ error: 'PayPal no configurado' });
        return;
      }
      const frontUrl = env.FRONTEND_URL.replace(/\/$/, '');
      const returnUrl = `${frontUrl}/payment/return`;
      const cancelUrl = `${frontUrl}/payment/cancel`;
      const result = await createPayPalOrder({
        amount: amount.toFixed(2),
        currency_code: 'USD',
        description: post.title?.slice(0, 127),
        return_url: returnUrl,
        cancel_url: cancelUrl,
      });
      await createPayment({
        post_id: postId,
        provider: 'paypal',
        amount_usd: amount,
        user_id: getSessionUserId(req) ?? undefined,
        paypal_order_id: result.id,
        discount_code_id: discountCodeId ?? undefined,
        amount_before_discount: amountBeforeDiscount ?? undefined,
      });
      return res.json({
        orderId: result.id,
        approvalUrl: result.approval_url,
      });
    }

    if (provider === 'binance_pay') {
      const useSandbox = env.BINANCE_PAY_SANDBOX;
      if (!useSandbox && (!env.BINANCE_PAY_API_KEY || !env.BINANCE_PAY_SECRET_KEY)) {
        res.status(503).json({ error: 'Binance Pay no configurado' });
        return;
      }
      const merchantTradeNo = useSandbox
        ? `SANDBOX_${generateMerchantTradeNo(postId)}`
        : generateMerchantTradeNo(postId);
      if (useSandbox) {
        await createPayment({
          post_id: postId,
          provider: 'binance_pay',
          amount_usd: amount,
          user_id: getSessionUserId(req) ?? undefined,
          binance_merchant_trade_no: merchantTradeNo,
          binance_prepay_id: `sandbox_${merchantTradeNo}`,
          discount_code_id: discountCodeId ?? undefined,
          amount_before_discount: amountBeforeDiscount ?? undefined,
        });
        return res.json({
          merchantTradeNo,
          prepayId: `sandbox_${merchantTradeNo}`,
          checkoutUrl: '#',
          qrcodeLink: '',
          qrContent: '',
          expireTime: Math.floor(Date.now() / 1000) + 900,
          sandbox: true,
        });
      }
      const result = await createBinancePayOrder({
        merchantTradeNo,
        orderAmount: Number(amount.toFixed(BINANCE_DECIMALS)),
        description: post.title ?? 'Descarga',
        goodsName: post.title?.slice(0, 256) ?? 'Descarga',
      });
      await createPayment({
        post_id: postId,
        provider: 'binance_pay',
        amount_usd: amount,
        user_id: getSessionUserId(req) ?? undefined,
        binance_merchant_trade_no: merchantTradeNo,
        binance_prepay_id: result.prepayId,
        discount_code_id: discountCodeId ?? undefined,
        amount_before_discount: amountBeforeDiscount ?? undefined,
      });
      return res.json({
        merchantTradeNo,
        prepayId: result.prepayId,
        checkoutUrl: result.checkoutUrl,
        qrcodeLink: result.qrcodeLink,
        qrContent: result.qrContent,
        expireTime: result.expireTime,
      });
    }

    if (provider === 'binance_deposit') {
      if (!env.BINANCE_API_KEY || !env.BINANCE_SECRET_KEY) {
        res.status(503).json({ error: 'Transferencia Binance no configurada (BINANCE_API_KEY, BINANCE_SECRET_KEY)' });
        return;
      }
      const networkParam = String(req.body?.network ?? env.BINANCE_DEPOSIT_NETWORK).trim() || env.BINANCE_DEPOSIT_NETWORK;
      const allowedNetworks = ['BEP20', 'BSC', 'ERC20', 'ETH', 'TRC20', 'TRON', 'TRX'];
      const network = allowedNetworks.includes(networkParam.toUpperCase()) ? networkParam : env.BINANCE_DEPOSIT_NETWORK;
      const reference = generateDepositReference();
      const expectedAmount = uniqueDepositAmount(amount);
      const { address, tag } = await getDepositAddress('USDT', network);
      const payment = await createPayment({
        post_id: postId,
        provider: 'binance_deposit',
        amount_usd: amount,
        user_id: getSessionUserId(req) ?? undefined,
        binance_deposit_reference: reference,
        binance_deposit_expected_amount: expectedAmount,
        discount_code_id: discountCodeId ?? undefined,
        amount_before_discount: amountBeforeDiscount ?? undefined,
      });
      return res.json({
        reference: payment.binance_deposit_reference ?? reference,
        address,
        tag: tag || undefined,
        network,
        amount: payment.binance_deposit_expected_amount ?? expectedAmount,
        amountBase: amount,
      });
    }

    res.status(400).json({ error: 'Provider no soportado' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Error al crear orden' });
  }
});

paymentsRouter.post('/capture', async (req: Request, res: Response) => {
  try {
    const orderId = String(req.body?.orderId ?? '').trim();
    if (!orderId) {
      res.status(400).json({ error: 'orderId requerido' });
      return;
    }
    const sessionEmail = getSessionEmail(req);
    const payment = await getPaymentByPaypalOrderId(orderId);
    if (!payment) {
      res.status(404).json({ error: 'Pago no encontrado' });
      return;
    }
    if (payment.status === 'captured') {
      const { downloadUrl, expiresAt } = await createDownloadUrlForPayment(payment.post_id);
      const postInfo = await getPostDownloadInfoForPayment(payment.post_id);
      const preferredLanguage = await getPreferredLanguageByUserId(payment.user_id);
      await trySendDownloadEmail({
        postId: payment.post_id,
        toEmail: sessionEmail ?? payment.payer_email,
        downloadUrl,
        expiresAt,
        paymentId: payment.id,
        preferredLanguage,
      });
      res.json({
        status: 'captured',
        downloadUrl,
        expiresAt,
        ...(postInfo && {
          postId: postInfo.postId,
          postSlug: postInfo.slug,
          postCategory: postInfo.category,
          postLanguage: postInfo.language,
          download_file_is_image: postInfo.download_file_is_image,
        }),
      });
      return;
    }
    const capture = await capturePayPalOrder(orderId);
    await setPaymentCaptured(
      payment.id,
      capture.payer_email,
      capture.payer_id,
      getSessionUserId(req) ?? undefined
    );
    if (payment.discount_code_id) {
      await recordUse({
        discountCodeId: payment.discount_code_id,
        paymentId: payment.id,
        userId: getSessionUserId(req) ?? null,
      });
    }
    const { downloadUrl, expiresAt } = await createDownloadUrlForPayment(payment.post_id);
    const postInfo = await getPostDownloadInfoForPayment(payment.post_id);
    const preferredLanguage = await getPreferredLanguageByUserId(payment.user_id);
    await trySendDownloadEmail({
      postId: payment.post_id,
      toEmail: sessionEmail ?? capture.payer_email,
      downloadUrl,
      expiresAt,
      paymentId: payment.id,
      preferredLanguage,
    });
    res.json({
      status: 'captured',
      downloadUrl,
      expiresAt,
      ...(postInfo && {
        postId: postInfo.postId,
        postSlug: postInfo.slug,
        postCategory: postInfo.category,
        postLanguage: postInfo.language,
        download_file_is_image: postInfo.download_file_is_image,
      }),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Error al capturar pago' });
  }
});

paymentsRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const sessionEmail = getSessionEmail(req);
    const merchantTradeNo = String(req.query?.merchantTradeNo ?? '').trim();
    const reference = String(req.query?.reference ?? '').trim();
    const simulatePaid = req.query?.simulate === 'paid';

    if (reference) {
      const payment = await getPaymentByBinanceDepositReference(reference);
      if (!payment) {
        res.status(404).json({ error: 'Pago no encontrado' });
        return;
      }
      if (payment.status === 'captured') {
        const { downloadUrl, expiresAt } = await createDownloadUrlForPayment(payment.post_id);
        return res.json(await paidResponse(payment.post_id, downloadUrl, expiresAt));
      }
      const expectedAmount = payment.binance_deposit_expected_amount;
      if (!expectedAmount || !env.BINANCE_API_KEY || !env.BINANCE_SECRET_KEY) {
        return res.json({ status: 'PENDING' });
      }
      const { getDepositHistory } = await import('../services/binanceWallet');
      const createdMs = new Date(payment.created_at).getTime();
      const deposits = await getDepositHistory({
        coin: 'USDT',
        status: 1,
        startTime: createdMs - 60000,
        endTime: Date.now() + 60000,
        limit: 50,
        includeSource: true,
      });
      const expectedStr = parseFloat(expectedAmount).toFixed(BINANCE_DECIMALS);
      const match = deposits.find((d) => parseFloat(d.amount).toFixed(BINANCE_DECIMALS) === expectedStr);
      if (match) {
        await setPaymentCaptured(
          payment.id,
          sessionEmail,
          undefined,
          getSessionUserId(req) ?? undefined
        );
        if (payment.discount_code_id) {
          await recordUse({
            discountCodeId: payment.discount_code_id,
            paymentId: payment.id,
            userId: getSessionUserId(req) ?? null,
          });
        }
        await setBinanceDepositCaptureDetails(
          payment.id,
          match.txId,
          match.sourceAddress ?? null,
          match.network ?? null
        );
        const { downloadUrl, expiresAt } = await createDownloadUrlForPayment(payment.post_id);
        const preferredLanguage = await getPreferredLanguageByUserId(payment.user_id);
        await trySendDownloadEmail({
          postId: payment.post_id,
          toEmail: sessionEmail ?? payment.payer_email,
          downloadUrl,
          expiresAt,
          paymentId: payment.id,
          preferredLanguage,
        });
        return res.json(await paidResponse(payment.post_id, downloadUrl, expiresAt));
      }
      return res.json({ status: 'PENDING' });
    }

    if (!merchantTradeNo) {
      res.status(400).json({ error: 'merchantTradeNo o reference requerido' });
      return;
    }
    const payment = await getPaymentByBinanceMerchantTradeNo(merchantTradeNo);
    if (!payment) {
      res.status(404).json({ error: 'Pago no encontrado' });
      return;
    }
    if (payment.status === 'captured') {
      const { downloadUrl, expiresAt } = await createDownloadUrlForPayment(payment.post_id);
      return res.json(await paidResponse(payment.post_id, downloadUrl, expiresAt));
    }
    if (merchantTradeNo.startsWith('SANDBOX_') && simulatePaid) {
      await setPaymentCaptured(
        payment.id,
        sessionEmail,
        undefined,
        getSessionUserId(req) ?? undefined
      );
      if (payment.discount_code_id) {
        await recordUse({
          discountCodeId: payment.discount_code_id,
          paymentId: payment.id,
          userId: getSessionUserId(req) ?? null,
        });
      }
      const { downloadUrl, expiresAt } = await createDownloadUrlForPayment(payment.post_id);
      const preferredLanguage = await getPreferredLanguageByUserId(payment.user_id);
      await trySendDownloadEmail({
        postId: payment.post_id,
        toEmail: sessionEmail ?? payment.payer_email,
        downloadUrl,
        expiresAt,
        paymentId: payment.id,
        preferredLanguage,
      });
      return res.json(await paidResponse(payment.post_id, downloadUrl, expiresAt));
    }
    if (merchantTradeNo.startsWith('SANDBOX_')) {
      return res.json({ status: 'PENDING' });
    }
    const { queryBinancePayOrder } = await import('../services/binancePay');
    const order = await queryBinancePayOrder(merchantTradeNo);
    if (order.status === 'PAID') {
      await setPaymentCaptured(
        payment.id,
        sessionEmail,
        undefined,
        getSessionUserId(req) ?? undefined
      );
      if (payment.discount_code_id) {
        await recordUse({
          discountCodeId: payment.discount_code_id,
          paymentId: payment.id,
          userId: getSessionUserId(req) ?? null,
        });
      }
      const { downloadUrl, expiresAt } = await createDownloadUrlForPayment(payment.post_id);
      const preferredLanguage = await getPreferredLanguageByUserId(payment.user_id);
      await trySendDownloadEmail({
        postId: payment.post_id,
        toEmail: sessionEmail ?? payment.payer_email,
        downloadUrl,
        expiresAt,
        paymentId: payment.id,
        preferredLanguage,
      });
      return res.json(await paidResponse(payment.post_id, downloadUrl, expiresAt));
    }
    res.json({ status: order.status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Error al consultar estado' });
  }
});
