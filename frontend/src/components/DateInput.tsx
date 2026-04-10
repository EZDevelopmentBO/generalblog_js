import DatePicker, { registerLocale } from 'react-datepicker';
import { es, enUS } from 'date-fns/locale';
import type { Language } from '../utils/i18n';
import 'react-datepicker/dist/react-datepicker.css';

registerLocale('es', es);
registerLocale('en', enUS);

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  language: Language;
  id?: string;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

/** Formato "2 feb 2026" (es) / "2 Feb 2026" (en), coherente con el resto de la app. */
const dateFormatByLang: Record<Language, string> = {
  es: 'd MMM yyyy',
  en: 'd MMM yyyy',
};

/**
 * Input de fecha con react-datepicker.
 * Muestra la fecha como "2 feb 2026" / "2 Feb 2026" según idioma.
 */
export function DateInput({
  value,
  onChange,
  language,
  id,
  placeholder = '',
  className,
  'aria-label': ariaLabel,
}: DateInputProps) {
  const selected = value ? new Date(value + 'T12:00:00') : null;
  const dateFormat = dateFormatByLang[language];
  const locale = language === 'es' ? 'es' : 'en';

  const handleChange = (date: Date | null) => {
    onChange(date ? date.toISOString().slice(0, 10) : '');
  };

  return (
    <DatePicker
      id={id}
      selected={selected}
      onChange={handleChange}
      dateFormat={dateFormat}
      locale={locale}
      placeholderText={placeholder}
      className={className ? `react-datepicker-input ${className}` : 'react-datepicker-input'}
      ariaLabel={ariaLabel}
      isClearable
      clearButtonTitle=""
      showMonthDropdown
      showYearDropdown
      dropdownMode="scroll"
    />
  );
}
