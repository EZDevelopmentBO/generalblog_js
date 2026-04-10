import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useT, useLanguage } from '../utils/i18n';
import { formatDateTime } from '../utils/dateFormat';
import { api } from '../utils/api';
import { getImageUrl } from '../utils/api';
import { getActiveCoupon } from '../utils/couponStorage';
import type { BlogPostFull } from '../types';
import { MoreNewsCarousel } from '../components/MoreNewsCarousel';
import { ResponsiveNavbar } from '../components/ResponsiveNavbar';
import { LanguageSelector } from '../components/LanguageSelector';
import { SiteBrand } from '../components/SiteBrand';
import { NavLoginButton } from '../components/NavLoginButton';
import { useSiteConfig } from '../contexts/SiteConfig';
import { trackEvent } from '../utils/analytics';
import { isPostUnlockedInSession, setPostUnlockedInSession } from '../utils/downloadUnlockStorage';

/** Formato de precio de descarga: hasta 4 decimales, sin ceros finales innecesarios */
function formatDownloadPrice(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return '0 USD';
  const fixed = usd.toFixed(4).replace(/\.?0+$/, '');
  return `${fixed} USD`;
}

/** Convierte URL de YouTube o Vimeo a iframe embed, o null si no es soportada */
function getVideoEmbedUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  const ytMatch = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  const vimeoMatch = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return null;
}

const TEASER_WORDS = 100;

/** Primeras N palabras del contenido sin HTML; devuelve { text, hasMore }. */
function getFirstWordsFromHtml(html: string | null | undefined, maxWords: number): { text: string; hasMore: boolean } {
  if (!html || typeof html !== 'string') return { text: '', hasMore: false };
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const hasMore = words.length > maxWords;
  return { text: words.slice(0, maxWords).join(' '), hasMore };
}

