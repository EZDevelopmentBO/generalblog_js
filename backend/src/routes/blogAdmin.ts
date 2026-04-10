import { Router, Request, Response } from 'express';
import { requireAuth, requireSuperUser, requireContentEditorOrSuperuser, requireDiscountManager } from '../middlewares/auth';
import {
  listAdminPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  isValidCategory,
  getPostDownloadByPostId,
  setPostDownload,
  deletePostDownload,
} from '../services/blog';
import { createDownloadToken } from '../services/downloadToken';
import { uploadDownload, downloadsDir } from '../middlewares/uploadDownload';
import { buildDownloadFilename } from '../utils/downloadFilename';
import path from 'path';
import fs from 'fs';
import { generatePostWithLLM } from '../services/llm';
import { getLLMProvider } from '../services/llm/factory';
import type { BlogCategory, BlogPostCreateInput } from '../types';
import { env } from '../config/env';
import {
  listPayments,
  listPaymentsByPostId,
  getPaymentStats,
  getPaymentById,
  createDownloadUrlForPayment,
} from '../services/payment';
import {
  getAllSettings,
  setSetting,
  getDownloadTokenHours,
  clampDownloadTokenHours,
  clampDownloadMaxCount,
  DOWNLOAD_TOKEN_HOURS_MIN,
  DOWNLOAD_TOKEN_HOURS_MAX,
  DOWNLOAD_MAX_COUNT_MIN,
  DOWNLOAD_MAX_COUNT_MAX,
} from '../services/settings';
import { listNotificationLog, type NotificationChannel, type NotificationStatus } from '../services/notificationLog';
import {
  listEmailTemplates,
  getEmailTemplate,
  setEmailTemplate,
  getTemplatePlaceholders,
  getTemplateVariables,
} from '../services/emailTemplates';
import { sendTestEmail, sendCouponDeliveryEmail } from '../services/email';
import { logNotification } from '../services/notificationLog';
import {
  listDiscountCodes,
  getDiscountCodeById,
  createDiscountCode,
  updateDiscountCode,
  deleteDiscountCode,
  type DiscountCodeInput,
} from '../services/discountCode';
import { query } from '../config/database';
import {
  listAllBlogCategories,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
} from '../services/blogCategory';
import {
  KNOWN_PERMISSIONS,
  listRolesWithPermissions,
  createRole,
  updateRole,
  deleteRole,
  setRolePermissions,
  roleExists,
} from '../services/rbac';
import {
  listSitePagesAdmin,
  getSitePageById,
  createSitePage,
  updateSitePage,
  deleteSitePage,
  type SitePageCreateInput,
} from '../services/sitePages';

const admin = Router({ mergeParams: true });

/** Lista de usuarios (id, email, name) para selector de cupón "solo para usuario". */
interface UserOption {
  id: number;
  email: string;
  name: string;
}

admin.use(requireAuth, requireContentEditorOrSuperuser);

