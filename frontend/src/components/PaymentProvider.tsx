/**
 * Muestra el método de pago con icono de marca (Simple Icons) y color oficial.
 * PayPal: #003087, Binance: #F0B90B.
 */

export type PaymentProviderSlug = 'paypal' | 'binance_pay' | 'binance_deposit';

const PAYPAL_HEX = '#003087';
const BINANCE_HEX = '#F0B90B';

// Simple Icons (https://simpleicons.org) – SVG paths, viewBox 0 0 24 24
const PAYPAL_PATH =
  'M7.016 19.198h-4.2a.562.562 0 0 1-.555-.65L5.093.584A.692.692 0 0 1 5.776 0h7.222c3.417 0 5.904 2.488 5.846 5.5-.006.25-.027.5-.066.747A6.794 6.794 0 0 1 12.071 12H8.743a.69.69 0 0 0-.682.583l-.325 2.056-.013.083-.692 4.39-.015.087zM19.79 6.142c-.01.087-.01.175-.023.261a7.76 7.76 0 0 1-7.695 6.598H9.007l-.283 1.795-.013.083-.692 4.39-.134.843-.014.088H6.86l-.497 3.15a.562.562 0 0 0 .555.65h3.612c.34 0 .63-.249.683-.585l.952-6.031a.692.692 0 0 1 .683-.584h2.126a6.793 6.793 0 0 0 6.707-5.752c.306-1.95-.466-3.744-1.89-4.906z';
const BINANCE_PATH =
  'M16.624 13.9202l2.7175 2.7154-7.353 7.353-7.353-7.352 2.7175-2.7164 4.6355 4.6595 4.6356-4.6595zm4.6366-4.6366L24 12l-2.7154 2.7164L18.5682 12l2.6924-2.7164zm-9.272.001l2.7163 2.6914-2.7164 2.7174v-.001L9.2721 12l2.7164-2.7154zm-9.2722-.001L5.4088 12l-2.6914 2.6924L0 12l2.7164-2.7164zM11.9885.0115l7.353 7.329-2.7174 2.7154-4.6356-4.6356-4.6355 4.6595-2.7174-2.7154 7.353-7.353z';

const DEFAULT_LABELS: Record<PaymentProviderSlug, string> = {
  paypal: 'PayPal',
  binance_pay: 'Binance Pay',
  binance_deposit: 'Binance',
};

interface PaymentProviderProps {
  provider: string;
  /** Si se omite, se usa la etiqueta por defecto según provider */
  label?: string;
  /** Mostrar texto junto al icono (por defecto true) */
  showLabel?: boolean;
  /** Tamaño del icono en px (por defecto 18) */
  iconSize?: number;
  /** En reportes: icono dentro de un círculo blanco */
  iconInCircle?: boolean;
}

export function PaymentProvider({ provider, label, showLabel = true, iconSize = 18, iconInCircle = false }: PaymentProviderProps) {
  const slug = provider as PaymentProviderSlug;
  const isBinance = slug === 'binance_pay' || slug === 'binance_deposit';
  const hex = slug === 'paypal' ? PAYPAL_HEX : isBinance ? BINANCE_HEX : undefined;
  const path = slug === 'paypal' ? PAYPAL_PATH : isBinance ? BINANCE_PATH : null;
  const displayLabel = label ?? (DEFAULT_LABELS[slug] ?? provider);

  if (!path || !hex) {
    return <span className="text-muted">{displayLabel}</span>;
  }

  const icon = (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill={hex}
      aria-hidden
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path d={path} />
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
      {showLabel && <span>{displayLabel}</span>}
    </span>
  );
}
