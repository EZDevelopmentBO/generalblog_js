import { useLanguageContext, useT } from '../utils/i18n';

/**
 * Selector de idioma para la barra de navegación. Debe usarse dentro de LanguageProvider.
 */
export function LanguageSelector() {
  const t = useT();
  const { language, setLanguage } = useLanguageContext();
  return (
    <select
      className="form-select form-select-sm language-select bg-dark border-secondary"
      value={language}
      onChange={(e) => setLanguage(e.target.value as 'es' | 'en')}
      aria-label={t('nav.languageLabel')}
      title={t('nav.languageLabel')}
    >
      <option value="es">{t('nav.languageEs')}</option>
      <option value="en">{t('nav.languageEn')}</option>
    </select>
  );
}
