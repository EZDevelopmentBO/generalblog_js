import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { pool } from './config/database';
import { configurePassport, authRouter } from './routes/auth';
import { blogRouter, buildOgHtml } from './routes/blog';
import { getPostBySlug, getPublicPostsByCategoryForSitemap, buildPostPublicUrl } from './services/blog';
import { listPublishedSitePageSitemapEntries } from './services/sitePages';
import { getLLMProvider } from './services/llm/factory';
import { blogAdminRouter } from './routes/blogAdmin';
import { uploadsRouter } from './routes/uploads';
import { downloadRouter } from './routes/download';
import { paymentsRouter } from './routes/payments';
import { meRouter } from './routes/me';
import { webhooksRouter, binancePayWebhookHandler } from './routes/webhooks';
import { refreshBlogCategoriesCache, getOrderedCategorySlugs, isValidCategory } from './services/blogCategory';

const PgSession = connectPgSimple(session);

const app = express();

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

// Binance Pay webhook necesita body raw para verificar firma RSA; se monta antes de express.json()
app.use(
  '/api/webhooks/binance-pay',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    const b = req.body as Buffer;
    (req as express.Request & { rawBody?: Buffer }).rawBody = b;
    try {
      (req as express.Request).body = b.length ? JSON.parse(b.toString('utf8')) : {};
    } catch {
      (req as express.Request).body = {};
    }
    next();
  },
  binancePayWebhookHandler
);

