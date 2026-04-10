/** Prefijo sessionStorage para marcar posts desbloqueados tras pago o descarga gratuita. */
export const DOWNLOAD_UNLOCK_STORAGE_PREFIX = 'blog_unlocked_';

export const FREE_DOWNLOAD_FINGERPRINT_KEY = 'blog_free_dl_fingerprint';

/** @deprecated solo lectura por compatibilidad con sesiones antiguas */
const LEGACY_UNLOCK_PREFIX = 'tradersworld_unlocked_';

export function isPostUnlockedInSession(postId: number): boolean {
  const id = String(postId);
  return (
    sessionStorage.getItem(DOWNLOAD_UNLOCK_STORAGE_PREFIX + id) === '1' ||
    sessionStorage.getItem(LEGACY_UNLOCK_PREFIX + id) === '1'
  );
}

export function setPostUnlockedInSession(postId: number): void {
  sessionStorage.setItem(DOWNLOAD_UNLOCK_STORAGE_PREFIX + String(postId), '1');
}
