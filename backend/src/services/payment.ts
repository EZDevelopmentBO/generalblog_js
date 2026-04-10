import { query } from '../config/database';
import { createDownloadToken } from './downloadToken';
import { getDownloadTokenHours } from './settings';
import { env } from '../config/env';

export interface PaymentRow {
  id: number;
  post_id: number;
  user_id: number | null;
  provider: string;
  amount_usd: number;
  status: string;
  captured_at: string | null;
  created_at: string;
  paypal_order_id: string | null;
  paypal_payer_id: string | null;
  payer_email: string | null;
  binance_deposit_reference?: string | null;
  binance_deposit_expected_amount?: string | null;
  binance_deposit_tx_id?: string | null;
  binance_deposit_from_address?: string | null;
  binance_deposit_network?: string | null;
  discount_code_id?: number | null;
  amount_before_discount?: number | null;
}

export async function createPayment(params: {
  post_id: number;
  provider: 'paypal' | 'binance_pay' | 'binance_deposit' | 'free_download';
  amount_usd: number;
  user_id?: number | null;
  paypal_order_id?: string | null;
  binance_merchant_trade_no?: string | null;
  binance_prepay_id?: string | null;
  binance_deposit_reference?: string | null;
  binance_deposit_expected_amount?: string | number | null;
  discount_code_id?: number | null;
  amount_before_discount?: number | null;
}): Promise<PaymentRow> {
  const { rows } = await query<PaymentRow>(
    `INSERT INTO payments (post_id, provider, amount_usd, status, user_id, paypal_order_id, binance_merchant_trade_no, binance_prepay_id, binance_deposit_reference, binance_deposit_expected_amount, discount_code_id, amount_before_discount)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      params.post_id,
      params.provider,
      params.amount_usd,
      params.user_id ?? null,
      params.paypal_order_id ?? null,
      params.binance_merchant_trade_no ?? null,
      params.binance_prepay_id ?? null,
      params.binance_deposit_reference ?? null,
      params.binance_deposit_expected_amount != null ? String(params.binance_deposit_expected_amount) : null,
      params.discount_code_id ?? null,
      params.amount_before_discount ?? null,
    ]
  );
  return rows[0];
}

export async function getPaymentByPaypalOrderId(orderId: string): Promise<PaymentRow | null> {
  const { rows } = await query<PaymentRow>(
    'SELECT * FROM payments WHERE paypal_order_id = $1',
    [orderId]
  );
  return rows[0] ?? null;
}

export async function getPaymentByBinanceMerchantTradeNo(merchantTradeNo: string): Promise<PaymentRow | null> {
  const { rows } = await query<PaymentRow>(
    'SELECT * FROM payments WHERE binance_merchant_trade_no = $1',
    [merchantTradeNo]
  );
  return rows[0] ?? null;
}

export async function getPaymentByBinanceDepositReference(reference: string): Promise<PaymentRow | null> {
  const { rows } = await query<PaymentRow>(
    'SELECT * FROM payments WHERE binance_deposit_reference = $1',
    [reference]
  );
  return rows[0] ?? null;
}

export async function setPaymentCaptured(
  paymentId: number,
  payer_email?: string | null,
  paypal_payer_id?: string | null,
  user_id?: number | null
): Promise<void> {
  await query(
    `UPDATE payments SET status = 'captured', captured_at = NOW(),
     payer_email = COALESCE($2, payer_email), paypal_payer_id = COALESCE($3, paypal_payer_id),
     user_id = COALESCE($4, user_id)
     WHERE id = $1`,
    [paymentId, payer_email ?? null, paypal_payer_id ?? null, user_id ?? null]
  );
}

/** Guarda datos del depósito Binance (txId, dirección enviador, red) para trazabilidad y soporte. */
export async function setBinanceDepositCaptureDetails(
  paymentId: number,
  txId: string,
  fromAddress: string | null,
  network: string | null
): Promise<void> {
  await query(
    `UPDATE payments SET binance_deposit_tx_id = $2, binance_deposit_from_address = $3, binance_deposit_network = $4 WHERE id = $1`,
    [paymentId, txId, fromAddress ?? null, network ?? null]
  );
}

/** Tras capturar, crea token de descarga y devuelve la URL. Usa vigencia configurada en system_settings. */
export async function createDownloadUrlForPayment(postId: number): Promise<{ downloadUrl: string; expiresAt: string }> {
  const hours = await getDownloadTokenHours();
  const { token, expires_at } = await createDownloadToken(postId, hours);
  const baseUrl = env.API_URL.replace(/\/$/, '');
  return {
    downloadUrl: `${baseUrl}/api/download/${token}`,
    expiresAt: expires_at,
  };
}

/** Registra una "compra" gratuita (descarga gratis) para el usuario y devuelve la URL de descarga. Si ya tiene una compra gratuita para este post, solo crea un nuevo token. */
export async function recordFreeDownloadAndCreateToken(
  postId: number,
  userId: number
): Promise<{ downloadUrl: string; expiresAt: string }> {
  const existing = await query<{ id: number }>(
    `SELECT id FROM payments WHERE post_id = $1 AND user_id = $2 AND provider = 'free_download' AND status = 'captured' LIMIT 1`,
    [postId, userId]
  );
  if (existing.rows.length === 0) {
    await query(
      `INSERT INTO payments (post_id, provider, amount_usd, status, user_id, captured_at)
       VALUES ($1, 'free_download', 0, 'captured', $2, NOW())`,
      [postId, userId]
    );
  }
  return createDownloadUrlForPayment(postId);
}

export interface PaymentWithPost {
  id: number;
  post_id: number;
  post_title: string | null;
  provider: string;
  amount_usd: number;
  status: string;
  captured_at: string | null;
  created_at: string;
  payer_email: string | null;
  paypal_order_id: string | null;
  binance_deposit_tx_id?: string | null;
  binance_deposit_from_address?: string | null;
  binance_deposit_network?: string | null;
  user_id: number | null;
  user_email: string | null;
  user_name: string | null;
}

const PAYMENT_STATUSES = ['captured', 'pending', 'failed', 'expired'] as const;
const PAYMENT_SORT_FIELDS = ['created_at', 'amount_usd', 'status', 'provider', 'post_title'] as const;
export type PaymentSortField = (typeof PAYMENT_SORT_FIELDS)[number];

/** Extrae YYYY-MM-DD de un string (ya sea "2026-02-06" o "2026-02-06T00:00:00.000Z"). */
function parseDateParam(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined;
  const s = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(s)) return s;
  const withTime = /^(\d{4}-\d{2}-\d{2})[T\s]/;
  const m = s.match(withTime);
  return m ? m[1]! : undefined;
}

export interface ListPaymentsParams {
  limit: number;
  offset: number;
  from?: string;
  to?: string;
  timezone?: string;
  postId?: number;
  status?: string;
  sortBy?: PaymentSortField;
  sortOrder?: 'asc' | 'desc';
}

export async function listPayments(params: ListPaymentsParams): Promise<{ payments: PaymentWithPost[]; total: number }> {
  const { limit, offset, from: rawFrom, to: rawTo, timezone: tz, postId, status, sortBy = 'created_at', sortOrder = 'desc' } = params;
  const fromDate = parseDateParam(rawFrom);
  const toDate = parseDateParam(rawTo);
  const useTz = tz && /^[A-Za-z0-9_\/+-]+$/.test(tz) && (fromDate || toDate);
  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let idx = 1;
  if (fromDate) {
    if (useTz) {
      conditions.push(`p.created_at >= (($${idx}::text || ' 00:00:00')::timestamp AT TIME ZONE $${idx + (toDate ? 1 : 0) + 1})::timestamptz`);
    } else {
      conditions.push(`p.created_at >= ($${idx}::text || ' 00:00:00+00')::timestamptz`);
    }
    values.push(fromDate);
    idx += 1;
  }
  if (toDate) {
    if (useTz) {
      conditions.push(`p.created_at < ((($${idx}::date + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE $${idx + 1})::timestamptz`);
    } else {
      conditions.push(`p.created_at < (($${idx}::date + 1)::text || ' 00:00:00+00')::timestamptz`);
    }
    values.push(toDate);
    idx += 1;
  }
  if (useTz) {
    values.push(tz);
    idx += 1;
  }
  if (postId != null && Number.isFinite(postId)) {
    conditions.push(`p.post_id = $${idx}`);
    values.push(postId);
    idx += 1;
  }
  if (status && PAYMENT_STATUSES.includes(status as (typeof PAYMENT_STATUSES)[number])) {
    conditions.push(`p.status = $${idx}`);
    values.push(status);
    idx += 1;
  }
  const where = conditions.join(' AND ');
  const orderField =
    sortBy === 'post_title'
      ? 'b.title'
      : sortBy === 'amount_usd'
        ? 'p.amount_usd'
        : sortBy === 'status'
          ? 'p.status'
          : sortBy === 'provider'
            ? 'p.provider'
            : 'p.created_at';
  const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
  const orderNulls = sortOrder === 'asc' ? 'NULLS FIRST' : 'NULLS LAST';

  const [countResult, dataResult] = await Promise.all([
    query<{ count: string }>(
      `SELECT COUNT(*)::text
       FROM payments p
       LEFT JOIN blog_posts b ON b.id = p.post_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE ${where}`,
      values
    ),
    query<PaymentWithPost>(
      `SELECT p.id, p.post_id, b.title AS post_title, p.provider, p.amount_usd, p.status,
              p.captured_at, p.created_at, p.payer_email, p.paypal_order_id,
              p.binance_deposit_tx_id, p.binance_deposit_from_address, p.binance_deposit_network,
              p.user_id, u.email AS user_email, u.name AS user_name
       FROM payments p
       LEFT JOIN blog_posts b ON b.id = p.post_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE ${where}
       ORDER BY ${orderField} ${orderDir} ${orderNulls}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    ),
  ]);
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
  return { payments: dataResult.rows, total };
}