function isCapturedCheckoutResponse(v: unknown): v is { status: 'captured'; downloadUrl?: string; download_file_is_image?: boolean } {
  if (!v || typeof v !== 'object') return false;
  const x = v as { status?: unknown };
  return x.status === 'captured';
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const t = useT();
  const language = useLanguage();
  const { site_title } = useSiteConfig();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPostFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<'idle' | 'paypal' | 'binance' | 'transfer'>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [transferNetwork, setTransferNetwork] = useState<string>('BEP20');
  const [freeLoading, setFreeLoading] = useState(false);
  const [freeError, setFreeError] = useState<string | null>(null);
  const [user, setUser] = useState<{ email?: string } | null | undefined>(undefined);
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState<{ discountedAmount: number; amountBeforeDiscount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [contentUnlocked, setContentUnlocked] = useState(false);

  useEffect(() => {
    api.get<{ email?: string }>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!slug) return;
    api
      .get<BlogPostFull>(`/api/blog/posts/slug/${encodeURIComponent(slug)}`)
      .then((p) => {
        setPost(p);
        return api.post(`/api/blog/posts/slug/${encodeURIComponent(slug)}/view`).then(() => {
          setPost((prev) => (prev ? { ...prev, views: prev.views + 1 } : null));
        });
      })
      .catch(() => setPost(null))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (post?.has_download && !couponCode) {
      const stored = getActiveCoupon();
      if (stored) setCouponCode(stored);
    }
  }, [post?.has_download, post?.id, couponCode]);

  useEffect(() => {
    if (!post) return;
    if (typeof sessionStorage !== 'undefined') {
      const fromSession = isPostUnlockedInSession(post.id);
      if (fromSession) {
        setContentUnlocked(true);
        return;
      }
    }
    if (!post.has_download) {
      setContentUnlocked(true);
      return;
    }
    setContentUnlocked(false);
  }, [post?.id, post?.has_download, user]);

  useEffect(() => {
    if (!post?.has_download || !user) return;
    api
      .get<{ purchases: Array<{ post_id: number; status: string }> }>('/api/me/purchases')
      .then((res) => {
        if (res?.purchases?.some((p) => p.post_id === post.id && p.status === 'captured')) {
          setContentUnlocked(true);
        }
      })
      .catch(() => {});
  }, [post?.id, post?.has_download, user]);

  useEffect(() => {
    if (!post) return;
    trackEvent('post_view', {
      post_id: post.id,
      category: post.category,
      has_download: post.has_download,
      language,
    });
  }, [post?.id, post?.category, post?.has_download, language]);

  useEffect(() => {
    if (!post) return;
    document.title = post.meta_title || post.title;
    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement('meta');
      desc.setAttribute('name', 'description');
      document.head.appendChild(desc);
    }
    desc.setAttribute('content', post.meta_description || post.excerpt || '');

    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', post.meta_title || post.title);

    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute('content', post.meta_description || post.excerpt || '');

    if (post.featured_image) {
      let ogImage = document.querySelector('meta[property="og:image"]');
      if (!ogImage) {
        ogImage = document.createElement('meta');
        ogImage.setAttribute('property', 'og:image');
        document.head.appendChild(ogImage);
      }
      ogImage.setAttribute('content', getImageUrl(post.featured_image));
    }
  }, [post]);

  if (loading) {
    return (
      <div className="container py-5">
        <p className="text-muted">{t('common.loading')}</p>
      </div>
    );
  }
  if (!post) {
    return (
      <div className="container py-5">
        <p className="text-muted">{t('common.blog.postNotFound')}</p>
        <Link to="/">{t('common.back')}</Link>
      </div>
    );
  }

  const date = post.published_at ? formatDateTime(post.published_at, language) : '';
  const basePath = language === 'es' ? '/noticias' : '/news';

  return (
    <div className="min-vh-100 d-flex flex-column">
      <ResponsiveNavbar
        brand={
          <SiteBrand />
        }
      >
        <LanguageSelector />
        <Link className="btn btn-outline-light btn-sm" to={basePath}>
          {t('nav.allNews')}
        </Link>
      </ResponsiveNavbar>

      <article className="article-page flex-grow-1">
        <div className="article-page__inner">
          {/* Breadcrumb / back */}
          <nav className="article-page__back" aria-label="Breadcrumb">
            <Link to={basePath} className="article-page__back-link">
              ← {t('nav.allNews')}
            </Link>
          </nav>

          <header className="article-page__header">
            {(!post.has_download || contentUnlocked) && post.featured_image && (
              <div className="article-page__hero">
                <img
                  src={getImageUrl(post.featured_image)}
                  alt=""
                  className="article-page__hero-img"
                />
              </div>
            )}
            <h1 className="article-page__title">{post.title}</h1>
            <div className="article-page__byline">
              <span>{t('blogPost.by')} {post.author_name ?? site_title}</span>
              {date && <><span className="article-page__byline-sep" aria-hidden>·</span><time dateTime={post.published_at ?? undefined}>{date}</time></>}
              <><span className="article-page__byline-sep" aria-hidden>·</span><span>{post.views} {t('common.views')}</span></>
            </div>
          </header>

        {post.has_download && !contentUnlocked && (
          <section className="article-page__cta post-download-cta mb-4" aria-label={language === 'es' ? 'Descarga' : 'Download'}>
            {(() => {
              const { text: teaserText, hasMore } = getFirstWordsFromHtml(post.content, TEASER_WORDS);
              return teaserText ? (
                <p className="article-page__body mb-3 text-muted">{teaserText}{hasMore ? '…' : ''}</p>
              ) : null;
            })()}
            <p className="text-muted mb-3">{t('blogPost.downloadTeaser')}</p>
          </section>
        )}

        {post.video_url && (!post.has_download || contentUnlocked) && (() => {
          const embedUrl = getVideoEmbedUrl(post.video_url);
          return embedUrl ? (
            <div className="article-page__media">
              <div className="ratio ratio-16x9 rounded overflow-hidden">
                <iframe
                  src={embedUrl}
                  title="Video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          ) : (
            <div className="article-page__media">
              <video controls className="w-100 rounded" src={post.video_url}>
                {t('common.loading')}
              </video>
            </div>
          );
        })()}

        {(!post.has_download || contentUnlocked) && post.gallery && post.gallery.length > 0 && (
          <div className="article-page__media post-gallery-carousel">
            <div className="post-gallery-scroll">
              {post.gallery.map((src, i) => (
                <div key={i} className="post-gallery-item">
                  <img
                    src={src.startsWith('http') ? src : getImageUrl(src)}
                    alt=""
                    loading="lazy"
                    className="rounded"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {(!post.has_download || contentUnlocked) && (
        <div
          className="article-page__body post-content"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
        )}

        {(!post.has_download || contentUnlocked) && post.conclusion && (
          <aside className="article-page__conclusion post-conclusion" aria-label={language === 'es' ? 'Conclusión' : 'Conclusion'}>
            <h2 className="article-page__conclusion-title">{language === 'es' ? 'Conclusión' : 'Conclusion'}</h2>
            <div className="post-content" dangerouslySetInnerHTML={{ __html: post.conclusion }} />
          </aside>
        )}

        {post.has_download && !contentUnlocked && (() => {
            if (user === null) {
              return (
                <section className="article-page__cta post-download-cta" aria-label={language === 'es' ? 'Descarga' : 'Download'}>
                  <p className="text-muted mb-3">{t('blogPost.loginToDownload')}</p>
                  <NavLoginButton />
                </section>
              );
            }
            if (post.download_free) {
              return (
                <section className="article-page__cta post-download-cta" aria-label={language === 'es' ? 'Descarga' : 'Download'}>
                  {freeError && (
                    <div className="alert alert-warning py-2 mb-3" role="alert">
                      {freeError}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-success"
                    disabled={freeLoading}
                    onClick={async () => {
                      trackEvent('signal_free_download_click', {
                        post_id: post.id,
                        category: post.category,
                        language,
                      });
                      setFreeError(null);
                      setFreeLoading(true);
                      try {
                        const data = await api.post<{ downloadUrl: string; expiresAt: string }>(
                          `/api/blog/posts/${post.id}/free-download`,
                          {}
                        );
                        if (data?.downloadUrl || data !== undefined) {
                          if (typeof sessionStorage !== 'undefined') {
                            setPostUnlockedInSession(post.id);
                          }
                          setContentUnlocked(true);
                          if (!post.download_file_is_image && data?.downloadUrl) {
                            window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
                          }
                        }
                      } catch (e: unknown) {
                        const err = e as { response?: { status?: number } };
                        const msg = err?.response?.status === 401
                          ? t('blogPost.loginRequired')
                          : (e instanceof Error ? e.message : String(e)) === 'free_download_limit_or_expired'
                            ? (language === 'es' ? 'Esta descarga gratuita ya caducó o alcanzó el límite. No se pueden generar más enlaces.' : 'This free download has expired or reached the limit. No more links can be generated.')
                            : (e instanceof Error ? e.message : String(e));
                        setFreeError(msg);
                      } finally {
                        setFreeLoading(false);
                      }
                    }}
                  >
                    {freeLoading
                      ? (language === 'es' ? 'Preparando...' : 'Preparing...')
                      : (language === 'es' ? 'Descarga gratis' : 'Free download')}
                  </button>
                </section>
              );
            }
            const allowedMethods = (post.payment_methods?.length ? post.payment_methods : ['paypal', 'binance_pay', 'binance_deposit']) as string[];
            return (
          <section className="article-page__cta post-download-cta" aria-label={language === 'es' ? 'Comprar descarga' : 'Purchase download'}>
            {paymentError && (
              <div className="alert alert-warning py-2 mb-3" role="alert">
                {paymentError}
              </div>
            )}
            <div className="alert alert-info py-2 mb-3 small" role="status">
              {user === undefined ? (
                <span className="text-muted">{t('common.loading')}</span>
              ) : user ? (
                t('downloadEmailInfo.loggedIn')
              ) : (
                <>
                  {allowedMethods.includes('paypal') && <span className="d-block mb-1">{t('downloadEmailInfo.paypalOnly')}</span>}
                  {(allowedMethods.includes('binance_pay') || allowedMethods.includes('binance_deposit')) && (
                    <span>{t('downloadEmailInfo.binanceNoEmail')}</span>
                  )}
                </>
              )}
            </div>
            <div className="mb-3 d-flex flex-wrap align-items-end gap-2">
              <label className="small text-muted mb-0" htmlFor="coupon-input">
                {language === 'es' ? 'Código de descuento' : 'Discount code'}
              </label>
              <input
                id="coupon-input"
                type="text"
                className="form-control form-control-sm w-auto"
                placeholder={language === 'es' ? 'Ej. PROMO20' : 'e.g. PROMO20'}
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.trim().toUpperCase());
                  setCouponError(null);
                }}
                disabled={couponLoading}
              />
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={couponLoading || !couponCode}
                onClick={async () => {
                  setCouponError(null);
                  setCouponLoading(true);
                  try {
                    const res = await api.post<{ valid: boolean; discountedAmount?: number; amountBeforeDiscount?: number; error?: string }>(
                      '/api/payments/validate-coupon',
                      { code: couponCode, postId: post.id }
                    );
                    if (res?.valid && res.discountedAmount != null) {
                      setCouponApplied({ discountedAmount: res.discountedAmount, amountBeforeDiscount: res.amountBeforeDiscount ?? Number(post.download_price_usd) });
                    } else {
                      setCouponApplied(null);
                      setCouponError(res?.error ?? (language === 'es' ? 'Código no válido' : 'Invalid code'));
                    }
                  } catch {
                    setCouponApplied(null);
                    setCouponError(language === 'es' ? 'Error al validar el código' : 'Error validating code');
                  } finally {
                    setCouponLoading(false);
                  }
                }}
              >
                {couponLoading ? (language === 'es' ? 'Comprobando...' : 'Checking...') : (language === 'es' ? 'Aplicar' : 'Apply')}
              </button>
              {couponApplied && (
                <button
                  type="button"
                  className="btn btn-outline-warning btn-sm"
                  onClick={() => {
                    setCouponApplied(null);
                    setCouponError(null);
                  }}
                >
                  {language === 'es' ? 'Quitar' : 'Remove'}
                </button>
              )}
            </div>
            {couponError && (
              <div className="alert alert-warning py-2 mb-3 small" role="alert">
                {couponError}
              </div>
            )}
            <div className="d-flex flex-wrap align-items-center gap-3">
              <span className="text-muted">{t('blogPost.downloadPrice')}:</span>
              <strong className="text-light">
                {formatDownloadPrice(couponApplied ? couponApplied.discountedAmount : Number(post.download_price_usd))}
                {couponApplied && (
                  <span className="text-muted small ms-2">
                    ({language === 'es' ? 'antes' : 'was'} {formatDownloadPrice(couponApplied.amountBeforeDiscount)})
                  </span>
                )}
              </strong>
              {allowedMethods.includes('paypal') && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={paying !== 'idle'}
                onClick={async () => {
                  trackEvent('signal_checkout_start', {
                    post_id: post.id,
                    category: post.category,
                    language,
                    provider: 'paypal',
                  });
                  setPaymentError(null);
                  setPaying('paypal');
                  try {
                    const data = await api.post<{ orderId?: string; approvalUrl?: string; status?: 'captured'; downloadUrl?: string; download_file_is_image?: boolean }>('/api/payments/create-order', {
                      postId: post.id,
                      provider: 'paypal',
                      ...(couponApplied && couponCode ? { discountCode: couponCode } : {}),
                    });
                    if (isCapturedCheckoutResponse(data)) {
                      if (typeof sessionStorage !== 'undefined') {
                        setPostUnlockedInSession(post.id);
                      }
                      setContentUnlocked(true);
                      if (data.downloadUrl && !post.download_file_is_image) {
                        window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
                      }
                      setPaying('idle');
                      return;
                    }
                    if (data?.approvalUrl) window.location.href = data.approvalUrl;
                    else setPaying('idle');
                  } catch (e) {
                    setPaying('idle');
                    setPaymentError(e instanceof Error ? e.message : t('common.error'));
                  }
                }}
              >
                {paying === 'paypal'
                  ? (language === 'es' ? 'Redirigiendo a PayPal...' : 'Redirecting to PayPal...')
                  : (language === 'es' ? 'Pagar con PayPal' : 'Pay with PayPal')}
              </button>
              )}
              {allowedMethods.includes('binance_pay') && (
              <button
                type="button"
                className="btn btn-warning text-dark"
                disabled={paying !== 'idle'}
                onClick={async () => {
                  trackEvent('signal_checkout_start', {
                    post_id: post.id,
                    category: post.category,
                    language,
                    provider: 'binance_pay',
                  });
                  setPaymentError(null);
                  setPaying('binance');
                  try {
                    const data = await api.post<{
                      merchantTradeNo: string;
                      checkoutUrl: string;
                      qrcodeLink: string;
                      sandbox?: boolean;
                      status?: 'captured';
                      downloadUrl?: string;
                      download_file_is_image?: boolean;
                    }>('/api/payments/create-order', {
                      postId: post.id,
                      provider: 'binance_pay',
                      ...(couponApplied && couponCode ? { discountCode: couponCode } : {}),
                    });
                    if (isCapturedCheckoutResponse(data)) {
                      if (typeof sessionStorage !== 'undefined') {
                        setPostUnlockedInSession(post.id);
                      }
                      setContentUnlocked(true);
                      if (data.downloadUrl && !post.download_file_is_image) {
                        window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
                      }
                      setPaying('idle');
                      return;
                    }
                    if (data?.merchantTradeNo) {
                      navigate('/payment/wait', {
                        state: {
                          merchantTradeNo: data.merchantTradeNo,
                          checkoutUrl: data.checkoutUrl ?? '',
                          qrcodeLink: data.qrcodeLink ?? '',
                          sandbox: data.sandbox === true,
                        },
                      });
                    }
                    setPaying('idle');
                  } catch (e) {
                    setPaying('idle');
                    setPaymentError(e instanceof Error ? e.message : t('common.error'));
                  }
                }}
              >
                {paying === 'binance'
                  ? (language === 'es' ? 'Preparando...' : 'Preparing...')
                  : (language === 'es' ? 'Pagar con Binance Pay' : 'Pay with Binance Pay')}
              </button>
              )}
              {allowedMethods.includes('binance_deposit') && (
              <div className="d-flex flex-wrap align-items-center gap-2">
                <label className="small text-muted mb-0">{language === 'es' ? 'Red:' : 'Network:'}</label>
                <select
                  className="form-select form-select-sm w-auto"
                  value={transferNetwork}
                  onChange={(e) => setTransferNetwork(e.target.value)}
                  disabled={paying !== 'idle'}
                  title={language === 'es' ? 'Elige la red donde tienes tu USDT (BSC, TRON o Ethereum). No se puede enviar USDT de una red por otra.' : 'Choose the network where you hold your USDT (BSC, TRON or Ethereum). You cannot send USDT from one network over another.'}
                >
                  <option value="TRC20">{language === 'es' ? 'TRC20 (TRON) — comisión más baja' : 'TRC20 (TRON) — lowest fee'}</option>
                  <option value="BEP20">{language === 'es' ? 'BEP20 (BSC) — comisión baja' : 'BEP20 (BSC) — low fee'}</option>
                  <option value="ERC20">{language === 'es' ? 'ERC20 (Ethereum) — comisión más alta' : 'ERC20 (Ethereum) — higher fee'}</option>
                </select>
                <span className="small text-muted">
                  {language === 'es' ? '(elige la red donde tienes tu USDT)' : '(choose the network where you hold USDT)'}
                </span>
                <button
                  type="button"
                  className="btn btn-outline-warning text-warning"
                  disabled={paying !== 'idle'}
                  onClick={async () => {
                    trackEvent('signal_checkout_start', {
                      post_id: post.id,
                      category: post.category,
                      language,
                      provider: 'binance_deposit',
                    });
                    setPaymentError(null);
                    setPaying('transfer');
                    try {
                      const data = await api.post<{
                        reference: string;
                        address: string;
                        tag?: string;
                        network: string;
                        amount: string;
                        amountBase?: number;
                        status?: 'captured';
                        downloadUrl?: string;
                        download_file_is_image?: boolean;
                      }>('/api/payments/create-order', {
                        postId: post.id,
                        provider: 'binance_deposit',
                        network: transferNetwork,
                        ...(couponApplied && couponCode ? { discountCode: couponCode } : {}),
                      });
                      if (isCapturedCheckoutResponse(data)) {
                        if (typeof sessionStorage !== 'undefined') {
                          setPostUnlockedInSession(post.id);
                        }
                        setContentUnlocked(true);
                        if (data.downloadUrl && !post.download_file_is_image) {
                          window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
                        }
                        setPaying('idle');
                        return;
                      }
                      if (data?.reference) {
                        navigate('/payment/transfer', {
                          state: {
                            reference: data.reference,
                            address: data.address,
                            tag: data.tag,
                            network: data.network,
                            amount: data.amount,
                            amountBase: data.amountBase,
                          },
                        });
                      }
                      setPaying('idle');
                    } catch (e) {
                      setPaying('idle');
                      setPaymentError(e instanceof Error ? e.message : t('common.error'));
                    }
                  }}
                >
                  {paying === 'transfer'
                    ? (language === 'es' ? 'Preparando...' : 'Preparing...')
                    : (language === 'es' ? 'Transferencia USDT' : 'Transfer USDT')}
                </button>
              </div>
              )}
            </div>
          </section>
            );
          })()}

        <footer className="article-page__footer">
          <MoreNewsCarousel excludePostId={post.id} limit={4} language={language} />
        </footer>
        </div>
      </article>
    </div>
  );
}
