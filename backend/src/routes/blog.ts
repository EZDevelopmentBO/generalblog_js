import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import {
  listPublicPosts,
  getPostBySlug,
  getPostById,
  getPostDownloadByPostId,
  isImageDownloadFile,
  incrementViews,
  isValidCategory,
  buildPostPublicUrl,
} from '../services/blog';
import { downloadsDir } from '../middlewares/uploadDownload';
import { getSetting } from '../services/settings';
import { getPublishedSitePageBySlug, listPublishedSitePagesPublic } from '../services/sitePages';
import { recordFreeDownloadAndCreateToken } from '../services/payment';
import { env } from '../config/env';
import type { User } from '../types';
import { getPublicCategoriesWithMeta } from '../services/blogCategory';
import { requireAuth } from '../middlewares/auth';

export const blogRouter = Router();

const DEFAULT_SITE_TITLE = 'Mi blog';

/** Sirve el gráfico interno del post (SVG con valores) para enlaces externos (ej. WhatsApp). Solo si el post tiene descarga SVG. */
blogRouter.get('/post/:postId/signal-chart', async (req: Request, res: Response) => {
  try {
    const postId = parseInt(String(req.params.postId), 10);
    if (!Number.isFinite(postId) || postId < 1) {
      res.status(400).json({ error: 'postId inválido' });
      return;
    }
    const download = await getPostDownloadByPostId(postId);
    if (!download || !download.file_path || !download.file_path.toLowerCase().endsWith('.svg')) {
      res.status(404).json({ error: 'Gráfico no encontrado' });
      return;
    }
    const filePath = path.join(downloadsDir, download.file_path);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Archivo no encontrado' });
      return;
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(path.resolve(filePath));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al servir gráfico' });
  }
});

/** Sirve el gráfico del post como JPG (para WhatsApp y otros que no aceptan SVG). Convierte SVG → JPG on the fly.
 *  Tras enviar la imagen a WhatsApp se marca el envío y esta ruta devuelve 404 (no es recurso público). */
blogRouter.get('/post/:postId/signal-chart.jpg', async (req: Request, res: Response) => {
  try {
    const postId = parseInt(String(req.params.postId), 10);
    if (!Number.isFinite(postId) || postId < 1) {
      res.status(400).json({ error: 'postId inválido' });
      return;
    }
    const download = await getPostDownloadByPostId(postId);
    if (!download || !download.file_path || !download.file_path.toLowerCase().endsWith('.svg')) {
      res.status(404).json({ error: 'Gráfico no encontrado' });
      return;
    }
    if (download.whatsapp_sent_at) {
      res.status(404).json({ error: 'Recurso no disponible' });
      return;
    }
    const filePath = path.join(downloadsDir, download.file_path);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Archivo no encontrado' });
      return;
    }
    const svgBuffer = fs.readFileSync(filePath);
    const jpgBuffer = await sharp(svgBuffer)
      .jpeg({ quality: 90 })
      .toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(jpgBuffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al convertir gráfico a JPG' });
  }
});

