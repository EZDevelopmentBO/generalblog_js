/**
 * Canal de notificación con icono: email, whatsapp, telegram.
 * Iconos: MDI (email, whatsapp), Simple Icons (telegram).
 */

// MDI viewBox 0 0 24 24
const EMAIL_PATH =
  'M20,8L12,13L4,8V6L12,11L20,6M20,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6C22,4.89 21.1,4 20,4Z';
const WHATSAPP_PATH =
  'M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M8.53 7.33C8.37 7.33 8.1 7.39 7.87 7.64C7.65 7.89 7 8.5 7 9.71C7 10.93 7.89 12.1 8 12.27C8.14 12.44 9.76 14.94 12.25 16C12.84 16.27 13.3 16.42 13.66 16.53C14.25 16.72 14.79 16.69 15.22 16.63C15.7 16.56 16.68 16.03 16.89 15.45C17.1 14.87 17.1 14.38 17.04 14.27C16.97 14.17 16.81 14.11 16.56 14C16.31 13.86 15.09 13.26 14.87 13.18C14.64 13.1 14.5 13.06 14.31 13.3C14.15 13.55 13.67 14.11 13.53 14.27C13.38 14.44 13.24 14.46 13 14.34C12.74 14.21 11.94 13.95 11 13.11C10.26 12.45 9.77 11.64 9.62 11.39C9.5 11.15 9.61 11 9.73 10.89C9.84 10.78 10 10.6 10.1 10.45C10.23 10.31 10.27 10.2 10.35 10.04C10.43 9.87 10.39 9.73 10.33 9.61C10.27 9.5 9.77 8.26 9.56 7.77C9.36 7.29 9.16 7.35 9 7.34C8.86 7.34 8.7 7.33 8.53 7.33Z';
// Simple Icons - Telegram
const TELEGRAM_PATH =
  'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z';

const CHANNEL_CONFIG: Record<string, { path: string; color: string }> = {
  email: { path: EMAIL_PATH, color: '#6c757d' },
  whatsapp: { path: WHATSAPP_PATH, color: '#25D366' },
  telegram: { path: TELEGRAM_PATH, color: '#26A5E4' },
};

interface NotificationChannelProps {
  channel: string;
  label: string;
  iconSize?: number;
  iconInCircle?: boolean;
  /** Si false, solo se muestra el icono y el label en tooltip (title) al pasar el ratón */
  showLabel?: boolean;
}

export function NotificationChannel({ channel: ch, label, iconSize = 18, iconInCircle = false, showLabel = true }: NotificationChannelProps) {
  const channel = (ch ?? '').toLowerCase();
  const config = CHANNEL_CONFIG[channel] ?? { path: EMAIL_PATH, color: '#6c757d' };

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
