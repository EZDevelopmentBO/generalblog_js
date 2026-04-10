/** Claves de sessionStorage para cupón/ref desde URL */
export const ACTIVE_COUPON_KEY = 'activeCoupon';
export const ACTIVE_REF_KEY = 'activeRef';

export function getActiveCoupon(): string | null {
  try {
    const v = sessionStorage.getItem(ACTIVE_COUPON_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function getActiveRef(): string | null {
  try {
    const v = sessionStorage.getItem(ACTIVE_REF_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setActiveCoupon(code: string | null): void {
  try {
    if (code && code.trim()) sessionStorage.setItem(ACTIVE_COUPON_KEY, code.trim());
    else sessionStorage.removeItem(ACTIVE_COUPON_KEY);
  } catch {
    /* ignore */
  }
}

export function setActiveRef(ref: string | null): void {
  try {
    if (ref && ref.trim()) sessionStorage.setItem(ACTIVE_REF_KEY, ref.trim());
    else sessionStorage.removeItem(ACTIVE_REF_KEY);
  } catch {
    /* ignore */
  }
}

export function clearActiveCoupon(): void {
  try {
    sessionStorage.removeItem(ACTIVE_COUPON_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Lee ?coupon= y ?ref= de la URL, los guarda en sessionStorage y limpia la URL sin recargar.
 */
export function captureCouponAndRefFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const coupon = params.get('coupon')?.trim();
    const ref = params.get('ref')?.trim();
    if (coupon) sessionStorage.setItem(ACTIVE_COUPON_KEY, coupon);
    if (ref) sessionStorage.setItem(ACTIVE_REF_KEY, ref);
    if (coupon || ref) {
      const u = new URL(window.location.href);
      u.searchParams.delete('coupon');
      u.searchParams.delete('ref');
      const newUrl = u.pathname + (u.search || '') || '/';
      window.history.replaceState({}, '', newUrl);
    }
  } catch {
    /* ignore */
  }
}

/** URL de login con ref y/o returnUrl en query. returnUrl = ruta donde redirigir tras login (ej. /noticias/post-slug). */
export function getLoginUrl(returnUrl?: string): string {
  const params = new URLSearchParams();
  const ref = getActiveRef();
  if (ref) params.set('ref', ref);
  if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
    params.set('returnUrl', returnUrl);
  }
  const qs = params.toString();
  return qs ? `/auth/google?${qs}` : '/auth/google';
}
