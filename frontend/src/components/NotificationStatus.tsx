/**
 * Estado de notificación (enviado/fallido) con icono, mismo estilo que PaymentStatus.
 * MDI: check-circle (sent), close-circle (failed).
 */

const CHECK_CIRCLE =
  'M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z';
const CLOSE_CIRCLE =
  'M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z';

const CONFIG: Record<string, { path: string; color: string }> = {
  sent: { path: CHECK_CIRCLE, color: '#198754' },
  failed: { path: CLOSE_CIRCLE, color: '#dc3545' },
};

interface NotificationStatusProps {
  status: string;
  label: string;
  iconSize?: number;
  iconInCircle?: boolean;
  /** Si false, solo se muestra el icono y el label en tooltip (title) al pasar el ratón */
  showLabel?: boolean;
}

export function NotificationStatus({ status: raw, label, iconSize = 18, iconInCircle = false, showLabel = true }: NotificationStatusProps) {
  const status = (raw ?? '').toLowerCase();
  const config = CONFIG[status] ?? { path: CLOSE_CIRCLE, color: '#6c757d' };

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

  const iconBlock = iconInCircle ? (
    <span
      className="d-inline-flex align-items-center justify-content-center rounded-circle bg-white"
      style={{ width: iconSize + 6, height: iconSize + 6, flexShrink: 0 }}
    >
      {icon}
    </span>
  ) : (
    icon
  );

  const wrapped = showLabel ? (
    iconBlock
  ) : (
    <span title={label} style={{ cursor: 'help' }}>
      {iconBlock}
    </span>
  );

  return (
    <span className="d-inline-flex align-items-center gap-1">
      {wrapped}
      {showLabel && <span>{label}</span>}
    </span>
  );
}
