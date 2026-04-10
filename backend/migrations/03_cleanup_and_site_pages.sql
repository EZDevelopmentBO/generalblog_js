-- Consolidated: 036–037

-- >>> 036_drop_signal_posts_and_trading_permission.sql
-- Elimina la tabla de enlace orden MT5 ↔ post (trading bot) y el permiso RBAC obsoleto.

DROP TABLE IF EXISTS signal_posts CASCADE;

DELETE FROM role_permissions WHERE permission_key = 'trading_bot.manage';

-- >>> 037_site_pages.sql
-- Páginas estáticas editables (estilo WordPress "Pages"), por idioma.

CREATE TABLE IF NOT EXISTS site_pages (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  language VARCHAR(5) NOT NULL DEFAULT 'es' CHECK (language IN ('es', 'en')),
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  meta_title TEXT NULL,
  meta_description TEXT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug, language)
);

CREATE INDEX IF NOT EXISTS idx_site_pages_published_lang ON site_pages (published, language, sort_order);

