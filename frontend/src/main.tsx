import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { LanguageProvider } from './utils/i18n';
import { SiteConfigProvider } from './contexts/SiteConfig';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import { initAnalytics } from './utils/analytics';

initAnalytics();

// StrictMode desactivado: ReactQuill usa findDOMNode (deprecado) y muestra warning en consola
ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <LanguageProvider>
      <SiteConfigProvider>
        <App />
      </SiteConfigProvider>
    </LanguageProvider>
  </BrowserRouter>
);
