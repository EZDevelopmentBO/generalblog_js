import { Link } from 'react-router-dom';
import { useT } from '../utils/i18n';
import { useAppUser } from '../components/AppLayout';
import { canManageBlogContent, canManageDiscountCodes } from '../types';

/** Iconos MDI (Material Design Icons) viewBox 0 0 24 24 */
const ICONS = {
  shopping:
    'M19 6H17C17 3.2 14.8 1 12 1S7 3.2 7 6H5C3.9 6 3 6.9 3 8V20C3 21.1 3.9 22 5 22H19C20.1 22 21 21.1 21 20V8C21 6.9 20.1 6 19 6M12 3C13.7 3 15 4.3 15 6H9C9 4.3 10.3 3 12 3M19 20H5V8H19V20M12 12C10.3 12 9 10.7 9 9H7C7 11.8 9.2 14 12 14S17 11.8 17 9H15C15 10.7 13.7 12 12 12Z',
  currencyUsd:
    'M7,15H9C9,16.08 10.37,17 12,17C13.63,17 15,16.08 15,15C15,13.9 13.96,13.5 11.76,12.97C9.64,12.44 7,11.78 7,9C7,7.21 8.47,5.69 10.5,5.18V3H13.5V5.18C15.53,5.69 17,7.21 17,9H15C15,7.92 13.63,7 12,7C10.37,7 9,7.92 9,9C9,10.1 10.04,10.5 12.24,11.03C14.36,11.56 17,12.22 17,15C17,16.79 15.53,18.31 13.5,18.82V21H10.5V18.82C8.47,18.31 7,16.79 7,15Z',
  post: 'M19 5V19H5V5H19M21 3H3V21H21V3M17 17H7V16H17V17M17 15H7V14H17V15M17 12H7V7H17V12Z',
  send: 'M2,21L23,12L2,3V10L17,12L2,14V21Z',
  emailEdit:
    'M19.07 13.88L13 19.94V22H15.06L21.12 15.93M22.7 13.58L21.42 12.3C21.32 12.19 21.18 12.13 21.04 12.13C20.89 12.14 20.75 12.19 20.65 12.3L19.65 13.3L21.7 15.3L22.7 14.3C22.89 14.1 22.89 13.78 22.7 13.58M11 18H4V8L12 13L20 8V10H22V6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H11V18M20 6L12 11L4 6H20Z',
  ticketPercent:
    'M14.8 8L16 9.2L9.2 16L8 14.8L14.8 8M4 4H20C21.11 4 22 4.89 22 6V10C20.9 10 20 10.9 20 12C20 13.11 20.9 14 22 14V18C22 19.11 21.11 20 20 20H4C2.9 20 2 19.11 2 18V14C3.11 14 4 13.11 4 12C4 10.9 3.11 10 2 10V6C2 4.89 2.9 4 4 4M4 6V8.54C5.24 9.26 6 10.57 6 12C6 13.43 5.24 14.75 4 15.46V18H20V15.46C18.76 14.75 18 13.43 18 12C18 10.57 18.76 9.26 20 8.54V6H4M9.5 8C10.33 8 11 8.67 11 9.5C11 10.33 10.33 11 9.5 11C8.67 11 8 10.33 8 9.5C8 8.67 8.67 8 9.5 8M14.5 13C15.33 13 16 13.67 16 14.5C16 15.33 15.33 16 14.5 16C13.67 16 13 15.33 13 14.5C13 13.67 13.67 13 14.5 13Z',
  cog: 'M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10M10,22C9.75,22 9.54,21.82 9.5,21.58L9.13,18.93C8.5,18.68 7.96,18.34 7.44,17.94L4.95,18.95C4.73,19.03 4.46,18.95 4.34,18.73L2.34,15.27C2.21,15.05 2.27,14.78 2.46,14.63L4.57,12.97L4.5,12L4.57,11L2.46,9.37C2.27,9.22 2.21,8.95 2.34,8.73L4.34,5.27C4.46,5.05 4.73,4.96 4.95,5.05L7.44,6.05C7.96,5.66 8.5,5.32 9.13,5.07L9.5,2.42C9.54,2.18 9.75,2 10,2H14C14.25,2 14.46,2.18 14.5,2.42L14.87,5.07C15.5,5.32 16.04,5.66 16.56,6.05L19.05,5.05C19.27,4.96 19.54,5.05 19.66,5.27L21.66,8.73C21.79,8.95 21.73,9.22 21.54,9.37L19.43,11L19.5,12L19.43,13L21.54,14.63C21.73,14.78 21.79,15.05 21.66,15.27L19.66,18.73C19.54,18.95 19.27,19.04 19.05,18.95L16.56,17.95C16.04,18.34 15.5,18.68 14.87,18.93L14.5,21.58C14.46,21.82 14.25,22 14,22H10M11.25,4L10.88,6.61C9.68,6.86 8.62,7.5 7.85,8.39L5.44,7.35L4.69,8.65L6.8,10.2C6.4,11.37 6.4,12.64 6.8,13.8L4.68,15.36L5.43,16.66L7.86,15.62C8.63,16.5 9.68,17.14 10.87,17.38L11.24,20H12.76L13.13,17.39C14.32,17.14 15.37,16.5 16.14,15.62L18.57,16.66L19.32,15.36L17.2,13.81C17.6,12.64 17.6,11.37 17.2,10.2L19.31,8.65L18.56,7.35L16.15,8.39C15.38,7.5 14.32,6.86 13.12,6.62L12.75,4H11.25Z',
  fileDoc:
    'M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z',
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4m0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z',
} as const;