/** Escapa texto para usar dentro de atributos HTML (evita rotura de meta y XSS). */
function escapeHtmlAttr(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texto plano seguro dentro de elementos HTML (párrafos). */
function escapeHtmlPcdata(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripHtmlToPlain(html: string, maxLen: number): string {
  const text = String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trim()}…`;
}

/** Genera HTML con meta OG para crawlers (buscadores, redes, etc.). Exportado para uso en index (middleware bots). */
export function buildOgHtml(post: {
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  excerpt: string | null;
  featured_image: string | null;
  slug: string;
  category: string;
  language: string | null;
  /** Si true, no incrustamos HTML del cuerpo (contenido de pago); solo extracto/meta. */
  has_download?: boolean;
  content?: string | null;
  published_at?: string | null;
}): string {
  const title = post.meta_title || post.title;
  const description = post.meta_description || post.excerpt || post.title;
  const apiBase = env.API_URL.replace(/\/$/, '');
  let ogImage = '';
  if (post.featured_image) {
    const p = post.featured_image.trim();
    if (p.startsWith('http')) ogImage = p;
    else if (p.startsWith('/')) ogImage = `${apiBase}${p}`;
    else ogImage = `${apiBase}/api/uploads/${encodeURIComponent(p)}`;
  }
  const canonicalUrl = buildPostPublicUrl(
    post.slug,
    post.category,
    post.language ?? 'es',
    env.FRONTEND_URL.replace(/\/$/, '')
  );
  const t = escapeHtmlAttr(title);
  const d = escapeHtmlAttr(description);
  const img = ogImage ? escapeHtmlAttr(ogImage) : '';
  const url = escapeHtmlAttr(canonicalUrl);
  let teaser =
    (post.excerpt && post.excerpt.trim()) ||
    (post.meta_description && post.meta_description.trim()) ||
    '';
  if (!teaser && !post.has_download && post.content) {
    teaser = stripHtmlToPlain(post.content, 900);
  }
  if (!teaser) teaser = description;
  const teaserHtml = escapeHtmlPcdata(teaser);
  const pub = post.published_at
    ? escapeHtmlAttr(
        typeof post.published_at === 'string'
          ? post.published_at
          : new Date(post.published_at).toISOString()
      )
    : '';
  return `<!DOCTYPE html>
<html lang="${(post.language ?? 'es') === 'en' ? 'en' : 'es'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t}</title>
  <meta name="description" content="${d}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url" content="${url}" />
${img ? `  <meta property="og:image" content="${img}" />` : ''}
  <meta property="og:site_name" content="Mi blog" />
${pub ? `  <meta property="article:published_time" content="${pub}" />` : ''}
  <meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
${img ? `  <meta name="twitter:image" content="${img}" />` : ''}
</head>
<body>
  <article>
    <h1>${t}</h1>
    <p>${teaserHtml}</p>
  </article>
</body>
</html>`;
}
const DEFAULT_SITE_SLOGAN = 'Artículos, ideas y novedades';

/** Páginas estáticas publicadas (menús, pies). Query: language=es|en */
blogRouter.get('/static-pages', async (req: Request, res: Response) => {
  try {
    const language = (req.query.language as string) || 'es';
    const pages = await listPublishedSitePagesPublic(language);
    res.json({ pages });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Una página publicada por slug. Query: language=es|en */
blogRouter.get('/static-pages/:slug', async (req: Request, res: Response) => {
  try {
    const language = (req.query.language as string) || 'es';
    const page = await getPublishedSitePageBySlug(req.params.slug, language);
    if (!page) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ page });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Configuración pública del sitio (título, slogan, fondo landing-value). Sin autenticación. */
blogRouter.get('/site-config', async (_req: Request, res: Response) => {
  try {
    const site_title = (await getSetting('site_title')) ?? DEFAULT_SITE_TITLE;
    const site_slogan = (await getSetting('site_slogan')) ?? DEFAULT_SITE_SLOGAN;
    const landing_value_bg_url = (await getSetting('landing_value_bg_url')) ?? '';
    res.json({ site_title, site_slogan, landing_value_bg_url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

blogRouter.get('/categories', async (req: Request, res: Response) => {
  try {
    const language = (req.query.language as string) || undefined;
    const categories = await getPublicCategoriesWithMeta(language === 'es' || language === 'en' ? language : undefined);
    res.json({ categories });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

blogRouter.get('/posts', async (req: Request, res: Response) => {
  try {
    const language = (req.query.language as string) || undefined;
    const category = (req.query.category as string) || undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || '10', 10), 50);
    const offset = parseInt((req.query.offset as string) || '0', 10);
    const order = (req.query.order as 'published_at' | 'random') || 'published_at';
    const excludeId = req.query.excludeId != null ? parseInt(String(req.query.excludeId), 10) : undefined;

    if (category && !isValidCategory(category)) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }

    const { posts, total } = await listPublicPosts({
      language,
      category: category || undefined,
      limit,
      offset,
      order,
      excludeId: Number.isNaN(excludeId!) ? undefined : excludeId,
    });
    res.json({ posts, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

blogRouter.get('/posts/slug/:slug', async (req: Request, res: Response) => {
  try {
    const post = await getPostBySlug(req.params.slug, true);
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    let downloadFileIsImage = false;
    if (post.has_download) {
      const download = await getPostDownloadByPostId(post.id);
      const fn = download?.filename_display ?? download?.file_path ?? '';
      downloadFileIsImage = isImageDownloadFile(fn);
    }
    res.json({ ...post, download_file_is_image: downloadFileIsImage });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** HTML con meta OG para crawlers (WhatsApp, Facebook, etc.). Acepta slug en URL o path en query: ?path=/noticias/crypto/my-slug */
function getSlugFromRequest(req: Request): string | null {
  const slugParam = req.params.slug;
  if (slugParam) return slugParam;
  const pathQuery = (req.query.path as string)?.trim();
  if (!pathQuery) return null;
  const parts = pathQuery.replace(/^\/+/, '').split('/');
  if (parts.length >= 3 && (parts[0] === 'noticias' || parts[0] === 'news')) return parts[parts.length - 1] || null;
  return null;
}

blogRouter.get('/posts/og-html/:slug?', async (req: Request, res: Response) => {
  try {
    const slug = getSlugFromRequest(req);
    if (!slug) {
      res.status(400).send('Missing slug or path');
      return;
    }
    const post = await getPostBySlug(slug, true);
    if (!post) {
      res.status(404).send('Not found');
      return;
    }
    const html = buildOgHtml(post);
    res.set('Vary', 'User-Agent');
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

blogRouter.post('/posts/slug/:slug/view', async (req: Request, res: Response) => {
  try {
    await incrementViews(req.params.slug);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

blogRouter.post('/posts/:id/free-download', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as User;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid post id' });
      return;
    }
    const post = await getPostById(id);
    if (!post || !post.published || !post.has_download || !post.download_free) {
      res.status(404).json({ error: 'Post not found or download not available' });
      return;
    }
    const download = await getPostDownloadByPostId(id);
    if (!download) {
      res.status(404).json({ error: 'Download file not available' });
      return;
    }
    const { downloadUrl, expiresAt } = await recordFreeDownloadAndCreateToken(id, user.id);
    res.json({ downloadUrl, expiresAt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});
