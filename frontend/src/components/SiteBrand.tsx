import { Link } from 'react-router-dom';
import { useSiteConfig } from '../contexts/SiteConfig';

/** Marca del sitio (enlace a inicio) con favicon y título configurable. */
export function SiteBrand({ className = 'navbar-brand' }: { className?: string }) {
  const { site_title } = useSiteConfig();
  return (
    <Link className={className} to="/">
      <img src="/favicon.svg" alt="" className="navbar-brand-icon me-2" />
      {site_title}
    </Link>
  );
}