admin.get('/post-categories', async (_req: Request, res: Response) => {
  try {
    const categories = await listAllBlogCategories();
    res.json({ categories });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.post('/post-categories', async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    const row = await createBlogCategory({
      slug: String(b.slug ?? ''),
      path_es: String(b.path_es ?? ''),
      path_en: String(b.path_en ?? ''),
      label_es: String(b.label_es ?? ''),
      label_en: String(b.label_en ?? ''),
      sort_order: b.sort_order != null ? Number(b.sort_order) : undefined,
    });
    if (!row) {
      res.status(400).json({ error: 'Datos inválidos o slug/ruta duplicado' });
      return;
    }
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.put('/post-categories/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) {
      res.status(400).json({ error: 'slug requerido' });
      return;
    }
    const b = req.body ?? {};
    const updated = await updateBlogCategory(slug, {
      slug: b.slug != null ? String(b.slug) : undefined,
      path_es: b.path_es != null ? String(b.path_es) : undefined,
      path_en: b.path_en != null ? String(b.path_en) : undefined,
      label_es: b.label_es != null ? String(b.label_es) : undefined,
      label_en: b.label_en != null ? String(b.label_en) : undefined,
      sort_order: b.sort_order != null ? Number(b.sort_order) : undefined,
    });
    if (!updated) {
      res.status(400).json({ error: 'No se pudo actualizar' });
      return;
    }
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.delete('/post-categories/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug || '').trim();
    const result = await deleteBlogCategory(slug);
    if (!result.ok) {
      res.status(400).json({ error: result.error ?? 'No se pudo eliminar' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/users', requireDiscountManager, async (_req: Request, res: Response) => {
  try {
    const q = (typeof _req.query.q === 'string' ? _req.query.q.trim() : '').toLowerCase();
    const sql = q
      ? `SELECT id, email, name FROM users WHERE deleted_at IS NULL AND (LOWER(email) LIKE $1 OR LOWER(name) LIKE $1) ORDER BY email LIMIT 200`
      : `SELECT id, email, name FROM users WHERE deleted_at IS NULL ORDER BY email LIMIT 500`;
    const params = q ? [`%${q}%`] : [];
    const { rows } = await query<UserOption>(sql, params);
    res.json({ users: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Gestión de usuarios para panel admin (listado completo, update rol/nombre, baja). */
admin.get('/users-management', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
    const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));
    const q = (typeof req.query.q === 'string' ? req.query.q.trim() : '').toLowerCase();
    const role = (req.query.role as string) || '';

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let idx = 1;
    if (q) {
      conditions.push(`(LOWER(email) LIKE $${idx} OR LOWER(name) LIKE $${idx})`);
      params.push(`%${q}%`);
      idx += 1;
    }
    if (role && (await roleExists(role))) {
      conditions.push(`role = $${idx}`);
      params.push(role);
      idx += 1;
    }
    const where = conditions.join(' AND ');

    const [countResult, dataResult] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*)::text FROM users WHERE deleted_at IS NULL AND ${where}`, params),
      query<{ id: number; email: string; name: string; role: string; created_at: string; updated_at: string }>(
        `SELECT id, email, name, role, created_at, updated_at
         FROM users
         WHERE deleted_at IS NULL AND ${where}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
    ]);

    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
    res.json({ users: dataResult.rows, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.put('/users-management/:id', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const { name, role } = req.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (typeof name === 'string' && name.trim()) {
      updates.push(`name = $${idx}`);
      params.push(name.trim());
      idx += 1;
    }
    if (typeof role === 'string' && await roleExists(role)) {
      updates.push(`role = $${idx}`);
      params.push(role);
      idx += 1;
    } else if (role !== undefined) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'No changes' });
      return;
    }
    updates.push(`updated_at = NOW()`);
    params.push(id);
    await query('UPDATE users SET ' + updates.join(', ') + ' WHERE id = $' + idx, params);
    const { rows } = await query<{ id: number; email: string; name: string; role: string; created_at: string; updated_at: string }>(
      'SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/roles', requireSuperUser, async (_req: Request, res: Response) => {
  try {
    const roles = await listRolesWithPermissions();
    res.json({ roles, availablePermissions: [...KNOWN_PERMISSIONS] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.post('/roles', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const slug = String(req.body?.slug ?? '');
    const name = String(req.body?.name ?? '');
    const description = req.body?.description != null ? String(req.body.description) : null;
    const role = await createRole({ slug, name, description });
    if (!role) {
      res.status(400).json({ error: 'Datos de rol inválidos o slug duplicado' });
      return;
    }
    res.status(201).json(role);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.put('/roles/:slug', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug || '').trim();
    const name = req.body?.name != null ? String(req.body.name) : undefined;
    const description = req.body?.description !== undefined ? (req.body.description == null ? null : String(req.body.description)) : undefined;
    const role = await updateRole(slug, { name, description });
    if (!role) {
      res.status(404).json({ error: 'Rol no encontrado' });
      return;
    }
    res.json(role);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.delete('/roles/:slug', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug || '').trim();
    const result = await deleteRole(slug);
    if (!result.ok) {
      res.status(400).json({ error: result.error ?? 'No se pudo eliminar el rol' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.put('/roles/:slug/permissions', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug || '').trim();
    const permissions = Array.isArray(req.body?.permissions)
      ? req.body.permissions.map((p: unknown) => String(p))
      : [];
    if (!(await roleExists(slug))) {
      res.status(404).json({ error: 'Rol no encontrado' });
      return;
    }
    await setRolePermissions(slug, permissions);
    const roles = await listRolesWithPermissions();
    const role = roles.find((r) => r.slug === slug);
    res.json(role ?? { slug, permissions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.delete('/users-management/:id', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const currentId = (req.user as { id: number }).id;
    if (id === currentId) {
      res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
      return;
    }
    await query('UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/notifications', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);
    const offset = parseInt((req.query.offset as string) || '0', 10);
    const channel = (req.query.channel as NotificationChannel) || undefined;
    const recipient = (req.query.recipient as string) || undefined;
    const from = (req.query.from as string) || undefined;
    const to = (req.query.to as string) || undefined;
    const status = (req.query.status as NotificationStatus) || undefined;
    const validChannels: NotificationChannel[] = ['email', 'whatsapp', 'telegram'];
    const validStatuses: NotificationStatus[] = ['sent', 'failed'];
    const { rows, total } = await listNotificationLog({
      limit,
      offset,
      channel: channel && validChannels.includes(channel) ? channel : undefined,
      recipient,
      from,
      to,
      status: status && validStatuses.includes(status) ? status : undefined,
    });
    res.json({ notifications: rows, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/email-templates', requireSuperUser, async (_req: Request, res: Response) => {
  try {
    const templates = await listEmailTemplates();
    res.json({ templates });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/email-templates/:type', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const type = String(req.params.type ?? '').trim();
    const langParam = String(req.query.language ?? '').trim().toLowerCase();
    const language = langParam === 'es' || langParam === 'en' ? langParam : 'en';
    const template = await getEmailTemplate(type, language);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({
      ...template,
      language,
      placeholders: getTemplatePlaceholders(type),
      variables: getTemplateVariables(type),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.put('/email-templates/:type', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const type = String(req.params.type ?? '').trim();
    const body = req.body as { subject?: string; body?: string; language?: string };
    const langParam = typeof body.language === 'string' ? body.language.trim().toLowerCase() : '';
    const language = langParam === 'es' || langParam === 'en' ? langParam : 'en';
    const subject = typeof body.subject === 'string' ? body.subject : '';
    const bodyText = typeof body.body === 'string' ? body.body : '';
    const updated = await setEmailTemplate(type, language, subject, bodyText);
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.post('/send-test-email', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
    if (!to) {
      res.status(400).json({ error: 'Email destination (to) is required' });
      return;
    }
    const result = await sendTestEmail({ to });
    if (result.sent) {
      res.json({ sent: true });
      return;
    }
    res.status(400).json({ error: result.error ?? 'Failed to send test email' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/discount-codes', requireDiscountManager, async (_req: Request, res: Response) => {
  try {
    const codes = await listDiscountCodes();
    res.json({ discountCodes: codes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/discount-codes/:id', requireDiscountManager, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const code = await getDiscountCodeById(id);
    if (!code) {
      res.status(404).json({ error: 'Cupón no encontrado' });
      return;
    }
    res.json(code);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function parseDiscountCodeBody(body: unknown): DiscountCodeInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const code = typeof b.code === 'string' ? b.code.trim() : '';
  const scope = b.scope === 'post' ? 'post' : b.scope === 'global' ? 'global' : 'global';
  const discount_type = b.discount_type === 'percent' ? 'percent' : b.discount_type === 'fixed' ? 'fixed' : 'percent';
  const discount_value = typeof b.discount_value === 'number' ? b.discount_value : parseFloat(String(b.discount_value ?? 0));
  const post_id = b.post_id != null ? parseInt(String(b.post_id), 10) : undefined;
  let categories: string[] | null = null;
  if (Array.isArray(b.categories) && b.categories.length > 0) {
    categories = (b.categories as string[]).filter((c) => isValidCategory(String(c)));
  }
  const valid_from = typeof b.valid_from === 'string' ? b.valid_from : undefined;
  const valid_until = typeof b.valid_until === 'string' ? b.valid_until : undefined;
  const usage_limit_total = b.usage_limit_total != null ? parseInt(String(b.usage_limit_total), 10) : undefined;
  const usage_limit_per_user = b.usage_limit_per_user != null ? parseInt(String(b.usage_limit_per_user), 10) : undefined;
  const min_purchase_usd = b.min_purchase_usd != null ? parseFloat(String(b.min_purchase_usd)) : undefined;
  const description = typeof b.description === 'string' ? b.description : undefined;
  let allowed_user_id: number | null | undefined =
    b.allowed_user_id === null || b.allowed_user_id === ''
      ? null
      : b.allowed_user_id != null
        ? (() => {
            const n = parseInt(String(b.allowed_user_id), 10);
            return Number.isFinite(n) ? n : undefined;
          })()
        : undefined;
  const campaign_slug =
    b.campaign_slug === null || (typeof b.campaign_slug === 'string' && !b.campaign_slug.trim())
      ? null
      : typeof b.campaign_slug === 'string'
        ? b.campaign_slug.trim().toLowerCase()
        : undefined;
  return {
    code,
    description: description ?? undefined,
    discount_type,
    discount_value: Number.isFinite(discount_value) ? discount_value : 0,
    scope,
    post_id: scope === 'post' ? (Number.isFinite(post_id) ? post_id : undefined) : undefined,
    categories: scope === 'global' ? categories : undefined,
    valid_from: valid_from || undefined,
    valid_until: valid_until || undefined,
    usage_limit_total: usage_limit_total != null && Number.isFinite(usage_limit_total) ? usage_limit_total : undefined,
    usage_limit_per_user: usage_limit_per_user != null && Number.isFinite(usage_limit_per_user) ? usage_limit_per_user : undefined,
    min_purchase_usd: min_purchase_usd != null && Number.isFinite(min_purchase_usd) ? min_purchase_usd : undefined,
    allowed_user_id: allowed_user_id === undefined ? undefined : allowed_user_id,
    campaign_slug: campaign_slug === undefined ? undefined : campaign_slug ?? null,
  };
}

admin.post('/discount-codes', requireDiscountManager, async (req: Request, res: Response) => {
  try {
    const input = parseDiscountCodeBody(req.body);
    if (!input || !input.code) {
      res.status(400).json({ error: 'code es requerido' });
      return;
    }
    if (input.scope === 'post' && !input.post_id) {
      res.status(400).json({ error: 'post_id es requerido cuando scope es post' });
      return;
    }
    const created = await createDiscountCode(input);
    res.status(201).json(created);
  } catch (e: unknown) {
    console.error(e);
    const err = e as { code?: string };
    if (err.code === '23505') {
      res.status(400).json({ error: 'Ya existe un cupón con ese slug de campaña. Solo puede haber uno por slug.' });
      return;
    }
    res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
});

admin.put('/discount-codes/:id', requireDiscountManager, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const input = parseDiscountCodeBody(req.body);
    if (!input) {
      res.status(400).json({ error: 'Body inválido' });
      return;
    }
    const updated = await updateDiscountCode(id, input);
    if (!updated) {
      res.status(404).json({ error: 'Cupón no encontrado' });
      return;
    }
    res.json(updated);
  } catch (e: unknown) {
    console.error(e);
    const err = e as { code?: string };
    if (err.code === '23505') {
      res.status(400).json({ error: 'Ya existe un cupón con ese slug de campaña. Solo puede haber uno por slug.' });
      return;
    }
    res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
});

admin.delete('/discount-codes/:id', requireDiscountManager, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const deleted = await deleteDiscountCode(id);
    if (!deleted) {
      res.status(404).json({ error: 'Cupón no encontrado' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Envía por email un cupón a una dirección (usuario existente o invitación a nuevo). Plantilla coupon_delivery. */
admin.post('/send-coupon-email', requireDiscountManager, async (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const discountCodeId = parseInt(String(req.body?.discountCodeId), 10);
    if (!email || !Number.isFinite(discountCodeId)) {
      res.status(400).json({ error: 'email y discountCodeId requeridos' });
      return;
    }
    const { rows: userRows } = await query<{ id: number; email: string; name: string; preferred_language: string | null }>(
      'SELECT id, email, name, preferred_language FROM users WHERE LOWER(email) = $1',
      [email]
    );
    const targetUser = userRows[0];
    const toName = targetUser ? (targetUser.name || targetUser.email) : email;
    const preferredLanguage = targetUser?.preferred_language ?? 'en';
    const coupon = await getDiscountCodeById(discountCodeId);
    if (!coupon) {
      res.status(404).json({ error: 'Cupón no encontrado' });
      return;
    }
    if (coupon.campaign_slug != null) {
      res.status(400).json({ error: 'No se puede enviar un cupón de campaña (plantilla). Elige un cupón con código concreto.' });
      return;
    }
    if (coupon.allowed_user_id != null) {
      if (!targetUser || coupon.allowed_user_id !== targetUser.id) {
        res.status(400).json({ error: 'Ese cupón está asignado a un usuario concreto. No se puede enviar a otro destinatario.' });
        return;
      }
    }
    const base = env.FRONTEND_URL.replace(/\/$/, '');
    const couponUrl = `${base}/?coupon=${encodeURIComponent(coupon.code)}`;
    const result = await sendCouponDeliveryEmail({
      to: email,
      name: toName,
      couponCode: coupon.code,
      couponUrl,
      preferredLanguage,
    });
    await logNotification({
      channel: 'email',
      recipient: email,
      subject_or_template: 'coupon_delivery',
      related_type: 'discount_code',
      related_id: coupon.id,
      status: result.sent ? 'sent' : 'failed',
      error_message: result.error ?? null,
    });
    if (!result.sent && result.error) {
      res.status(500).json({ error: result.error });
      return;
    }
    res.json({ sent: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
});

admin.get('/payments', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);
    const offset = parseInt((req.query.offset as string) || '0', 10);
    const from = (req.query.from as string) || undefined;
    const to = (req.query.to as string) || undefined;
    const timezone = typeof req.query.timezone === 'string' && /^[A-Za-z0-9_\/+-]+$/.test(req.query.timezone.trim()) ? req.query.timezone.trim() : undefined;
    const postId = req.query.postId != null ? parseInt(String(req.query.postId), 10) : undefined;
    const status = (req.query.status as string) || undefined;
    const sortBy = (req.query.sortBy as string) || undefined;
    const sortOrder = (req.query.sortOrder as string) || undefined;
    const validSort =
      sortBy && ['created_at', 'amount_usd', 'status', 'provider', 'post_title'].includes(sortBy) ? sortBy : undefined;
    const validOrder = sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined;
    const { payments, total } = await listPayments({
      limit,
      offset,
      from,
      to,
      timezone,
      postId: postId !== undefined && !Number.isNaN(postId) ? postId : undefined,
      status: status || undefined,
      sortBy: validSort,
      sortOrder: validOrder,
    });
    res.json({ payments, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/payments/stats', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const from = (req.query.from as string) || undefined;
    const to = (req.query.to as string) || undefined;
    const timezone = typeof req.query.timezone === 'string' && /^[A-Za-z0-9_\/+-]+$/.test(req.query.timezone.trim()) ? req.query.timezone.trim() : undefined;
    const postId = req.query.postId != null ? parseInt(String(req.query.postId), 10) : undefined;
    const provider = (req.query.provider as string) || undefined;
    const stats = await getPaymentStats({
      from,
      to,
      timezone,
      postId: postId !== undefined && !Number.isNaN(postId) ? postId : undefined,
      provider,
    });
    res.json(stats);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.post('/payments/:id/regenerate-download-token', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid payment id' });
      return;
    }
    const payment = await getPaymentById(id);
    if (!payment) {
      res.status(404).json({ error: 'Payment not found' });
      return;
    }
    if (payment.status !== 'captured') {
      res.status(400).json({ error: 'Solo se puede regenerar link para pagos capturados' });
      return;
    }
    const { downloadUrl, expiresAt } = await createDownloadUrlForPayment(payment.post_id);
    res.json({ downloadUrl, expiresAt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const NOTIFICATION_KEYS = [
  'email_enabled', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_from',
] as const;
const WELCOME_COUPON_KEYS = ['welcome_with_coupon_enabled', 'welcome_campaign_discount_code_id'] as const;
const SMTP_PASS_KEY = 'smtp_pass';

admin.get('/settings', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const settings = await getAllSettings();
    if (settings[SMTP_PASS_KEY]) {
      (settings as Record<string, string>).smtp_pass_set = '1';
      delete settings[SMTP_PASS_KEY];
    }
    res.json(settings);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.put('/settings', requireSuperUser, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (body.download_token_hours !== undefined) {
      const hours = clampDownloadTokenHours(Number(body.download_token_hours));
      await setSetting('download_token_hours', String(hours));
    }
    if (body.download_max_count !== undefined) {
      const maxCount = clampDownloadMaxCount(Number(body.download_max_count));
      await setSetting('download_max_count', String(maxCount));
    }
    for (const key of NOTIFICATION_KEYS) {
      if (body[key] !== undefined) {
        const v = body[key];
        if (typeof v === 'boolean') await setSetting(key, v ? 'true' : 'false');
        else if (typeof v === 'string') await setSetting(key, v);
        else if (typeof v === 'number') await setSetting(key, String(v));
      }
    }
    for (const key of WELCOME_COUPON_KEYS) {
      if (body[key] !== undefined) {
        const v = body[key];
        if (key === 'welcome_with_coupon_enabled') await setSetting(key, v === true || v === 'true' || v === '1' ? 'true' : 'false');
        else if (key === 'welcome_campaign_discount_code_id') await setSetting(key, v === null || v === '' || v === undefined ? '' : String(v));
      }
    }
    if (body.site_title !== undefined && typeof body.site_title === 'string') {
      await setSetting('site_title', body.site_title.trim());
    }
    if (body.site_slogan !== undefined && typeof body.site_slogan === 'string') {
      await setSetting('site_slogan', body.site_slogan.trim());
    }
    if (body.landing_value_bg_url !== undefined) {
      const v = typeof body.landing_value_bg_url === 'string' ? body.landing_value_bg_url.trim() : '';
      await setSetting('landing_value_bg_url', v);
    }
    if (body.smtp_pass !== undefined && typeof body.smtp_pass === 'string' && body.smtp_pass.trim() !== '') {
      await setSetting(SMTP_PASS_KEY, body.smtp_pass);
    }
    const settings = await getAllSettings();
    if (settings[SMTP_PASS_KEY]) {
      (settings as Record<string, string>).smtp_pass_set = '1';
      delete settings[SMTP_PASS_KEY];
    }
    res.json(settings);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Estado de credenciales de pago (solo indicadores "configurado"/"no configurado"; sin valores). */
admin.get('/settings/payment-credentials', requireSuperUser, (_req: Request, res: Response) => {
  const paypal =
    Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_ID.trim()) &&
    Boolean(env.PAYPAL_CLIENT_SECRET && env.PAYPAL_CLIENT_SECRET.trim());
  const binancePay =
    Boolean(env.BINANCE_PAY_API_KEY && env.BINANCE_PAY_API_KEY.trim()) &&
    Boolean(env.BINANCE_PAY_SECRET_KEY && env.BINANCE_PAY_SECRET_KEY.trim());
  const binanceTransfer =
    Boolean(env.BINANCE_API_KEY && env.BINANCE_API_KEY.trim()) &&
    Boolean(env.BINANCE_SECRET_KEY && env.BINANCE_SECRET_KEY.trim());
  res.json({
    paypal,
    paypalMode: env.PAYPAL_MODE,
    binancePay,
    binanceTransfer,
  });
});

admin.get('/settings/schema', requireSuperUser, (_req: Request, res: Response) => {
  res.json({
    download_token_hours: {
      min: DOWNLOAD_TOKEN_HOURS_MIN,
      max: DOWNLOAD_TOKEN_HOURS_MAX,
      description: 'Vigencia del link de descarga en horas',
    },
    download_max_count: {
      min: DOWNLOAD_MAX_COUNT_MIN,
      max: DOWNLOAD_MAX_COUNT_MAX,
      description: 'Número máximo de descargas permitidas por enlace (en su vigencia)',
    },
    email_enabled: { type: 'boolean', description: 'Activar envío de emails (SMTP)' },
    smtp_host: { type: 'string', description: 'Servidor SMTP' },
    smtp_port: { type: 'number', description: 'Puerto (ej. 587, 465)' },
    smtp_secure: { type: 'boolean', description: 'Usar TLS (puerto 465)' },
    smtp_user: { type: 'string', description: 'Usuario SMTP' },
    smtp_from: { type: 'string', description: 'Email remitente (opcional)' },
  });
});

admin.get('/posts', async (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string) || undefined;
    const published =
      req.query.published === 'true' ? true : req.query.published === 'false' ? false : undefined;
    const search = (req.query.search as string) || undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
    const offset = parseInt((req.query.offset as string) || '0', 10);
    const sortBy = (req.query.sortBy as string) || undefined;
    const sortOrder = (req.query.sortOrder as string) || undefined;
    const validSortBy = sortBy === 'published_at' || sortBy === 'views' ? sortBy : undefined;
    const validSortOrder = sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined;

    if (category && !isValidCategory(category)) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }

    const { posts, total } = await listAdminPosts({
      category: category as BlogCategory | undefined,
      published,
      search,
      limit,
      offset,
      sortBy: validSortBy,
      sortOrder: validSortOrder,
    });
    res.json({ posts, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/posts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const post = await getPostById(id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json(post);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/posts/:id/payments', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const post = await getPostById(id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const payments = await listPaymentsByPostId(id);
    res.json({ post_title: post.title, payments });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.post('/posts', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const authorId = (req.user as { id: number }).id;

    const title = String(body.title ?? '').trim();
    const category = String(body.category ?? '').trim();
    const content = String(body.content ?? '').trim();

    if (!title || !category || !content) {
      res.status(400).json({ error: 'title, category and content are required' });
      return;
    }
    if (!isValidCategory(category)) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }

    const gallery = Array.isArray(body.gallery)
      ? body.gallery.map((u: unknown) => String(u))
      : body.gallery != null
        ? [String(body.gallery)]
        : null;
    const input: BlogPostCreateInput = {
      title,
      category: category as BlogCategory,
      content,
      excerpt: body.excerpt != null ? String(body.excerpt) : null,
      featured_image: body.featured_image != null ? String(body.featured_image) : null,
      author_id: authorId,
      published: Boolean(body.published),
      published_at: body.published_at != null ? String(body.published_at) : null,
      meta_title: body.meta_title != null ? String(body.meta_title) : null,
      meta_description: body.meta_description != null ? String(body.meta_description) : null,
      meta_keywords: body.meta_keywords != null ? String(body.meta_keywords) : null,
      language: (body.language as string) ?? 'es',
      related_title: body.related_title != null ? String(body.related_title) : null,
      related_year: body.related_year != null ? String(body.related_year) : null,
      video_url: body.video_url != null ? String(body.video_url).trim() || null : null,
      gallery: gallery && gallery.length > 0 ? gallery : null,
      conclusion: body.conclusion != null ? String(body.conclusion) : null,
      has_download: body.has_download !== undefined ? Boolean(body.has_download) : undefined,
      download_price_usd: body.download_price_usd != null ? Number(body.download_price_usd) : undefined,
      payment_methods: Array.isArray(body.payment_methods)
        ? body.payment_methods.map((m: unknown) => String(m)).filter((m: string) => ['paypal', 'binance_pay', 'binance_deposit'].includes(m))
        : undefined,
      download_free: body.download_free !== undefined ? Boolean(body.download_free) : undefined,
    };

    const post = await createPost(input, authorId);
    res.status(201).json(post);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.put('/posts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const category = body.category != null ? String(body.category).trim() : undefined;
    if (category !== undefined && !isValidCategory(category)) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }

    const input: Partial<BlogPostCreateInput> & { published_at?: string | null } = {
      title: body.title != null ? String(body.title).trim() : undefined,
      category: category as BlogCategory | undefined,
      content: body.content != null ? String(body.content) : undefined,
      excerpt: body.excerpt !== undefined ? (body.excerpt == null ? null : String(body.excerpt)) : undefined,
      featured_image:
        body.featured_image !== undefined
          ? (body.featured_image == null ? null : String(body.featured_image))
          : undefined,
      published: body.published !== undefined ? Boolean(body.published) : undefined,
      published_at: body.published_at !== undefined ? (body.published_at == null ? null : String(body.published_at)) : undefined,
      meta_title: body.meta_title !== undefined ? (body.meta_title == null ? null : String(body.meta_title)) : undefined,
      meta_description:
        body.meta_description !== undefined
          ? (body.meta_description == null ? null : String(body.meta_description))
          : undefined,
      meta_keywords:
        body.meta_keywords !== undefined
          ? (body.meta_keywords == null ? null : String(body.meta_keywords))
          : undefined,
      language: body.language !== undefined ? String(body.language) : undefined,
      related_title:
        body.related_title !== undefined ? (body.related_title == null ? null : String(body.related_title)) : undefined,
      related_year:
        body.related_year !== undefined ? (body.related_year == null ? null : String(body.related_year)) : undefined,
      video_url:
        body.video_url !== undefined ? (body.video_url == null ? null : String(body.video_url).trim() || null) : undefined,
      gallery:
        body.gallery !== undefined
          ? (Array.isArray(body.gallery) ? body.gallery.map((u: unknown) => String(u)) : body.gallery == null ? null : [String(body.gallery)])
          : undefined,
      conclusion:
        body.conclusion !== undefined ? (body.conclusion == null ? null : String(body.conclusion)) : undefined,
      has_download: body.has_download !== undefined ? Boolean(body.has_download) : undefined,
      download_price_usd: body.download_price_usd !== undefined ? Number(body.download_price_usd) : undefined,
      payment_methods:
        body.payment_methods !== undefined
          ? (Array.isArray(body.payment_methods)
              ? body.payment_methods.map((m: unknown) => String(m)).filter((m: string) => ['paypal', 'binance_pay', 'binance_deposit'].includes(m))
              : undefined)
          : undefined,
      download_free: body.download_free !== undefined ? Boolean(body.download_free) : undefined,
    };

    const post = await updatePost(id, input);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json(post);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/posts/:id/download', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const post = await getPostById(id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const download = await getPostDownloadByPostId(id);
    if (!download) {
      res.json({ hasFile: false });
      return;
    }
    res.json({ hasFile: true, filename_display: download.filename_display });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.post('/posts/:id/download', uploadDownload.single('file'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const post = await getPostById(id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const existing = await getPostDownloadByPostId(id);
    if (existing) {
      const oldPath = path.join(downloadsDir, existing.file_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const encodedFilename = buildDownloadFilename({
      id: post.id,
      slug: post.slug,
      published_at: post.published_at,
      created_at: post.created_at,
    });
    const targetPath = path.join(downloadsDir, encodedFilename);
    fs.renameSync(req.file.path, targetPath);
    const filenameDisplay = req.file.originalname || encodedFilename;
    await setPostDownload(id, encodedFilename, filenameDisplay, req.file.size);
    const download = await getPostDownloadByPostId(id);
    res.json({ hasFile: true, filename_display: download!.filename_display });
  } catch (e) {
    console.error(e);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Upload failed' });
  }
});

admin.delete('/posts/:id/download', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const existing = await getPostDownloadByPostId(id);
    if (existing) {
      const filePath = path.join(downloadsDir, existing.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await deletePostDownload(id);
    res.json({ hasFile: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.post('/posts/:id/generate-test-download-link', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const post = await getPostById(id);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const download = await getPostDownloadByPostId(id);
    if (!download) {
      res.status(400).json({ error: 'Este post no tiene archivo de descarga. Sube un ZIP primero.' });
      return;
    }
    const hours = await getDownloadTokenHours();
    const { token, expires_at } = await createDownloadToken(id, hours);
    const baseUrl = env.API_URL.replace(/\/$/, '');
    const downloadUrl = `${baseUrl}/api/download/${token}`;
    res.json({ downloadUrl, expiresAt: expires_at });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.delete('/posts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const deleted = await deletePost(id);
    if (!deleted) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/site-pages', async (_req: Request, res: Response) => {
  try {
    const pages = await listSitePagesAdmin();
    res.json({ pages });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.get('/site-pages/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const page = await getSitePageById(id);
    if (!page) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ page });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.post('/site-pages', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const language = String(body.language || 'es').toLowerCase() === 'en' ? 'en' : 'es';
    const sortRaw = body.sort_order;
    const sort_order =
      typeof sortRaw === 'number' && Number.isFinite(sortRaw)
        ? sortRaw
        : parseInt(String(sortRaw ?? '0'), 10) || 0;
    const created = await createSitePage({
      slug: String(body.slug || ''),
      language,
      title: String(body.title || ''),
      body_html: String(body.body_html ?? ''),
      meta_title: body.meta_title,
      meta_description: body.meta_description,
      published: Boolean(body.published),
      sort_order,
    });
    if (!created) {
      res.status(400).json({ error: 'Invalid slug or title' });
      return;
    }
    res.status(201).json({ page: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.put('/site-pages/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body || {};
    const patch: Partial<SitePageCreateInput> = {};
    if (body.slug !== undefined) patch.slug = String(body.slug);
    if (body.title !== undefined) patch.title = String(body.title);
    if (body.body_html !== undefined) patch.body_html = String(body.body_html);
    if (body.meta_title !== undefined) patch.meta_title = body.meta_title;
    if (body.meta_description !== undefined) patch.meta_description = body.meta_description;
    if (body.published !== undefined) patch.published = Boolean(body.published);
    if (body.sort_order !== undefined) {
      const s = body.sort_order;
      patch.sort_order = typeof s === 'number' && Number.isFinite(s) ? s : parseInt(String(s), 10) || 0;
    }
    if (body.language !== undefined) {
      patch.language = String(body.language).toLowerCase() === 'en' ? 'en' : 'es';
    }
    const updated = await updateSitePage(id, patch);
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ page: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.delete('/site-pages/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const ok = await deleteSitePage(id);
    if (!ok) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

admin.post('/generate-post', async (req: Request, res: Response) => {
  try {
    const topic = String(req.body?.topic ?? '').trim();
    const langParam = String(req.body?.language ?? 'es').toLowerCase();
    const language = langParam === 'en' ? 'en' : 'es';

    if (!topic) {
      res.status(400).json({ error: 'topic is required' });
      return;
    }

    const provider = getLLMProvider();
    if (!provider) {
      res.status(400).json({ error: 'LLM no configurado: define GROQ_API_KEY o SILICONFLOW_API_KEY y LLM_PROVIDER.' });
      return;
    }
    const apiKeyOverride = (req.body?.api_key as string)?.trim();
    const { post: generated, prompt_sent, usage } = await generatePostWithLLM(topic, language, apiKeyOverride || undefined);
    const authorId = (req.user as { id: number }).id;

    const created = await createPost(
      {
        ...generated,
        published: false,
        language,
      },
      authorId
    );

    res.status(201).json({
      post: created,
      prompt_sent,
      usage,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Failed to generate post',
    });
  }
});

export const blogAdminRouter = admin;