export async function listPaymentsByPostId(postId: number): Promise<PaymentRow[]> {
  const { rows } = await query<PaymentRow>(
    'SELECT * FROM payments WHERE post_id = $1 ORDER BY created_at DESC',
    [postId]
  );
  return rows;
}

export async function getPaymentById(id: number): Promise<PaymentRow | null> {
  const { rows } = await query<PaymentRow>('SELECT * FROM payments WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/** Pago perteneciente al usuario (para "Mis compras" y obtener enlace). */
export async function getPaymentByIdAndUserId(
  paymentId: number,
  userId: number
): Promise<PaymentRow | null> {
  const { rows } = await query<PaymentRow>(
    'SELECT * FROM payments WHERE id = $1 AND user_id = $2',
    [paymentId, userId]
  );
  return rows[0] ?? null;
}

export interface MyPurchaseRow {
  id: number;
  post_id: number;
  post_title: string | null;
  post_slug: string | null;
  post_category: string | null;
  provider: string;
  amount_usd: number;
  status: string;
  captured_at: string | null;
  created_at: string;
}

/** Lista pagos del usuario (para vista "Mis compras"). */
export async function listPaymentsByUserId(userId: number): Promise<MyPurchaseRow[]> {
  const { rows } = await query<MyPurchaseRow>(
    `SELECT p.id, p.post_id, b.title AS post_title, b.slug AS post_slug, b.category AS post_category,
            p.provider, p.amount_usd, p.status, p.captured_at, p.created_at
     FROM payments p
     LEFT JOIN blog_posts b ON b.id = p.post_id
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );
  return rows;
}

export interface PaymentStatsRow {
  provider: string;
  status: string;
  total_usd: string;
  count: string;
  date_day: string | null;
  post_id: number | null;
}

export interface PaymentStatsResult {
  totalUsd: number;
  totalCount: number;
  byProvider: Array<{ provider: string; totalUsd: number; count: number }>;
  byStatus: Array<{ status: string; totalUsd: number; count: number }>;
  byDay: Array<{ date: string; totalUsd: number; count: number }>;
  byPost: Array<{ post_id: number; post_title: string | null; totalUsd: number; count: number }>;
}

export async function getPaymentStats(params: {
  from?: string;
  to?: string;
  timezone?: string;
  postId?: number;
  provider?: string;
}): Promise<PaymentStatsResult> {
  const { from: rawFrom, to: rawTo, timezone: tz, postId, provider } = params;
  const fromDate = parseDateParam(rawFrom);
  const toDate = parseDateParam(rawTo);
  const useTz = tz && /^[A-Za-z0-9_\/+-]+$/.test(tz) && (fromDate || toDate);
  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let idx = 1;
  if (fromDate) {
    if (useTz) {
      conditions.push(`p.created_at >= (($${idx}::text || ' 00:00:00')::timestamp AT TIME ZONE $${idx + (toDate ? 1 : 0) + 1})::timestamptz`);
    } else {
      conditions.push(`p.created_at >= ($${idx}::text || ' 00:00:00+00')::timestamptz`);
    }
    values.push(fromDate);
    idx += 1;
  }
  if (toDate) {
    if (useTz) {
      conditions.push(`p.created_at < ((($${idx}::date + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE $${idx + 1})::timestamptz`);
    } else {
      conditions.push(`p.created_at < (($${idx}::date + 1)::text || ' 00:00:00+00')::timestamptz`);
    }
    values.push(toDate);
    idx += 1;
  }
  if (useTz) {
    values.push(tz);
    idx += 1;
  }
  if (postId != null) {
    conditions.push(`p.post_id = $${idx}`);
    values.push(postId);
    idx += 1;
  }
  if (provider) {
    conditions.push(`p.provider = $${idx}`);
    values.push(provider);
    idx += 1;
  }
  const where = conditions.join(' AND ');
  /** Sumas y conteos solo de pagos cobrados (captured) */
  const whereCaptured = `${where} AND p.status = 'captured'`;

  const [totalRes, byProviderRes, byStatusRes, byDayRes, byPostRes] = await Promise.all([
    query<{ total_usd: string; count: string }>(
      `SELECT COALESCE(SUM(amount_usd)::text, '0') AS total_usd, COUNT(*)::text AS count FROM payments p WHERE ${whereCaptured}`,
      values
    ),
    query<{ provider: string; total_usd: string; count: string }>(
      `SELECT p.provider, COALESCE(SUM(p.amount_usd)::text, '0') AS total_usd, COUNT(*)::text AS count FROM payments p WHERE ${whereCaptured} GROUP BY p.provider`,
      values
    ),
    query<{ status: string; total_usd: string; count: string }>(
      `SELECT p.status, COALESCE(SUM(p.amount_usd)::text, '0') AS total_usd, COUNT(*)::text AS count FROM payments p WHERE ${where} GROUP BY p.status`,
      values
    ),
    query<{ date_day: string; total_usd: string; count: string }>(
      `SELECT DATE(p.created_at)::text AS date_day, COALESCE(SUM(p.amount_usd)::text, '0') AS total_usd, COUNT(*)::text AS count FROM payments p WHERE ${whereCaptured} GROUP BY DATE(p.created_at) ORDER BY date_day DESC LIMIT 90`,
      values
    ),
    query<{ post_id: number; post_title: string | null; total_usd: string; count: string }>(
      `SELECT p.post_id, b.title AS post_title, COALESCE(SUM(p.amount_usd)::text, '0') AS total_usd, COUNT(*)::text AS count FROM payments p LEFT JOIN blog_posts b ON b.id = p.post_id WHERE ${whereCaptured} GROUP BY p.post_id, b.title ORDER BY total_usd DESC LIMIT 50`,
      values
    ),
  ]);

  const totalUsd = parseFloat(totalRes.rows[0]?.total_usd ?? '0');
  const totalCount = parseInt(totalRes.rows[0]?.count ?? '0', 10);

  return {
    totalUsd,
    totalCount,
    byProvider: byProviderRes.rows.map((r) => ({
      provider: r.provider,
      totalUsd: parseFloat(r.total_usd),
      count: parseInt(r.count, 10),
    })),
    byStatus: byStatusRes.rows.map((r) => ({
      status: r.status,
      totalUsd: parseFloat(r.total_usd),
      count: parseInt(r.count, 10),
    })),
    byDay: byDayRes.rows.map((r) => ({
      date: r.date_day,
      totalUsd: parseFloat(r.total_usd),
      count: parseInt(r.count, 10),
    })),
    byPost: byPostRes.rows.map((r) => ({
      post_id: r.post_id,
      post_title: r.post_title,
      totalUsd: parseFloat(r.total_usd),
      count: parseInt(r.count, 10),
    })),
  };
}
