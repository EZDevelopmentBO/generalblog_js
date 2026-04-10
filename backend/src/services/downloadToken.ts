import crypto from 'crypto';
import { query } from '../config/database';

const DEFAULT_EXPIRY_HOURS = 48;

export interface DownloadTokenRow {
  id: number;
  post_id: number;
  token: string;
  expires_at: string;
  created_at: string;
  download_count: number;
}

export async function createDownloadToken(
  postId: number,
  expiresInHours: number = DEFAULT_EXPIRY_HOURS,
  freeDownloadFingerprint?: string | null
): Promise<{ token: string; expires_at: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  await query(
    `INSERT INTO download_tokens (post_id, token, expires_at, free_download_fingerprint) VALUES ($1, $2, $3, $4)`,
    [postId, token, expiresAt.toISOString(), freeDownloadFingerprint ?? null]
  );
  return { token, expires_at: expiresAt.toISOString() };
}

/** Busca un token de descarga gratuita aún válido (no expirado y por debajo del límite) para este post + fingerprint. */
export async function findValidFreeDownloadToken(
  postId: number,
  fingerprint: string,
  maxDownloadCount: number
): Promise<{ token: string; expires_at: string } | null> {
  const { rows } = await query<{ token: string; expires_at: string }>(
    `SELECT token, expires_at FROM download_tokens
     WHERE post_id = $1 AND free_download_fingerprint = $2 AND expires_at > NOW()
       AND COALESCE(download_count, 0) < $3
     ORDER BY created_at DESC LIMIT 1`,
    [postId, fingerprint, maxDownloadCount]
  );
  return rows[0] ?? null;
}

/** Indica si ya existe algún token de descarga gratuita para este post + fingerprint (agotado o caducado). No se crea otro. */
export async function hasExistingFreeDownloadToken(postId: number, fingerprint: string): Promise<boolean> {
  const { rows } = await query<{ id: number }>(
    `SELECT id FROM download_tokens WHERE post_id = $1 AND free_download_fingerprint = $2 LIMIT 1`,
    [postId, fingerprint]
  );
  return rows.length > 0;
}

export async function getDownloadTokenInfo(token: string): Promise<DownloadTokenRow | null> {
  const { rows } = await query<DownloadTokenRow>(
    `SELECT id, post_id, token, expires_at, created_at, COALESCE(download_count, 0) AS download_count FROM download_tokens WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );
  return rows[0] ?? null;
}

/** Obtiene el post_id asociado a un token (aunque esté expirado), para redirecciones. */
export async function getPostIdByToken(token: string): Promise<number | null> {
  const { rows } = await query<{ post_id: number }>(
    'SELECT post_id FROM download_tokens WHERE token = $1',
    [token]
  );
  return rows[0]?.post_id ?? null;
}

/** Incrementa el contador de descargas si aún está por debajo del límite. Devuelve true si se incrementó. */
export async function incrementDownloadCount(tokenId: number, maxCount: number): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE download_tokens SET download_count = download_count + 1 WHERE id = $1 AND COALESCE(download_count, 0) < $2`,
    [tokenId, maxCount]
  );
  return (rowCount ?? 0) > 0;
}
