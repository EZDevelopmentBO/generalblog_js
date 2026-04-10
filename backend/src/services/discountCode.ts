import { query } from '../config/database';
import type { BlogCategory } from '../types';

export interface DiscountCodeRow {
  id: number;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: string;
  scope: 'global' | 'post';
  post_id: number | null;
  categories: string[] | null;
  valid_from: string | null;
  valid_until: string | null;
  usage_limit_total: number | null;
  usage_count: number;
  usage_limit_per_user: number | null;
  min_purchase_usd: string | null;
  allowed_user_id: number | null;
  campaign_slug: string | null;
  created_at: string;
  updated_at: string;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export interface ValidateResult {
  valid: boolean;
  discountedAmount?: number;
  discountCodeId?: number;
  amountBeforeDiscount?: number;
  error?: string;
}

/**
 * Valida un cupón para un post y monto dados. Devuelve el monto final a cobrar si es válido.
 */
export async function validateCode(params: {
  code: string;
  postId: number;
  postCategory: BlogCategory;
  userId: number | null;
  amountUsd: number;
}): Promise<ValidateResult> {
  const normalized = normalizeCode(params.code);
  if (!normalized) {
    return { valid: false, error: 'Código vacío' };
  }

  const { rows } = await query<DiscountCodeRow>(
    'SELECT * FROM discount_codes WHERE UPPER(TRIM(code)) = $1',
    [normalized]
  );
  const row = rows[0];
  if (!row) {
    return { valid: false, error: 'Código no válido o no encontrado' };
  }

  if (row.allowed_user_id != null && row.allowed_user_id !== params.userId) {
    return { valid: false, error: 'Este código no es válido para tu cuenta' };
  }

  const now = new Date();

  if (row.valid_from) {
    const from = new Date(row.valid_from);
    if (now < from) {
      return { valid: false, error: 'Este código aún no está vigente' };
    }
  }
  if (row.valid_until) {
    const until = new Date(row.valid_until);
    if (now > until) {
      return { valid: false, error: 'Este código ha caducado' };
    }
  }

  if (row.scope === 'post') {
    if (row.post_id !== params.postId) {
      return { valid: false, error: 'Este código no aplica a este contenido' };
    }
  } else {
    if (row.categories != null && row.categories.length > 0) {
      if (!row.categories.includes(params.postCategory)) {
        return { valid: false, error: 'Este código no aplica a la categoría de este contenido' };
      }
    }
  }

  if (row.usage_limit_total != null && row.usage_count >= row.usage_limit_total) {
    return { valid: false, error: 'Este código ya no tiene usos disponibles' };
  }

  if (row.usage_limit_per_user != null && params.userId != null) {
    const { rows: useRows } = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM discount_code_uses
       WHERE discount_code_id = $1 AND user_id = $2`,
      [row.id, params.userId]
    );
    const usedByUser = parseInt(useRows[0]?.count ?? '0', 10);
    if (usedByUser >= row.usage_limit_per_user) {
      return { valid: false, error: 'Ya has usado este código el máximo de veces permitido' };
    }
  }

  const minPurchase = row.min_purchase_usd != null ? parseFloat(row.min_purchase_usd) : null;
  if (minPurchase != null && params.amountUsd < minPurchase) {
    return {
      valid: false,
      error: `Compra mínima para este código: $${minPurchase.toFixed(2)} USD`,
    };
  }

  const amount = params.amountUsd;
  let discounted: number;
  if (row.discount_type === 'percent') {
    const pct = parseFloat(row.discount_value);
    discounted = amount * (1 - pct / 100);
  } else {
    const fixed = parseFloat(row.discount_value);
    discounted = Math.max(0, amount - fixed);
  }
  discounted = Math.round(discounted * 100) / 100;
  if (discounted < 0) discounted = 0;
  if (discounted >= amount) {
    return { valid: false, error: 'El descuento no aplica correctamente' };
  }

  return {
    valid: true,
    discountedAmount: discounted,
    discountCodeId: row.id,
    amountBeforeDiscount: amount,
  };
}

/**
 * Registra el uso del cupón al capturar el pago. Incrementa usage_count.
 */
export async function recordUse(params: {
  discountCodeId: number;
  paymentId: number;
  userId: number | null;
}): Promise<void> {
  await query(
    `INSERT INTO discount_code_uses (discount_code_id, payment_id, user_id) VALUES ($1, $2, $3)`,
    [params.discountCodeId, params.paymentId, params.userId]
  );
  await query(
    'UPDATE discount_codes SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1',
    [params.discountCodeId]
  );
}

export interface CouponInfoForDisplay {
  valid: boolean;
  code: string;
  discount_type?: 'percent' | 'fixed';
  discount_value?: number;
  description?: string | null;
  error?: string;
}

/**
 * Devuelve información del cupón para mostrar en banner (sin postId).
 * Solo cupones no plantilla (sin campaign_slug) o cupones asignados al usuario.
 */
export async function getCouponInfoForDisplay(
  code: string,
  userId: number | null
): Promise<CouponInfoForDisplay> {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return { valid: false, code: normalized || code, error: 'Código vacío' };
  }
  const { rows } = await query<DiscountCodeRow>(
    'SELECT * FROM discount_codes WHERE UPPER(TRIM(code)) = $1',
    [normalized]
  );
  const row = rows[0];
  if (!row) {
    return { valid: false, code: normalized, error: 'Código no encontrado' };
  }
  if (row.campaign_slug != null) {
    return { valid: false, code: normalized, error: 'Este código es de campaña; úsalo al registrarte' };
  }
  if (row.allowed_user_id != null && row.allowed_user_id !== userId) {
    return { valid: false, code: normalized, error: 'Este código no es válido para tu cuenta' };
  }
  const now = new Date();
  if (row.valid_from) {
    const from = new Date(row.valid_from);
    if (now < from) {
      return { valid: false, code: normalized, error: 'Este código aún no está vigente' };
    }
  }
  if (row.valid_until) {
    const until = new Date(row.valid_until);
    if (now > until) {
      return { valid: false, code: normalized, error: 'Este código ha caducado' };
    }
  }
  if (row.usage_limit_total != null && row.usage_count >= row.usage_limit_total) {
    return { valid: false, code: normalized, error: 'Este código ya no tiene usos disponibles' };
  }
  const discountValue = parseFloat(row.discount_value);
  return {
    valid: true,
    code: row.code,
    discount_type: row.discount_type,
    discount_value: discountValue,
    description: row.description,
  };
}

/**
 * Busca un cupón plantilla de campaña por slug (para bienvenida con cupón).
 */
export async function findDiscountByCampaignSlug(slug: string): Promise<DiscountCodeRow | null> {
  const normalized = (slug || '').trim().toLowerCase();
  if (!normalized) return null;
  const { rows } = await query<DiscountCodeRow>(
    'SELECT * FROM discount_codes WHERE campaign_slug = $1',
    [normalized]
  );
  return rows[0] ?? null;
}

/**
 * Crea un cupón de uso único para un usuario a partir de una campaña (clona la plantilla).
 */
export async function createUserCampaignCoupon(
  userId: number,
  campaignSlug: string
): Promise<DiscountCodeRow | null> {
  const template = await findDiscountByCampaignSlug(campaignSlug);
  if (!template) return null;
  const shortId = Math.random().toString(36).slice(2, 8).toUpperCase();
  const code = `WELCOME-${userId}-${shortId}`;
  const { rows } = await query<DiscountCodeRow>(
    `INSERT INTO discount_codes (
      code, description, discount_type, discount_value, scope, post_id, categories,
      valid_from, valid_until, usage_limit_total, usage_limit_per_user, min_purchase_usd,
      allowed_user_id, campaign_slug, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 1, $10, $11, NULL, NOW())
    RETURNING *`,
    [
      code,
      template.description,
      template.discount_type,
      template.discount_value,
      template.scope,
      template.post_id,
      template.categories,
      template.valid_from,
      template.valid_until,
      template.min_purchase_usd,
      userId,
    ]
  );
  return rows[0] ?? null;
}

export async function listDiscountCodes(): Promise<DiscountCodeRow[]> {
  const { rows } = await query<DiscountCodeRow>(
    'SELECT * FROM discount_codes ORDER BY created_at DESC'
  );
  return rows;
}

export async function getDiscountCodeById(id: number): Promise<DiscountCodeRow | null> {
  const { rows } = await query<DiscountCodeRow>('SELECT * FROM discount_codes WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export interface DiscountCodeInput {
  code: string;
  description?: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  scope: 'global' | 'post';
  post_id?: number | null;
  categories?: BlogCategory[] | null;
  valid_from?: string | null;
  valid_until?: string | null;
  usage_limit_total?: number | null;
  usage_limit_per_user?: number | null;
  min_purchase_usd?: number | null;
  allowed_user_id?: number | null;
  campaign_slug?: string | null;
}

export async function createDiscountCode(input: DiscountCodeInput): Promise<DiscountCodeRow> {
  const code = normalizeCode(input.code);
  if (!code) throw new Error('El código no puede estar vacío');
  const categories = input.categories?.length ? input.categories : null;
  const campaignSlug = input.campaign_slug?.trim().toLowerCase() || null;
  const { rows } = await query<DiscountCodeRow>(
    `INSERT INTO discount_codes (
      code, description, discount_type, discount_value, scope, post_id, categories,
      valid_from, valid_until, usage_limit_total, usage_limit_per_user, min_purchase_usd,
      allowed_user_id, campaign_slug, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    RETURNING *`,
    [
      code,
      input.description?.trim() || null,
      input.discount_type,
      input.discount_value,
      input.scope,
      input.scope === 'post' ? input.post_id ?? null : null,
      categories,
      input.valid_from?.trim() || null,
      input.valid_until?.trim() || null,
      input.usage_limit_total ?? null,
      input.usage_limit_per_user ?? null,
      input.min_purchase_usd ?? null,
      input.allowed_user_id ?? null,
      campaignSlug,
    ]
  );
  return rows[0];
}

export async function updateDiscountCode(id: number, input: Partial<DiscountCodeInput>): Promise<DiscountCodeRow | null> {
  const existing = await getDiscountCodeById(id);
  if (!existing) return null;
  const scope = input.scope ?? existing.scope;
  const post_id = scope === 'post' ? (input.post_id ?? existing.post_id) : null;
  const categories = input.categories !== undefined ? (input.categories?.length ? input.categories : null) : existing.categories;
  const code = input.code != null ? normalizeCode(input.code) || existing.code : existing.code;
  const campaignSlug =
    input.campaign_slug !== undefined
      ? (input.campaign_slug?.trim().toLowerCase() || null)
      : existing.campaign_slug;
  const { rows } = await query<DiscountCodeRow>(
    `UPDATE discount_codes SET
      code = $2, description = $3, discount_type = $4, discount_value = $5, scope = $6, post_id = $7,
      categories = $8, valid_from = $9, valid_until = $10, usage_limit_total = $11, usage_limit_per_user = $12,
      min_purchase_usd = $13, allowed_user_id = $14, campaign_slug = $15, updated_at = NOW()
    WHERE id = $1 RETURNING *`,
    [
      id,
      code,
      input.description !== undefined ? input.description?.trim() || null : existing.description,
      input.discount_type ?? existing.discount_type,
      input.discount_value !== undefined ? input.discount_value : parseFloat(existing.discount_value),
      scope,
      post_id,
      categories,
      input.valid_from !== undefined ? (input.valid_from?.trim() || null) : existing.valid_from,
      input.valid_until !== undefined ? (input.valid_until?.trim() || null) : existing.valid_until,
      input.usage_limit_total !== undefined ? input.usage_limit_total : existing.usage_limit_total,
      input.usage_limit_per_user !== undefined ? input.usage_limit_per_user : existing.usage_limit_per_user,
      input.min_purchase_usd !== undefined ? input.min_purchase_usd : (existing.min_purchase_usd != null ? parseFloat(existing.min_purchase_usd) : null),
      input.allowed_user_id !== undefined ? input.allowed_user_id : existing.allowed_user_id,
      campaignSlug,
    ]
  );
  return rows[0] ?? null;
}

export async function deleteDiscountCode(id: number): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM discount_codes WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