app.use(express.json());
app.use(cookieParser());
const isProduction = process.env.NODE_ENV === 'production';
const isLocalhost = (env.FRONTEND_URL || env.API_URL || '').includes('localhost');
app.use(
  session({
    secret: env.SESSION_SECRET,
    store: new PgSession({ pool, createTableIfMissing: true }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      // Solo en local (localhost): compartir cookie entre puerto 4000 y 5173
      ...(!isProduction && isLocalhost && { domain: 'localhost' }),
    },
  })
);

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// Log de auth en desarrollo para depurar sesión/cookies
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    if (req.path.startsWith('/auth') || req.path === '/api/blog/admin/posts') {
      const hasCookie = Boolean(req.headers.cookie);
      const isAuth = req.isAuthenticated?.();
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | Cookie: ${hasCookie} | Autenticado: ${isAuth}`);
    }
    next();
  });
}

app.use('/auth', authRouter);
app.use('/api/blog/upload', uploadsRouter);
app.use('/api/blog/admin', blogAdminRouter);
app.use('/api/blog', blogRouter);
app.use('/api/download', downloadRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/me', meRouter);
app.use('/api/webhooks', webhooksRouter);

const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/api/uploads', express.static(uploadsDir));

app.get('/health', (_req, res) => res.json({ ok: true }));

const baseUrl = env.FRONTEND_URL.replace(/\/$/, '');
app.get('/robots.txt', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Sitemap: ${baseUrl}/sitemap.xml
`);
});

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Sitemap dinámico para SEO. sitemap.xml ahora actúa como índice de sitemaps (sitemapindex). */
app.get('/sitemap.xml', async (_req, res) => {
  try {
    const base = env.FRONTEND_URL.replace(/\/$/, '');
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const sitemaps: { loc: string; lastmod: string }[] = [];

    // Sitemap estático
    sitemaps.push({ loc: `${base}/sitemaps/static.xml`, lastmod: todayStr });

    // Sitemaps por categoría (slugs en blog_categories)
    const categories = getOrderedCategorySlugs();
    for (const cat of categories) {
      sitemaps.push({ loc: `${base}/sitemaps/category-${cat}.xml`, lastmod: todayStr });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps
  .map(
    (s) => `  <sitemap>
    <loc>${escapeXml(s.loc)}</loc>
    <lastmod>${s.lastmod}</lastmod>
  </sitemap>`
  )
  .join('\n')}
</sitemapindex>`;
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (e) {
    console.error('[sitemap]', e);
    res.status(500).set('Content-Type', 'text/plain').send('Error generating sitemap');
  }
});

/** Sitemap estático: home, listados, páginas CMS y rutas principales. */
app.get('/sitemaps/static.xml', async (_req, res) => {
  try {
    const base = env.FRONTEND_URL.replace(/\/$/, '');
    const today = new Date().toISOString().slice(0, 10);
    const urls: { loc: string; lastmod: string; changefreq: string; priority: string }[] = [
      { loc: base, lastmod: today, changefreq: 'daily', priority: '1.0' },
      { loc: `${base}/noticias`, lastmod: today, changefreq: 'daily', priority: '0.9' },
      { loc: `${base}/news`, lastmod: today, changefreq: 'daily', priority: '0.9' },
    ];
    const pageUrls = await listPublishedSitePageSitemapEntries(base);
    urls.push(...pageUrls);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (e) {
    console.error('[sitemap static]', e);
    res.status(500).set('Content-Type', 'text/plain').send('Error generating static sitemap');
  }
});

/** Sitemaps por categoría: /sitemaps/category-crypto.xml, etc. */
app.get('/sitemaps/category-:category.xml', async (req, res) => {
  try {
    const base = env.FRONTEND_URL.replace(/\/$/, '');
    const cat = String(req.params.category || '').toLowerCase();
    if (!isValidCategory(cat)) {
      res.status(404).send('Not found');
      return;
    }
    const posts = await getPublicPostsByCategoryForSitemap(cat);
    const today = new Date().toISOString().slice(0, 10);
    const urls = posts.map((p) => {
      const lastmod = p.published_at
        ? typeof p.published_at === 'string'
          ? p.published_at.slice(0, 10)
          : new Date(p.published_at).toISOString().slice(0, 10)
        : today;
      return {
        loc: buildPostPublicUrl(p.slug, p.category, p.language ?? 'es', base),
        lastmod,
      };
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (e) {
    console.error('[sitemap category]', e);
    res.status(500).set('Content-Type', 'text/plain').send('Error generating category sitemap');
  }
});

const frontendDist = env.FRONTEND_DIST ? path.resolve(process.cwd(), env.FRONTEND_DIST) : '';
const frontendDistExists = frontendDist && fs.existsSync(frontendDist);
if (env.FRONTEND_DIST) {
  console.log(`FRONTEND_DIST=${env.FRONTEND_DIST} → resolved: ${frontendDist}, exists: ${frontendDistExists}`);
  if (!frontendDistExists) console.warn('OG meta para redes: no se sirve SPA desde el backend (ruta no existe). Los bots deben recibir HTML desde el proxy (Nginx).');
}

/** User-Agent de crawlers que piden meta OG (no ejecutan JS). */
const BOT_UA_PATTERN =
  /facebookexternalhit|WhatsApp|Twitterbot|TelegramBot|LinkedInBot|Slackbot|Discordbot|Pinterest|Googlebot|Google-InspectionTool|bingbot|Applebot|ia_archiver/i;

function isBotUserAgent(ua: string | undefined): boolean {
  return Boolean(ua && BOT_UA_PATTERN.test(ua));
}

/** Si el backend sirve el SPA: para bots en URLs de post, devolver HTML con meta OG. */
if (frontendDistExists) {
  app.get(/^\/(noticias|news)\/[^/]+\/[^/]+$/, async (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (!isBotUserAgent(req.get('user-agent'))) return next();
    const segments = req.path.split('/').filter(Boolean);
    const slug = segments[segments.length - 1];
    if (!slug) return next();
    try {
      const post = await getPostBySlug(slug, true);
      if (!post) return next();
      const html = buildOgHtml(post);
      res.type('html').send(html);
    } catch {
      next();
    }
  });

  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

async function startServer(): Promise<void> {
  try {
    await refreshBlogCategoriesCache();
  } catch (e) {
    console.error('[blog categories] Error al cargar caché de categorías:', e);
  }
  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
    const llmProvider = getLLMProvider();
    console.log(llmProvider ? `LLM provider: ${llmProvider.name}` : 'LLM provider: no configurado (GROQ_API_KEY o SILICONFLOW_API_KEY + LLM_PROVIDER).');
  });
}

void startServer();
