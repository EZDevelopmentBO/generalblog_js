export type BlogCategory = string;

export type UserRole = string;

export interface AuthLikeUser {
  role?: string;
  permissions?: string[];
}

export function hasPermission(user: AuthLikeUser | null | undefined, permission: string): boolean {
  if (!user) return false;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export function canManageBlogContent(role: string | undefined, permissions?: string[]): boolean {
  if (Array.isArray(permissions)) return permissions.includes('blog.manage');
  return role === 'superuser' || role === 'editor' || role === 'manager';
}

export function canManageDiscountCodes(role: string | undefined, permissions?: string[]): boolean {
  if (Array.isArray(permissions)) return permissions.includes('discount.manage');
  return role === 'superuser' || role === 'manager';
}

/** Metadatos de categoría (API `/api/blog/categories`). */
export interface BlogCategoryMeta {
  slug: string;
  count: number;
  path_es: string;
  path_en: string;
  label_es: string;
  label_en: string;
  sort_order: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
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
  download_file_is_image?: boolean;
  author_name?: string;
}

export interface BlogPostFull extends BlogPostPublic {
  content: string;
  meta_keywords: string | null;
  author_id: number | null;
  published: boolean;
  created_at: string;
  updated_at: string;
  author_email?: string;
  related_title?: string | null;
  related_year?: string | null;
}
