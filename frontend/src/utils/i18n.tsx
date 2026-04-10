import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { es } from '../translations/es';
import { en } from '../translations/en';
import { api } from './api';

export type Language = 'es' | 'en';

const STORAGE_KEY = 'preferred_language';

const translations: Record<Language, Record<string, string>> = { es, en };

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
} | null>(null);

function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'es';
  return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'es';
}

export function useLanguage(): Language {
  const ctx = useContext(LanguageContext);
  return ctx?.language ?? 'es';
}

export function useLanguageContext(): {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
} {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguageContext must be used within LanguageProvider');
  return ctx;
}

export function useT(): (key: string) => string {
  const ctx = useContext(LanguageContext);
  return useCallback(
    (key: string) => (ctx ? (translations[ctx.language][key] ?? key) : key),
    [ctx?.language]
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, lang);
    }
    api.put('/api/me/preferences', { preferred_language: lang }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { id?: number; preferred_language?: string | null } | null) => {
        if (!data) return;
        if (data.preferred_language === 'es' || data.preferred_language === 'en') {
          setLanguageState(data.preferred_language);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, data.preferred_language);
          }
        } else if (data.id != null) {
          const current = getStoredLanguage();
          api.put('/api/me/preferences', { preferred_language: current }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const t = useCallback(
    (key: string) => translations[language][key] ?? key,
    [language]
  );
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
