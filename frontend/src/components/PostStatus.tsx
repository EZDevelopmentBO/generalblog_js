/**
 * Estado del post (Publicado/Borrador) con icono, al estilo de la tabla de pagos.
 * MDI: check-circle (publicado), pencil-box-outline (borrador).
 */

// MDI paths, viewBox 0 0 24 24
const CHECK_CIRCLE =
  'M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z';
const PENCIL_BOX_OUTLINE =
  'M19,19V5H5V19H19M19,3A2,2 0 0,1 21,5V19C21,20.11 20.1,21 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H19M16.7,9.35L15.7,10.35L13.65,8.3L14.65,7.3C14.86,7.08 15.21,7.08 15.42,7.3L16.7,8.58C16.92,8.79 16.92,9.14 16.7,9.35M7,14.94L13.06,8.88L15.12,10.94L9.06,17H7V14.94Z';

interface PostStatusProps {
  /** true = publicado, false = borrador */
  published: boolean;
  /** Etiqueta (p. ej. t('common.published') / t('common.draft')) */
  label: string;
  /** Tamaño del icono en px (por defecto 18) */
  iconSize?: number;
  /** Icono dentro de círculo blanco */
  iconInCircle?: boolean;
}

export function PostStatus({ published, label, iconSize = 18, iconInCircle = false }: PostStatusProps) {
  const path = published ? CHECK_CIRCLE : PENCIL_BOX_OUTLINE;
  const color = published ? '#198754' : '#6c757d';

  const icon = (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill={color}
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
      <span>{label}</span>
    </span>
  );
}
