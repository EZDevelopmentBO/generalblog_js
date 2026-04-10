-- Consolidated: 029, 031–035

-- >>> 029_payments_free_download_provider.sql
-- Permitir provider 'free_download' para registrar descargas gratuitas como "compra" del usuario
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('paypal', 'binance_pay', 'binance_deposit', 'free_download'));

COMMENT ON COLUMN payments.provider IS 'Método de pago o free_download para descarga gratuita registrada con usuario.';

-- >>> 031_users_deleted_at.sql
-- Soft delete para usuarios: columna deleted_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ NULL;
    CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
    RAISE NOTICE 'Columna deleted_at añadida a users';
  ELSE
    RAISE NOTICE 'Columna deleted_at ya existe en users';
  END IF;
END $$;


-- >>> 032_users_role_editor.sql
-- Rol editor: gestor de contenidos del blog (además de permisos de usuario normal).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'editor', 'superuser'));

-- >>> 033_blog_categories.sql
-- Categorías de blog configurables (slug interno + segmentos URL es/en + etiquetas).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'blog_categories') THEN
    CREATE TABLE blog_categories (
      slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9_]*$'),
      path_es TEXT NOT NULL CHECK (path_es ~ '^[a-z0-9][a-z0-9_-]*$'),
      path_en TEXT NOT NULL CHECK (path_en ~ '^[a-z0-9][a-z0-9_-]*$'),
      label_es TEXT NOT NULL,
      label_en TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT blog_categories_path_es_unique UNIQUE (path_es),
      CONSTRAINT blog_categories_path_en_unique UNIQUE (path_en)
    );
    CREATE INDEX idx_blog_categories_sort ON blog_categories (sort_order, slug);
    RAISE NOTICE 'Tabla blog_categories creada';
  ELSE
    RAISE NOTICE 'Tabla blog_categories ya existe';
  END IF;
END $$;

INSERT INTO blog_categories (slug, path_es, path_en, label_es, label_en, sort_order) VALUES
  ('analysis', 'analisis', 'analysis', 'Análisis', 'Analysis', 10),
  ('crypto', 'criptomonedas', 'crypto', 'Criptomonedas', 'Crypto', 20),
  ('metals', 'metales', 'metals', 'Metales', 'Metals', 30),
  ('stocks', 'acciones', 'stocks', 'Acciones', 'Stocks', 40),
  ('forex', 'forex', 'forex', 'Forex', 'Forex', 50),
  ('bots', 'bots', 'bots', 'Bots', 'Bots', 55),
  ('indicadores', 'indicadores', 'indicators', 'Indicadores', 'Indicators', 60)
ON CONFLICT (slug) DO NOTHING;

-- Asegurar que todo valor de category en blog_posts tenga fila (por si hubo datos legacy)
INSERT INTO blog_categories (slug, path_es, path_en, label_es, label_en, sort_order)
SELECT DISTINCT bp.category, bp.category, bp.category, bp.category, bp.category, 200
FROM blog_posts bp
WHERE NOT EXISTS (SELECT 1 FROM blog_categories c WHERE c.slug = bp.category)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE blog_posts DROP CONSTRAINT IF EXISTS blog_posts_category_check;
ALTER TABLE blog_posts DROP CONSTRAINT IF EXISTS blog_posts_category_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_category_fkey'
  ) THEN
    ALTER TABLE blog_posts
      ADD CONSTRAINT blog_posts_category_fkey
      FOREIGN KEY (category) REFERENCES blog_categories (slug);
  END IF;
END $$;

-- >>> 034_users_role_manager.sql
-- Permite nuevo rol "manager" para delegar gestión operativa sin privilegios de superuser.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'editor', 'manager', 'superuser'));

-- >>> 035_rbac_roles_permissions.sql
-- RBAC dinámico: roles y permisos configurables desde BD.

CREATE TABLE IF NOT EXISTS roles (
  slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9_]*$'),
  name TEXT NOT NULL,
  description TEXT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_slug TEXT NOT NULL REFERENCES roles(slug) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_slug, permission_key)
);

INSERT INTO roles (slug, name, description, is_system)
VALUES
  ('user', 'User', 'Rol básico sin permisos administrativos', true),
  ('editor', 'Editor', 'Gestión de contenido del blog', true),
  ('manager', 'Manager', 'Gestión de contenido y cupones', true),
  ('superuser', 'Superuser', 'Control total del sistema', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_slug, permission_key)
VALUES
  ('editor', 'blog.manage'),
  ('manager', 'blog.manage'),
  ('manager', 'discount.manage'),
  ('superuser', 'blog.manage'),
  ('superuser', 'discount.manage')
ON CONFLICT DO NOTHING;

-- Limpiar roles inválidos previos y acoplar users.role al catálogo dinámico.
UPDATE users
SET role = 'user'
WHERE role NOT IN (SELECT slug FROM roles);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_role_fkey
  FOREIGN KEY (role) REFERENCES roles(slug);

