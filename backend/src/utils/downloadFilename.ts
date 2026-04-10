/**
 * Genera un nombre de archivo codificado para la descarga:
 * sanitized-slug + fecha exacta de publicación del post.
 * Legible y único por post.
 */
export function buildDownloadFilename(post: {
  id: number;
  slug: string;
  published_at: string | null;
  created_at: string;
}): string {
  const sanitized = sanitizeSlugForFilename(post.slug);
  const dateStr = formatDateForFilename(post.published_at || post.created_at);
  return `${post.id}-${sanitized}-${dateStr}.zip`;
}

/** Convierte slug/título a un segmento seguro para nombre de archivo: solo letras, números y guiones */
function sanitizeSlugForFilename(slug: string): string {
  if (!slug || typeof slug !== 'string') return 'post';
  let s = slug
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!s) return 'post';
  return s.slice(0, 80);
}

function formatDateForFilename(isoDate: string): string {
  const d = new Date(isoDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
