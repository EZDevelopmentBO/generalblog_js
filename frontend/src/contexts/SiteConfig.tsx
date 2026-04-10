import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../utils/api';

const DEFAULT_TITLE = 'Mi blog';
const DEFAULT_SLOGAN = 'Artículos, ideas y novedades';

export interface SiteConfigValue {
  site_title: string;
  site_slogan: string;
  landing_value_bg_url: string;
}

const SiteConfigContext = createContext<SiteConfigValue>({
  site_title: DEFAULT_TITLE,
  site_slogan: DEFAULT_SLOGAN,
  landing_value_bg_url: '',
});

export function useSiteConfig(): SiteConfigValue {
  return useContext(SiteConfigContext);
}

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfigValue>({
    site_title: DEFAULT_TITLE,
    site_slogan: DEFAULT_SLOGAN,
    landing_value_bg_url: '',
  });

  useEffect(() => {
    api
      .get<SiteConfigValue>('/api/blog/site-config')
      .then((data) =>
        setConfig({
          site_title: data.site_title?.trim() || DEFAULT_TITLE,
          site_slogan: data.site_slogan?.trim() || DEFAULT_SLOGAN,
          landing_value_bg_url: (data.landing_value_bg_url ?? '').trim(),
        })
      )
      .catch(() => {});
  }, []);

  return (
    <SiteConfigContext.Provider value={config}>
      {children}
    </SiteConfigContext.Provider>
  );
}