type NeonVariant = 'cyan' | 'green' | 'amber' | 'magenta' | 'blue' | 'yellow' | 'violet';

function DashboardIcon({ path, color }: { path: string; color: string }) {
  return (
    <svg
      className="app-dashboard-card__icon"
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

const DASHBOARD_CARDS: Array<{
  to: string;
  titleKey: string;
  hintKey: string;
  icon: keyof typeof ICONS;
  neon: NeonVariant;
  superuserOnly?: boolean;
  blogAdminOnly?: boolean;
}> = [
  { to: '/app/payments', titleKey: 'nav.payments', hintKey: 'app.paymentsCardHint', icon: 'currencyUsd', neon: 'green', superuserOnly: true },
  { to: '/app/users', titleKey: 'nav.users', hintKey: 'app.usersCardHint', icon: 'person', neon: 'blue', superuserOnly: true },
  { to: '/app/blog-admin', titleKey: 'nav.blogAdmin', hintKey: 'app.blogAdminCardHint', icon: 'post', neon: 'amber', blogAdminOnly: true },
  { to: '/app/site-pages', titleKey: 'nav.sitePages', hintKey: 'app.sitePagesCardHint', icon: 'fileDoc', neon: 'cyan', blogAdminOnly: true },
  { to: '/app/notifications', titleKey: 'nav.notifications', hintKey: 'app.notificationsCardHint', icon: 'send', neon: 'magenta', superuserOnly: true },
  { to: '/app/email-templates', titleKey: 'nav.emailTemplates', hintKey: 'app.emailTemplatesCardHint', icon: 'emailEdit', neon: 'blue', superuserOnly: true },
  { to: '/app/discount-codes', titleKey: 'nav.discountCodes', hintKey: 'app.discountCodesCardHint', icon: 'ticketPercent', neon: 'yellow' },
  { to: '/app/settings', titleKey: 'nav.settings', hintKey: 'app.settingsCardHint', icon: 'cog', neon: 'violet', superuserOnly: true },
  { to: '/app/my-purchases', titleKey: 'nav.myPurchases', hintKey: 'app.myPurchasesCardHint', icon: 'shopping', neon: 'green' },
];

const NEON_ICON_COLORS: Record<NeonVariant, string> = {
  cyan: '#67e8f9',
  green: '#5eead4',
  amber: '#fde047',
  magenta: '#f9a8d4',
  blue: '#93c5fd',
  yellow: '#fef08a',
  violet: '#c4b5fd',
};

export default function AppDashboard() {
  const t = useT();
  const user = useAppUser();
  if (!user) return null;

  const isSuperuser = user.role === 'superuser';
  const canBlogAdmin = canManageBlogContent(user.role, user.permissions);
  const canDiscountAdmin = canManageDiscountCodes(user.role, user.permissions);
  const cards = DASHBOARD_CARDS.filter((c) => {
    if (c.to === '/app/discount-codes') return canDiscountAdmin;
    if (c.blogAdminOnly) return canBlogAdmin;
    if (c.superuserOnly) return isSuperuser;
    return true;
  });

  return (
    <main className="container py-5">
      <h1 className="h3 mb-2">{t('app.welcome')}, {user.name}</h1>
      <p className="text-muted mb-4">{t('app.dashboardIntro')}</p>

      <div className="row g-3">
        {cards.map((card) => (
          <div key={card.to} className="col-sm-6 col-md-4">
            <Link
              to={card.to}
              className={`card app-dashboard-card app-dashboard-card--${card.neon} text-light text-decoration-none h-100 hover-lift d-block`}
            >
              <div className="card-body">
                <DashboardIcon path={ICONS[card.icon]} color={NEON_ICON_COLORS[card.neon]} />
                <h2 className="h6 card-title mt-2">{t(card.titleKey)}</h2>
                <p className="card-text small text-muted mb-0">{t(card.hintKey)}</p>
              </div>
            </Link>
          </div>
        ))}
      </div>
      {!isSuperuser && !canBlogAdmin && (
        <p className="text-muted small mt-3 mb-0">{t('app.noSuperuserHint')}</p>
      )}

    </main>
  );
}
