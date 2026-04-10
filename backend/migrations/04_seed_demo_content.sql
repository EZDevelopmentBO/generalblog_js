-- Datos de ejemplo: marca del sitio, categoría "general", autor ficticio y un post publicado.
-- Idempotente: no duplica si ya existen.

-- Marca por defecto (solo si no había clave)
INSERT INTO system_settings (key, value, updated_at)
VALUES ('site_title', 'Mi blog', NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_settings (key, value, updated_at)
VALUES ('site_slogan', 'Artículos, ideas y novedades', NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO blog_categories (slug, path_es, path_en, label_es, label_en, sort_order)
VALUES ('general', 'general', 'general', 'General', 'General', 5)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (email, name, role)
SELECT 'seed-author@blog.local', 'Autor de ejemplo', 'user'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'seed-author@blog.local');

INSERT INTO blog_posts (
  title,
  slug,
  category,
  content,
  excerpt,
  author_id,
  published,
  published_at,
  language,
  has_download,
  download_free,
  download_price_usd,
  payment_methods,
  meta_title,
  meta_description
)
SELECT
  'Bienvenida a tu blog',
  '2026-01-15-bienvenida-a-tu-blog',
  'general',
  $html$
<p>Este es un <strong>artículo de ejemplo</strong> que se crea al migrar la base de datos. Puedes editarlo o borrarlo desde el panel de administración.</p>
<p>Usa este espacio para notas, tutoriales, noticias o cualquier contenido que quieras compartir con tus lectores. Las categorías y la apariencia del sitio se configuran en el admin y en <em>Configuración</em>.</p>
<p>Si aún no has iniciado sesión con Google, el primer usuario que lo haga recibirá permisos de superusuario (salvo este usuario de demostración, que solo sirve como autor del post).</p>
$html$::text,
  'Publicación inicial de ejemplo. Sustitúyela por tu primer artículo real.',
  u.id,
  true,
  NOW(),
  'es',
  false,
  false,
  0,
  ARRAY['paypal', 'binance_pay', 'binance_deposit']::text[],
  'Bienvenida a tu blog',
  'Artículo de ejemplo creado automáticamente al instalar el proyecto.'
FROM users u
WHERE u.email = 'seed-author@blog.local'
  AND NOT EXISTS (SELECT 1 FROM blog_posts WHERE slug = '2026-01-15-bienvenida-a-tu-blog');
