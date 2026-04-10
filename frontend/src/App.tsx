import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import AllNews from './pages/AllNews';
import BlogPost from './pages/BlogPost';
import { AppLayout } from './components/AppLayout';
import AppDashboard from './pages/AppDashboard';
import BlogAdmin from './pages/BlogAdmin';
import PaymentsList from './pages/PaymentsList';
import NotificationsList from './pages/NotificationsList';
import EmailTemplates from './pages/EmailTemplates';
import Settings from './pages/Settings';
import UsersAdmin from './pages/UsersAdmin';
import PaymentReturn from './pages/PaymentReturn';
import PaymentCancel from './pages/PaymentCancel';
import PaymentWait from './pages/PaymentWait';
import PaymentTransfer from './pages/PaymentTransfer';
import MyPurchases from './pages/MyPurchases';
import DownloadError from './pages/DownloadError';
import DiscountCodes from './pages/DiscountCodes';
import SitePageView from './pages/SitePageView';
import SitePagesAdmin from './pages/SitePagesAdmin';
import { CouponBanner } from './components/CouponBanner';
import { SiteFooter } from './components/SiteFooter';
import { captureCouponAndRefFromUrl } from './utils/couponStorage';
import { trackPageView } from './utils/analytics';
import { prefetchCategoryMeta } from './utils/useCategoryMeta';

const API_BASE = '';

export function getApiBase(): string {
  return API_BASE;
}

function AnalyticsRouteListener() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
}

export default function App() {
  useEffect(() => {
    captureCouponAndRefFromUrl();
    void prefetchCategoryMeta();
  }, []);

  return (
    <div className="app-viewport">
      <AnalyticsRouteListener />
      <CouponBanner />
      <div className="app-viewport__content">
        <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/noticias" element={<AllNews />} />
            <Route path="/noticias/:categoryPath" element={<AllNews />} />
            <Route path="/noticias/:categoryPath/:slug" element={<BlogPost />} />
            <Route path="/news" element={<AllNews />} />
            <Route path="/news/:categoryPath" element={<AllNews />} />
            <Route path="/news/:categoryPath/:slug" element={<BlogPost />} />
            <Route path="/paginas/:slug" element={<SitePageView />} />
            <Route path="/pages/:slug" element={<SitePageView />} />
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<AppDashboard />} />
              <Route path="blog-admin" element={<BlogAdmin />} />
              <Route path="site-pages" element={<SitePagesAdmin />} />
              <Route path="payments" element={<PaymentsList />} />
              <Route path="users" element={<UsersAdmin />} />
              <Route path="notifications" element={<NotificationsList />} />
              <Route path="email-templates" element={<EmailTemplates />} />
              <Route path="discount-codes" element={<DiscountCodes />} />
              <Route path="settings" element={<Settings />} />
              <Route path="my-purchases" element={<MyPurchases />} />
            </Route>
            <Route path="/payment/return" element={<PaymentReturn />} />
            <Route path="/payment/cancel" element={<PaymentCancel />} />
            <Route path="/payment/wait" element={<PaymentWait />} />
            <Route path="/payment/transfer" element={<PaymentTransfer />} />
            <Route path="/download-error" element={<DownloadError />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
      </div>
      <SiteFooter />
    </div>
  );
}
