import type { Language } from './i18n';

/**
 * Formato de fecha/hora unificado: "2 ene 2026 14:30" (es) / "2 Jan 2026 14:30" (en).
 * Usar en todas las partes donde se muestren fechas.
 */
export function formatDateTime(date: Date | string, language: Language): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  const locale = language === 'es' ? 'es-ES' : 'en-GB';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Solo fecha: "2 ene 2026" (es) / "2 Jan 2026" (en).
 * Útil cuando no hay hora relevante.
 */
export function formatDate(date: Date | string, language: Language): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  const locale = language === 'es' ? 'es-ES' : 'en-GB';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formato para inputs de fecha según idioma:
 * - es: DD/MM/YYYY (ej. 30/10/2026)
 * - en: MM/DD/YYYY (ej. 10/30/2026)
 */
export function formatDateInput(date: Date | string, language: Language): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return language === 'es' ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}
