export type UserRole = string;

/** Puede usar el panel de administración del blog (posts, medios, descargas por post). */
export function canManageBlogContent(role: string | undefined): boolean {
  return role === 'superuser' || role === 'editor' || role === 'manager';
}

/** Puede gestionar cupones/descuentos. */
export function canManageDiscountCodes(role: string | undefined): boolean {
  return role === 'superuser' || role === 'manager';
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  preferred_language?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Slug de categoría definido en `blog_categories` (gestión dinámica). */
export type BlogCategory = string;

export interface BlogPostRow {
  id: number;
  title: string;
  slug: string;
  category: BlogCategory;
  content: string;
  excerpt: string | null;
  featured_image: string | null;
  author_id: number | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  views: number;
  language: string;
  related_title: string | null;
  related_year: string | null;
  video_url: string | null;
  gallery: string[] | null;
  conclusion: string | null;
  has_download: boolean;
  download_price_usd: number;
  payment_methods: string[] | null;
  download_free: boolean;
  author_name?: string;
  author_email?: string;
}

export interface BlogPostPublic {
  id: number;
  title: string;
  slug: string;
  category: BlogCategory;
  excerpt: string | null;
  featured_image: string | null;
  published_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  language: string;
  views: number;
  video_url?: string | null;
  gallery?: string[] | null;
  conclusion?: string | null;
  has_download?: boolean;
  download_price_usd?: number;
  payment_methods?: string[] | null;
  download_free?: boolean;
  author_name?: string;
}

export interface BlogPostCreateInput {
  title: string;
  category: BlogCategory;
  content: string;
  /** Slug opcional; si se omite, se genera desde title y published_at. Útil para posts de señal con hora en el slug. */
  slug?: string | null;
  excerpt?: string | null;
  featured_image?: string | null;
  author_id?: number | null;
  published?: boolean;
  published_at?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  language?: string;
  related_title?: string | null;
  related_year?: string | null;
  video_url?: string | null;
  gallery?: string[] | null;
  conclusion?: string | null;
  has_download?: boolean;
  download_price_usd?: number;
  payment_methods?: string[] | null;
  download_free?: boolean;
}

export interface PostDownloadRow {
  id: number;
  post_id: number;
  file_path: string;
  filename_display: string;
  file_size: number | null;
  created_at: string;
  /** Si está fijado, la URL JPG del gráfico (signal-chart.jpg) no es pública. */
  whatsapp_sent_at?: string | null;
}

export interface LLMGeneratedPost {
  title: string;
  content: string;
  excerpt: string;
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  category: BlogCategory;
  related_title?: string | null;
  related_year?: string | null;
  conclusion?: string | null;
}

declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      name: string;
      role: UserRole;
      preferred_language?: string | null;
      created_at?: string;
      updated_at?: string;
    }
  }
}
