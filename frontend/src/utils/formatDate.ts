/**
 * Formato único de fecha/hora para tablas del trading bot: DD/MM/YY HH:mm
 * Ejemplo: 26/03/25 17:49
 */
const PAD = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(date: Date): string {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear() % 100;
  const h = date.getHours();
  const min = date.getMinutes();
  return `${PAD(d)}/${PAD(m)}/${PAD(y)} ${PAD(h)}:${PAD(min)}`;
}

/** Formatea una fecha ISO (string) o null/undefined; devuelve '—' si no hay valor. */
export function formatDate(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : formatDateTime(date);
}
