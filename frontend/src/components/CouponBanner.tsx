import { useEffect, useState } from 'react';
import { useT } from '../utils/i18n';
import { api } from '../utils/api';
import {
  getActiveCoupon,
  clearActiveCoupon,
  captureCouponAndRefFromUrl,
} from '../utils/couponStorage';

interface CouponInfo {
  valid: boolean;
  code: string;
  discount_type?: 'percent' | 'fixed';
  discount_value?: number;
  description?: string | null;
  error?: string;
}

function formatDiscount(info: CouponInfo): string {
  if (info.discount_type === 'percent' && info.discount_value != null) {
    return `${info.discount_value}%`;
  }
  if (info.discount_type === 'fixed' && info.discount_value != null) {
    return `${info.discount_value} USD`;
  }
  return '';
}

export function CouponBanner() {
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const [info, setInfo] = useState<CouponInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    captureCouponAndRefFromUrl();
    const c = getActiveCoupon();
    setCode(c);
  }, []);

  useEffect(() => {
    if (!code || dismissed) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<CouponInfo>(`/api/payments/coupon-info?code=${encodeURIComponent(code)}`)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo({ valid: false, code, error: 'Error' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, dismissed]);

  const handleDismiss = () => {
    clearActiveCoupon();
    setCode(null);
    setInfo(null);
    setDismissed(true);
  };

  if (!info || !info.valid) return null;

  const discountText = formatDiscount(info);
  const message = info.description?.trim()
    ? `${info.description}${discountText ? ` (${discountText})` : ''}`
    : discountText
      ? `${info.code}: ${discountText}`
      : info.code;

  return (
    <div
      className="d-flex align-items-center justify-content-center gap-2 py-2 px-3 text-center text-dark small border-bottom border-secondary"
      style={{ backgroundColor: 'var(--bs-warning-bg-subtle, #fff3cd)' }}
      role="status"
      aria-live="polite"
    >
      {loading ? (
        <span className="text-muted">{t('common.loading')}</span>
      ) : (
        <>
          <span className="fw-medium">{t('couponBanner.title')}</span>
          <span>{message}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary ms-1"
            onClick={handleDismiss}
            aria-label={t('couponBanner.dismiss')}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
