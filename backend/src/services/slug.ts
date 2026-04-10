/**
 * Normaliza un título a slug: minúsculas, sin acentos, espacios → guiones.
 */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Genera slug completo: YYYY-MM-DD-slug-del-titulo. Si colisiona, añade -1, -2...
 */
export function buildFullSlug(title: string, date: Date = new Date()): string {
  const dateStr = date.toISOString().slice(0, 10);
  const baseSlug = titleToSlug(title);
  return `${dateStr}-${baseSlug}`;
}
