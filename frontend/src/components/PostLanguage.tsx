/**
 * Idioma del post con bandera: España (es), EE.UU. (en).
 * Iconos: country-flag-icons (https://github.com/catamphetamine/country-flag-icons).
 */

import ES from 'country-flag-icons/react/3x2/ES';
import US from 'country-flag-icons/react/3x2/US';

interface PostLanguageProps {
  /** 'es' | 'en' */
  language: string;
  /** Etiqueta (p. ej. "Español" / "English") */
  label?: string;
  /** Tamaño en px (por defecto 20) */
  size?: number;
  /** Bandera dentro de círculo blanco */
  iconInCircle?: boolean;
}

export function PostLanguage({ language: lang, label, size = 20, iconInCircle = false }: PostLanguageProps) {
  const isEn = (lang || '').toLowerCase() === 'en';
  const displayLabel = label ?? (isEn ? 'English' : 'Español');
  const Flag = isEn ? US : ES;
  const title = isEn ? 'United States' : 'España';

  const flag = (
    <Flag
      title={title}
      style={{ width: size, height: (size * 2) / 3, display: 'block', flexShrink: 0 }}
    />
  );

  return (
    <span className="d-inline-flex align-items-center gap-1">
      {iconInCircle ? (
        <span
          className="d-inline-flex align-items-center justify-content-center rounded-circle bg-white overflow-hidden"
          style={{ width: size + 6, height: size + 6, flexShrink: 0 }}
        >
          {flag}
        </span>
      ) : (
        flag
      )}
      {displayLabel != null && displayLabel !== '' && <span>{displayLabel}</span>}
    </span>
  );
}
