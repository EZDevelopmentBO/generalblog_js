import { createContext, useContext, useEffect, useState } from 'react';
import { Outlet, NavLink, Navigate } from 'react-router-dom';
import { ResponsiveNavbar } from './ResponsiveNavbar';
import { LanguageSelector } from './LanguageSelector';
import { NavLogoutButton } from './NavLogoutButton';
import { SiteBrand } from './SiteBrand';
import { useT } from '../utils/i18n';
import { api } from '../utils/api';

export interface AppUser {
  name: string;
  role: string;
  permissions?: string[];
}

const AppUserContext = createContext<AppUser | null>(null);

export function useAppUser(): AppUser | null {
  return useContext(AppUserContext);
}

/**
 * Layout para rutas /app: barra superior mínima (Inicio, Panel, Salir).
 * Todas las opciones (Mis compras, Pagos, Blog, Notificaciones, etc.) están solo en el dashboard del panel.
 */
export function AppLayout() {
  const t = useT();
  const [user, setUser] = useState<AppUser | null>(undefined as unknown as AppUser | null);

  useEffect(() => {
    api
      .get<AppUser>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <p className="text-muted">{t('common.loading')}</p>
      </div>
    );
  }
  if (user === null) {
    return <Navigate to="/" replace />;
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `btn btn-sm ${isActive ? 'btn-info' : 'btn-outline-light'}`;

  return (
    <AppUserContext.Provider value={user}>
    <div className="min-vh-100 d-flex flex-column">
      <ResponsiveNavbar brand={<SiteBrand />}>
        <LanguageSelector />
        <NavLink to="/app" end className={navLinkClass}>
          {t('nav.app')}
        </NavLink>
        <NavLogoutButton />
      </ResponsiveNavbar>

      <Outlet />
    </div>
    </AppUserContext.Provider>
  );
}
