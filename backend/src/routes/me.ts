import { Router, Request, Response } from 'express';
import type { User } from '../types';
import { requireAuth } from '../middlewares/auth';
import {
  listPaymentsByUserId,
  getPaymentByIdAndUserId,
  createDownloadUrlForPayment,
} from '../services/payment';
import { sendDownloadLinkEmail } from '../services/email';
import { logNotification } from '../services/notificationLog';
import { getPostById, buildPostPublicUrl, getPostDownloadInfoForPayment } from '../services/blog';
import { env } from '../config/env';
import { query } from '../config/database';

export const meRouter = Router();

meRouter.use(requireAuth);

/** PUT /api/me/preferences — Guarda preferencias del usuario (p. ej. idioma). */
meRouter.put('/preferences', async (req: Request, res: Response) => {
  try {
    const user = req.user as User;
    const lang = req.body?.preferred_language;
    if (lang !== 'es' && lang !== 'en') {
      res.status(400).json({ error: 'preferred_language debe ser "es" o "en"' });
      return;
    }
    await query(
      'UPDATE users SET preferred_language = $1, updated_at = NOW() WHERE id = $2',
      [lang, user.id]
    );
    const updated = { ...user, preferred_language: lang };
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Error al guardar preferencias' });
  }
});

/** GET /api/me/purchases — Lista de compras del usuario logueado. */
meRouter.get('/purchases', async (req: Request, res: Response) => {
  try {
    const user = req.user as User;
    const purchases = await listPaymentsByUserId(user.id);
    res.json({ purchases });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Error al listar compras' });
  }
});

/** POST /api/me/download-link — Genera enlace de descarga para un pago capturado del usuario. */
meRouter.post('/download-link', async (req: Request, res: Response) => {
  try {
    const user = req.user as User;
    const paymentId = parseInt(String(req.body?.paymentId), 10);
    if (!paymentId || !Number.isFinite(paymentId)) {
      res.status(400).json({ error: 'paymentId requerido' });
      return;
    }
    const payment = await getPaymentByIdAndUserId(paymentId, user.id);
    if (!payment) {
      res.status(404).json({ error: 'Pago no encontrado' });
      return;
    }
    if (payment.status !== 'captured') {
      res.status(400).json({ error: 'Solo se puede obtener enlace para pagos completados' });
      return;
    }
    const { downloadUrl, expiresAt } = await createDownloadUrlForPayment(payment.post_id);
    const postInfo = await getPostDownloadInfoForPayment(payment.post_id);
    const sendEmail = req.body?.sendEmail === true;
    if (sendEmail && user.email) {
      const post = await getPostById(payment.post_id);
      const postTitle = post?.title ?? '';
      const postUrl = post
        ? buildPostPublicUrl(post.slug, post.category, post.language ?? 'es', env.FRONTEND_URL)
        : '';
      const expiresAtFormatted = new Date(expiresAt).toLocaleString();
      const result = await sendDownloadLinkEmail({
        to: user.email,
        downloadUrl,
        postTitle,
        postUrl,
        expiresAt: expiresAtFormatted,
        preferredLanguage: user.preferred_language ?? 'en',
      });
      await logNotification({
        channel: 'email',
        recipient: user.email,
        subject_or_template: 'download_link',
        related_type: 'payment',
        related_id: payment.id,
        status: result.sent ? 'sent' : 'failed',
        error_message: result.error ?? null,
      });
    }
    res.json({
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
    res.status(500).json({ error: e instanceof Error ? e.message : 'Error al generar enlace' });
  }
});
