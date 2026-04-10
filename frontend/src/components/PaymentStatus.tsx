/**
 * Muestra el estado del pago con icono (Material Design Icons) y color.
 * captured: check-circle verde, pending: clock amarillo, failed/expired: close-circle/clock-alert rojo.
 */

// MDI paths, viewBox 0 0 24 24
const CHECK_CIRCLE =
  'M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z';
const CLOCK_OUTLINE =
  'M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z';
const CLOSE_CIRCLE =
  'M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z';
const CLOCK_ALERT =
  'M11 7V13L16.2 16.1L17 14.9L12.5 12.2V7H11M20 12V18H22V12H20M20 20V22H22V20H20M18 20C16.3 21.3 14.3 22 12 22C6.5 22 2 17.5 2 12S6.5 2 12 2C16.8 2 20.9 5.4 21.8 10H19.7C18.8 6.6 15.7 4 12 4C7.6 4 4 7.6 4 12S7.6 20 12 20C14.4 20 16.5 18.9 18 17.3V20Z';

const STATUS_CONFIG: Record<
  string,
  { path: string; color: string }
> = {
  captured: { path: CHECK_CIRCLE, color: '#198754' },
  pending: { path: CLOCK_OUTLINE, color: '#ffc107' },
  failed: { path: CLOSE_CIRCLE, color: '#dc3545' },
  expired: { path: CLOCK_ALERT, color: '#dc3545' },
};

interface PaymentStatusProps {
  status: string;
  /** Etiqueta a mostrar (p. ej. traducida) */
  label?: string;
  /** Tamaño del icono en px (por defecto 18) */
  iconSize?: number;
  /** Icono dentro de círculo blanco (para tablas/reportes) */
  iconInCircle?: boolean;
}

export function PaymentStatus({ status: raw, label, iconSize = 18, iconInCircle = false }: PaymentStatusProps) {
  const status = (raw ?? '').toLowerCase();
  const config = STATUS_CONFIG[status] ?? { path: CLOCK_OUTLINE, color: '#6c757d' };
  const displayLabel = label ?? status;

  const icon = (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill={config.color}
      aria-hidden
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path d={config.path} />
    </svg>
  );

  return (
    <span className="d-inline-flex align-items-center gap-1">
      {iconInCircle ? (
        <span
          className="d-inline-flex align-items-center justify-content-center rounded-circle bg-white"
          style={{ width: iconSize + 6, height: iconSize + 6, flexShrink: 0 }}
        >
          {icon}
        </span>
      ) : (
        icon
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
