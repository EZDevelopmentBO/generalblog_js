import fs from 'fs';
import path from 'path';
import { query } from '../config/database';
import { downloadsDir } from '../middlewares/uploadDownload';
import type {
  BlogPostRow,
  BlogPostPublic,
  BlogPostCreateInput,
  BlogCategory,
  PostDownloadRow,
} from '../types';
import { buildFullSlug, titleToSlug } from './slug';
import { getCategoryUrlPath, isValidCategory as isValidCategorySlug } from './blogCategory';

function sanitizeHtml(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

export function isValidCategory(cat: string): cat is BlogCategory {
  return isValidCategorySlug(cat);
}

export async function findUniqueSlug(
  baseSlug: string,
  excludeId?: number
): Promise<string> {
  let slug = baseSlug;
  let suffix = 0;
  for (;;) {
    const { rows } = await query<{ id: number }>(
      'SELECT id FROM blog_posts WHERE slug = $1 AND ($2::int IS NULL OR id != $2)',
      [slug, excludeId ?? null]
    );
    if (rows.length === 0) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

export async function createPost(
  input: BlogPostCreateInput,
  authorId: number | null
): Promise<BlogPostRow> {
  const publishedAt = input.published_at ?? (input.published ? new Date().toISOString() : null);
  const dateForSlug = publishedAt ? new Date(publishedAt) : new Date();
  const baseSlug = input.slug != null && input.slug.trim() !== ''
    ? input.slug.trim()
    : buildFullSlug(input.title, dateForSlug);
  const slug = await findUniqueSlug(baseSlug);

  const content = sanitizeHtml(input.content);

  const galleryJson = Array.isArray(input.gallery) ? JSON.stringify(input.gallery) : (input.gallery ?? null);
  const hasDownload = input.has_download ?? false;
  const priceUsd = input.download_price_usd != null ? Number(input.download_price_usd) : 1;
  const downloadFree = input.download_free ?? false;
  const allowedMethods = ['paypal', 'binance_pay', 'binance_deposit'];
  const paymentMethods =
    Array.isArray(input.payment_methods) && input.payment_methods.length > 0
      ? input.payment_methods.filter((m) => allowedMethods.includes(m))
      : allowedMethods;
  const { rows } = await query<BlogPostRow>(
    `INSERT INTO blog_posts (
      title, slug, category, content, excerpt, featured_image, author_id,
      published, published_at, meta_title, meta_description, meta_keywords,
      language, related_title, related_year, video_url, gallery, conclusion,
      has_download, download_price_usd, payment_methods, download_free
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20, $21::text[], $22)
    RETURNING *`,
    [
      input.title,
      slug,
      input.category,
      content,
      input.excerpt ?? null,
      input.featured_image ?? null,
      authorId,
      input.published ?? false,
      publishedAt,
      input.meta_title ?? null,
      input.meta_description ?? null,
      input.meta_keywords ?? null,
      input.language ?? 'es',
      input.related_title ?? null,
      input.related_year ?? null,
      input.video_url ?? null,
      galleryJson ?? '[]',
      input.conclusion ?? null,
      hasDownload,
      priceUsd,
      paymentMethods,
      downloadFree,
    ]
  );
  return rows[0];
}

export async function updatePost(
  id: number,
  input: Partial<BlogPostCreateInput> & { title?: string; published_at?: string | null }
): Promise<BlogPostRow | null> {
  const existing = await getPostById(id);
  if (!existing) return null;

  let slug = existing.slug;
  const needNewSlug = input.title && input.title !== existing.title;

  if (needNewSlug) {
    const dateForSlug = input.published_at
      ? new Date(input.published_at)
      : existing.published_at
        ? new Date(existing.published_at)
        : new Date();
    const baseSlug = buildFullSlug(input.title, dateForSlug);
    slug = await findUniqueSlug(baseSlug, id);
  }

  const content = input.content !== undefined ? sanitizeHtml(input.content) : existing.content;
  const galleryJson =
    input.gallery !== undefined
      ? (Array.isArray(input.gallery) ? JSON.stringify(input.gallery) : input.gallery ?? '[]')
      : (Array.isArray(existing.gallery) ? JSON.stringify(existing.gallery) : existing.gallery ?? '[]');

  const allowedMethods = ['paypal', 'binance_pay', 'binance_deposit'];
  const paymentMethods =
    input.payment_methods !== undefined
      ? (Array.isArray(input.payment_methods) && input.payment_methods.length > 0
          ? input.payment_methods.filter((m) => allowedMethods.includes(m))
          : allowedMethods)
      : (existing.payment_methods?.length ? existing.payment_methods : allowedMethods);

  await query(
    `UPDATE blog_posts SET
      title = COALESCE($2, title),
      slug = $3,
      category = COALESCE($4, category),
      content = $5,
      excerpt = COALESCE($6, excerpt),
      featured_image = COALESCE($7, featured_image),
      published = COALESCE($8, published),
      published_at = $9,
      meta_title = COALESCE($10, meta_title),
      meta_description = COALESCE($11, meta_description),
      meta_keywords = COALESCE($12, meta_keywords),
      language = COALESCE($13, language),
      related_title = COALESCE($14, related_title),
      related_year = COALESCE($15, related_year),
      video_url = COALESCE($16, video_url),
      gallery = COALESCE($17::jsonb, gallery),
      conclusion = COALESCE($18, conclusion),
      has_download = COALESCE($19, has_download),
      download_price_usd = COALESCE($20, download_price_usd),
      payment_methods = $21::text[],
      download_free = COALESCE($22, download_free),
      updated_at = NOW()
    WHERE id = $1`,
    [
      id,
      input.title ?? existing.title,
      slug,
      input.category ?? existing.category,
      content,
      input.excerpt !== undefined ? input.excerpt : existing.excerpt,
      input.featured_image !== undefined ? input.featured_image : existing.featured_image,
      input.published !== undefined ? input.published : existing.published,
      input.published_at !== undefined ? input.published_at : existing.published_at,
      input.meta_title !== undefined ? input.meta_title : existing.meta_title,
      input.meta_description !== undefined ? input.meta_description : existing.meta_description,
      input.meta_keywords !== undefined ? input.meta_keywords : existing.meta_keywords,
      input.language ?? existing.language,
      input.related_title !== undefined ? input.related_title : existing.related_title,
      input.related_year !== undefined ? input.related_year : existing.related_year,
      input.video_url !== undefined ? input.video_url : existing.video_url,
      galleryJson,
      input.conclusion !== undefined ? input.conclusion : existing.conclusion,
      input.has_download !== undefined ? input.has_download : existing.has_download,
      input.download_price_usd !== undefined ? Number(input.download_price_usd) : existing.download_price_usd,
      paymentMethods,
      input.download_free !== undefined ? input.download_free : existing.download_free,
    ]
  );
  return getPostById(id);
}

export async function getPostById(id: number): Promise<BlogPostRow | null> {
  const { rows } = await query<BlogPostRow>(
    'SELECT * FROM blog_posts WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}

export async function getPostBySlug(slug: string, publishedOnly: boolean): Promise<(BlogPostRow & { author_name?: string; author_email?: string }) | null> {
  const { rows } = await query<BlogPostRow & { author_name: string; author_email: string }>(
    `SELECT p.*, u.name AS author_name, u.email AS author_email
     FROM blog_posts p
     LEFT JOIN users u ON p.author_id = u.id
     WHERE p.slug = $1 ${publishedOnly ? 'AND p.published = true' : ''}`,
    [slug]
  );
  return rows[0] ?? null;
}

/**
 * Construye la URL pública del post en el frontend.
 * @param category - slug de categoría (tabla blog_categories)
 */
export function buildPostPublicUrl(
  slug: string,
  category: string,
  language: string,
  frontendBaseUrl: string
): string {
  const base = frontendBaseUrl.replace(/\/$/, '');
  const basePath = language === 'en' ? '/news' : '/noticias';
  const lang = language === 'en' ? 'en' : 'es';
  const categoryPath = getCategoryUrlPath(category, lang) ?? category;
  return `${base}${basePath}/${categoryPath}/${slug}`;
}

/** Para redirecciones (ej. página de error de descarga): obtiene slug y categoría por post id. */
export async function getPostSlugAndCategory(postId: number): Promise<{ slug: string; category: string } | null> {
  const { rows } = await query<{ slug: string; category: string }>(
    'SELECT slug, category FROM blog_posts WHERE id = $1',
    [postId]
  );
  return rows[0] ?? null;
}

/** Posts públicos para sitemap: todas las publicaciones publicadas, sin restricción de fecha. */
export async function getPublicPostsForSitemap(): Promise<
  { slug: string; category: string; language: string; published_at: string | null }[]
> {
  const { rows } = await query<{ slug: string; category: string; language: string; published_at: string | null }>(
    `SELECT slug, category, language, published_at
     FROM blog_posts
     WHERE published = true
     ORDER BY published_at DESC NULLS LAST`
  );
  return rows;
}

/** Posts publicados por categoría para sitemap (sin restricción de fecha). Opcionalmente se puede limitar el número máximo. */
export async function getPublicPostsByCategoryForSitemap(
  category: string,
  limit?: number
): Promise<{ slug: string; category: string; language: string; published_at: string | null }[]> {
  const limitClause = limit && Number.isFinite(limit) && limit > 0 ? `LIMIT ${Number(limit)}` : '';
  const { rows } = await query<{ slug: string; category: string; language: string; published_at: string | null }>(
    `SELECT slug, category, language, published_at
     FROM blog_posts
     WHERE published = true AND category = $1
     ORDER BY published_at DESC NULLS LAST
     ${limitClause}`,
    [category]
  );
  return rows;
}

export async function listPublicPosts(params: {
  language?: string;
  category?: string;
  limit: number;
  offset: number;
  order?: 'published_at' | 'random';
  excludeId?: number;
}): Promise<{ posts: BlogPostPublic[]; total: number }> {
  const { language, category, limit, offset, order = 'published_at', excludeId } = params;

  let where = 'p.published = true';
  const values: unknown[] = [];
  let idx = 1;

  if (language) {
    where += ` AND p.language = $${idx}`;
    values.push(language);
    idx += 1;
  }
  if (category) {
    where += ` AND p.category = $${idx}`;
    values.push(category);
    idx += 1;
  }
  if (excludeId != null) {
    where += ` AND p.id != $${idx}`;
    values.push(excludeId);
    idx += 1;
  }

  const orderClause =
    order === 'random'
      ? 'ORDER BY RANDOM()'
      : 'ORDER BY p.published_at DESC NULLS LAST';

  const { rows: countRows } = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM blog_posts p WHERE ${where}`,
    values
  );
  const total = parseInt(countRows[0]?.count ?? '0', 10);

  values.push(limit, offset);
  const { rows } = await query<BlogPostPublic & { author_name?: string }>(
    `SELECT p.id, p.title, p.slug, p.category, p.excerpt, p.featured_image, p.published_at,
            p.meta_title, p.meta_description, p.language, p.views, p.has_download, p.download_price_usd, p.payment_methods, p.download_free,
            u.name AS author_name
     FROM blog_posts p
     LEFT JOIN users u ON p.author_id = u.id
     WHERE ${where} ${orderClause} LIMIT $${idx} OFFSET $${idx + 1}`,
    values
  );

  return { posts: rows, total };
}

export type AdminPostsSortBy = 'published_at' | 'views';

export async function listAdminPosts(params: {
  category?: string;
  published?: boolean;
  search?: string;
  limit: number;
  offset: number;
  sortBy?: AdminPostsSortBy;
  sortOrder?: 'asc' | 'desc';
}): Promise<{ posts: BlogPostRow[]; total: number }> {
  const { category, published, search, limit, offset, sortBy, sortOrder } = params;

  let where = 'WHERE 1=1';
  const values: unknown[] = [];
  let idx = 1;

  if (category) {
    where += ` AND category = $${idx}`;
    values.push(category);
    idx += 1;
  }
  if (published !== undefined) {
    where += ` AND published = $${idx}`;
    values.push(published);
    idx += 1;
  }
  if (search && search.trim()) {
    where += ` AND (title ILIKE $${idx} OR slug ILIKE $${idx} OR excerpt ILIKE $${idx})`;
    values.push(`%${search.trim()}%`);
    idx += 1;
  }

  const { rows: countRows } = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM blog_posts ${where}`,
    values
  );
  const total = parseInt(countRows[0]?.count ?? '0', 10);

  const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
  let orderClause = 'ORDER BY updated_at DESC';
  if (sortBy === 'published_at') {
    orderClause = `ORDER BY published_at ${orderDir} NULLS LAST`;
  } else if (sortBy === 'views') {
    orderClause = `ORDER BY views ${orderDir} NULLS LAST`;
  }

  values.push(limit, offset);
  const { rows } = await query<BlogPostRow>(
    `SELECT * FROM blog_posts ${where} ${orderClause} LIMIT $${idx} OFFSET $${idx + 1}`,
    values
  );

  return { posts: rows, total };
}

export async function incrementViews(slug: string): Promise<void> {
  await query('UPDATE blog_posts SET views = views + 1 WHERE slug = $1', [slug]);
}

export async function deletePost(id: number): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM blog_posts WHERE id = $1', [id]);
  return rowCount > 0;
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp']);

export function isImageDownloadFile(filename: string): boolean {
  const ext = (filename || '').split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

export async function getPostDownloadByPostId(postId: number): Promise<PostDownloadRow | null> {
  const { rows } = await query<PostDownloadRow>(
    'SELECT id, post_id, file_path, filename_display, file_size, created_at, whatsapp_sent_at FROM post_downloads WHERE post_id = $1',
    [postId]
  );
  return rows[0] ?? null;
}

/** Info del post para respuestas de pago (redirect a contenido en vez de descarga cuando es imagen). */
export async function getPostDownloadInfoForPayment(postId: number): Promise<{
  postId: number;
  slug: string;
  category: string;
  language: string;
  download_file_is_image: boolean;
} | null> {
  const post = await getPostById(postId);
  if (!post) return null;
  const download = await getPostDownloadByPostId(postId);
  const fn = download?.filename_display ?? download?.file_path ?? '';
  return {
    postId: post.id,
    slug: post.slug,
    category: post.category,
    language: post.language ?? 'es',
    download_file_is_image: isImageDownloadFile(fn),
  };
}

export async function setPostDownload(
  postId: number,
  filePath: string,
  filenameDisplay: string,
  fileSize: number | null
): Promise<PostDownloadRow> {
  await query(
    `INSERT INTO post_downloads (post_id, file_path, filename_display, file_size)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (post_id) DO UPDATE SET file_path = $2, filename_display = $3, file_size = $4`,
    [postId, filePath, filenameDisplay, fileSize]
  );
  const row = await getPostDownloadByPostId(postId);
  return row!;
}

export async function deletePostDownload(postId: number): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM post_downloads WHERE post_id = $1', [postId]);
  return rowCount > 0;
}

/** Marca que el gráfico ya fue enviado a WhatsApp; la ruta signal-chart.jpg pasará a devolver 404 (no recurso público). */
export async function markPostDownloadWhatsappSent(postId: number): Promise<boolean> {
  const { rowCount } = await query(
    'UPDATE post_downloads SET whatsapp_sent_at = NOW() WHERE post_id = $1',
    [postId]
  );
  return rowCount > 0;
}

/** Elimina el archivo de descarga del disco y el registro en post_downloads. Usado tras enviar el gráfico a WhatsApp. */
export async function deletePostDownloadAndFile(postId: number): Promise<boolean> {
  const download = await getPostDownloadByPostId(postId);
  if (!download?.file_path) return false;
  const fullPath = path.join(downloadsDir, download.file_path);
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (e) {
    console.error('[blog] Error al eliminar archivo de descarga:', e);
  }
  return deletePostDownload(postId);
}

