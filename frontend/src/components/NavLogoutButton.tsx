import { useT } from '../utils/i18n';
import {
  DOWNLOAD_UNLOCK_STORAGE_PREFIX,
  FREE_DOWNLOAD_FINGERPRINT_KEY,
} from '../utils/downloadUnlockStorage';

/** Icono MDI "logout" (Material Design Icons), viewBox 0 0 24 24 */
const LOGOUT_PATH =
  'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h12V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h12v-2H4V5z';

/** Limpia datos de sesión local (desbloqueos, fingerprint) para que otro usuario no herede acceso. */
function clearSessionStorage() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (
        k &&
        (k.startsWith(DOWNLOAD_UNLOCK_STORAGE_PREFIX) ||
          k.startsWith('tradersworld_unlocked_') ||
          k === FREE_DOWNLOAD_FINGERPRINT_KEY ||
          k === 'tradersworld_free_dl_fingerprint')
      ) {
        keys.push(k);
      }
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export function NavLogoutButton() {
  const t = useT();
  return (
    <a
      className="btn btn-sm nav-logout-btn"
      href="/auth/logout"
      title={t('nav.logout')}
      onClick={() => {
        clearSessionStorage();
      }}
    >
      <svg
        className="nav-logout-btn__icon"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d={LOGOUT_PATH} />
      </svg>
      <span>{t('nav.logout')}</span>
    </a>
  );
}
