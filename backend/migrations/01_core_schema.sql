-- Consolidated: 001–026 (excl. signal_posts 027–030)

-- >>> 001_users.sql
-- Migración idempotente: tabla users con rol para blog
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'superuser')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    RAISE NOTICE 'Tabla users creada';
  ELSE
    RAISE NOTICE 'Tabla users ya existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'superuser'));
    RAISE NOTICE 'Columna role añadida a users';
  END IF;
END $$;

-- >>> 002_blog_posts.sql
-- Migración idempotente: tabla blog_posts para traders (crypto, metals, stocks, forex, analysis)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'blog_posts') THEN
    CREATE TABLE blog_posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK (category IN ('crypto', 'metals', 'stocks', 'forex', 'analysis')),
      content TEXT NOT NULL,
      excerpt TEXT,
      featured_image TEXT,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      published BOOLEAN DEFAULT false,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      meta_title TEXT,
      meta_description TEXT,
      meta_keywords TEXT,
      views INTEGER DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'es',
      related_title TEXT,
      related_year TEXT
    );
    CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);
    CREATE INDEX idx_blog_posts_published ON blog_posts(published);
    CREATE INDEX idx_blog_posts_language ON blog_posts(language);
    CREATE INDEX idx_blog_posts_category ON blog_posts(category);
    CREATE INDEX idx_blog_posts_published_at ON blog_posts(published_at DESC);
    RAISE NOTICE 'Tabla blog_posts creada';
  ELSE
    RAISE NOTICE 'Tabla blog_posts ya existe';
  END IF;
END $$;

-- >>> 003_blog_posts_video_gallery_conclusion.sql
-- Añadir columnas para estructura enriquecida del post: video, carrusel de imágenes, conclusión
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'video_url') THEN
    ALTER TABLE blog_posts ADD COLUMN video_url TEXT;
    RAISE NOTICE 'Columna blog_posts.video_url añadida';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'gallery') THEN
    ALTER TABLE blog_posts ADD COLUMN gallery JSONB DEFAULT '[]'::jsonb;
    RAISE NOTICE 'Columna blog_posts.gallery añadida';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'conclusion') THEN
    ALTER TABLE blog_posts ADD COLUMN conclusion TEXT;
    RAISE NOTICE 'Columna blog_posts.conclusion añadida';
  END IF;
END $$;

-- >>> 004_blog_posts_download_and_post_downloads.sql
-- Producto descargable por post: has_download, precio, y tabla de archivos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'has_download') THEN
    ALTER TABLE blog_posts ADD COLUMN has_download BOOLEAN DEFAULT false;
    RAISE NOTICE 'Columna blog_posts.has_download añadida';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'blog_posts' AND column_name = 'download_price_usd') THEN
    ALTER TABLE blog_posts ADD COLUMN download_price_usd DECIMAL(5,2) DEFAULT 1.00;
    RAISE NOTICE 'Columna blog_posts.download_price_usd añadida';
  END IF;
END $$;

-- Tabla post_downloads: un archivo ZIP por post (ruta interna, nunca expuesta)
CREATE TABLE IF NOT EXISTS post_downloads (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  filename_display TEXT NOT NULL,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id)
);
CREATE INDEX IF NOT EXISTS idx_post_downloads_post_id ON post_downloads(post_id);

-- >>> 003_post_downloads_whatsapp_sent_at.sql (después de crear post_downloads)
ALTER TABLE post_downloads
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN post_downloads.whatsapp_sent_at IS 'Si está fijado, la ruta signal-chart.jpg devuelve 404 (recurso solo para envío al grupo, no público).';

-- >>> 005_download_tokens.sql
-- Tokens de descarga (válidos 48h). Para pruebas se pueden generar sin pago; luego se vinculará a payments.
CREATE TABLE IF NOT EXISTS download_tokens (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_download_tokens_token ON download_tokens(token);
CREATE INDEX IF NOT EXISTS idx_download_tokens_expires_at ON download_tokens(expires_at);

-- >>> 006_payments.sql
-- Pagos (PayPal y luego Binance Pay)
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('paypal', 'binance_pay')),
  amount_usd DECIMAL(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'captured', 'refunded', 'failed', 'expired')),
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paypal_order_id TEXT,
  paypal_payer_id TEXT,
  payer_email TEXT,
  binance_merchant_trade_no TEXT,
  binance_prepay_id TEXT,
  binance_transaction_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_paypal_order_id ON payments(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_binance_merchant_trade_no ON payments(binance_merchant_trade_no) WHERE binance_merchant_trade_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_post_id ON payments(post_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- >>> 007_binance_deposit_payments.sql
-- Pago por transferencia directa a cuenta Binance (sin merchant): referencia única y monto exacto para validar depósito
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('paypal', 'binance_pay', 'binance_deposit', 'free_download'));

ALTER TABLE payments ADD COLUMN IF NOT EXISTS binance_deposit_reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS binance_deposit_expected_amount DECIMAL(10,4);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_binance_deposit_reference
  ON payments(binance_deposit_reference) WHERE binance_deposit_reference IS NOT NULL;

-- >>> 008_download_price_decimals.sql
-- Permitir precios de descarga con más decimales y montos menores a 1 USD (ej. 0.25, 1.99, 2.50)
ALTER TABLE blog_posts
  ALTER COLUMN download_price_usd TYPE DECIMAL(8,4);

COMMENT ON COLUMN blog_posts.download_price_usd IS 'Precio en USD (mínimo ej. 0.01, hasta 4 decimales)';

-- >>> 009_binance_deposit_amount_8_decimals.sql
-- Monto esperado con 8 decimales (ej. 0.99996789) para transferencia directa
ALTER TABLE payments
  ALTER COLUMN binance_deposit_expected_amount TYPE DECIMAL(12,8);

-- >>> 010_binance_deposit_amount_6_decimals.sql
-- Binance acepta máx. 6 decimales para USDT
ALTER TABLE payments
  ALTER COLUMN binance_deposit_expected_amount TYPE DECIMAL(12,6);

-- >>> 011_binance_deposit_capture_details.sql
-- Datos del depósito para trazabilidad y soporte (txId, dirección enviador, red)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS binance_deposit_tx_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS binance_deposit_from_address TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS binance_deposit_network TEXT;

COMMENT ON COLUMN payments.binance_deposit_tx_id IS 'TxID del depósito en la blockchain (para reclamos/soporte)';
COMMENT ON COLUMN payments.binance_deposit_from_address IS 'Dirección desde la que se envió el depósito (sourceAddress de Binance)';
COMMENT ON COLUMN payments.binance_deposit_network IS 'Red del depósito (BSC, TRX, ETH)';

-- >>> 012_post_payment_methods.sql
-- Métodos de pago a mostrar por post (puede ser uno o varios: paypal, binance_pay, binance_deposit)
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS payment_methods TEXT[] DEFAULT ARRAY['paypal', 'binance_pay', 'binance_deposit'];

COMMENT ON COLUMN blog_posts.payment_methods IS 'Métodos de pago a mostrar: paypal, binance_pay, binance_deposit. Null o vacío = todos.';

-- >>> 013_system_settings.sql
-- Configuración del sistema (super admin). Clave-valor para vigencia de tokens, etc.
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE system_settings IS 'Configuración editable desde el panel admin (ej. vigencia del link de descarga en horas).';

-- Valor por defecto: 48 horas para el token de descarga
INSERT INTO system_settings (key, value, updated_at)
VALUES ('download_token_hours', '48', NOW())
ON CONFLICT (key) DO NOTHING;

-- >>> 014_download_count_and_max.sql
-- Tracking de descargas por token y límite configurable
-- download_count: cuántas veces se usó este token para descargar
-- download_max_count: setting global (cuántas descargas permitidas por link en su vigencia)

ALTER TABLE download_tokens
  ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN download_tokens.download_count IS 'Veces que se ha usado este token para descargar el archivo';

INSERT INTO system_settings (key, value, updated_at)
VALUES ('download_max_count', '1', NOW())
ON CONFLICT (key) DO NOTHING;

-- >>> 015_download_free.sql
-- Descarga gratuita: post con archivo descargable una vez sin pago
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS download_free BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN blog_posts.download_free IS 'Si true, el post tiene descarga gratuita (1 descarga sin pago); no se muestran métodos de pago.';

-- >>> 016_free_download_fingerprint.sql
-- Para descargas gratuitas: reutilizar el mismo token por visitante (mismo fingerprint)
-- así se aplica el límite de descargas y la vigencia como en los de pago
ALTER TABLE download_tokens
  ADD COLUMN IF NOT EXISTS free_download_fingerprint TEXT NULL;

COMMENT ON COLUMN download_tokens.free_download_fingerprint IS 'Si no es null, el token es de descarga gratuita; se reutiliza para el mismo post_id + fingerprint hasta caducar o agotar descargas.';

CREATE INDEX IF NOT EXISTS idx_download_tokens_free_fingerprint
  ON download_tokens (post_id, free_download_fingerprint)
  WHERE free_download_fingerprint IS NOT NULL;

-- >>> 017_notification_log.sql
-- Registro de notificaciones enviadas (email, WhatsApp, etc.) para auditoría e historial
CREATE TABLE IF NOT EXISTS notification_log (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'telegram')),
  recipient TEXT NOT NULL,
  subject_or_template TEXT,
  related_type TEXT,
  related_id INTEGER,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON notification_log (channel);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log (recipient);
CREATE INDEX IF NOT EXISTS idx_notification_log_related ON notification_log (related_type, related_id);

COMMENT ON TABLE notification_log IS 'Historial de notificaciones enviadas a usuarios (email, WhatsApp, etc.).';

-- >>> 018_email_templates.sql
-- Plantillas de email por tipo de notificación (contenido por tipo; la configuración SMTP sigue en system_settings)
CREATE TABLE IF NOT EXISTS email_templates (
  type TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE email_templates IS 'Plantillas de email por tipo de notificación (link descarga, bienvenida, etc.).';

-- Insertar plantillas solo si la tabla aún tiene PK (type), es decir no tiene columna language (026 no aplicada).
-- Si ya existe language, 026 u otras migraciones se encargan de los datos; evitar ON CONFLICT (type) cuando la PK es (type, language).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_templates' AND column_name = 'language'
  ) THEN
    INSERT INTO email_templates (type, name, subject, body, updated_at)
    SELECT
      'download_link',
      'Link de descarga (tras pago)',
      'Tu enlace de descarga — TradersWorld',
      E'Hola,\n\nTu compra ha sido confirmada. Puedes descargar el contenido en el siguiente enlace:\n\n{{download_url}}\n\nVálido hasta: {{expires_at}}\nPost: {{post_title}}\n\nSi no has sido tú quien ha realizado la compra, puedes ignorar este correo.\n\n— TradersWorld',
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM email_templates WHERE type = 'download_link'
    );

    INSERT INTO email_templates (type, name, subject, body, updated_at)
    SELECT
      'welcome',
      'Bienvenida (nuevo usuario)',
      'Bienvenido a TradersWorld',
      E'Hola {{name}},\n\nGracias por registrarte en TradersWorld. Aquí encontrarás análisis y noticias de mercados (criptos, metales, acciones y forex).\n\n— TradersWorld',
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM email_templates WHERE type = 'welcome'
    );
  END IF;
END $$;

-- >>> 019_payments_user_id.sql
-- Vincular pagos al usuario comprador cuando está logueado (opcional)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
COMMENT ON COLUMN payments.user_id IS 'Usuario comprador (si pagó logueado). Null para compras anónimas o históricas.';

-- >>> 020_email_header_footer.sql
-- Encabezado y pie globales reutilizables en todos los emails (se insertan con {{email_header}} y {{email_footer}})
-- Solo insertar si la tabla aún tiene PK (type); si ya tiene language, 026 inserta las versiones en/es.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_templates' AND column_name = 'language'
  ) THEN
    INSERT INTO email_templates (type, name, subject, body, updated_at)
    SELECT 'email_header', 'Encabezado global', '', '', NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM email_templates WHERE type = 'email_header'
    );

    INSERT INTO email_templates (type, name, subject, body, updated_at)
    SELECT 'email_footer', 'Pie global', '', '', NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM email_templates WHERE type = 'email_footer'
    );
  END IF;
END $$;

-- >>> 021_discount_codes.sql
-- Cupones / códigos de descuento: globales o por post, porcentaje o monto fijo, fechas y categorías opcionales
CREATE TABLE IF NOT EXISTS discount_codes (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(10,4) NOT NULL CHECK (discount_value > 0),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'post')),
  post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
  categories TEXT[],
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  usage_limit_total INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  usage_limit_per_user INTEGER,
  min_purchase_usd NUMERIC(10,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT discount_codes_post_when_scope_post CHECK (
    (scope = 'post' AND post_id IS NOT NULL) OR (scope = 'global' AND post_id IS NULL)
  ),
  CONSTRAINT discount_codes_percent_range CHECK (
    discount_type != 'percent' OR (discount_value > 0 AND discount_value <= 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(UPPER(TRIM(code)));
CREATE INDEX IF NOT EXISTS idx_discount_codes_scope_post ON discount_codes(scope, post_id);
CREATE INDEX IF NOT EXISTS idx_discount_codes_valid ON discount_codes(valid_from, valid_until);

COMMENT ON TABLE discount_codes IS 'Códigos de descuento: global (todas las ventas o por categorías) o por post; porcentaje o monto fijo; fechas y usos opcionales.';
COMMENT ON COLUMN discount_codes.categories IS 'Solo para scope=global: categorías donde aplica (blog category). Null = todas.';
COMMENT ON COLUMN discount_codes.valid_from IS 'Vigencia desde. Null = sin límite (indefinido).';
COMMENT ON COLUMN discount_codes.valid_until IS 'Vigencia hasta. Null = sin límite (indefinido).';
COMMENT ON COLUMN discount_codes.usage_limit_total IS 'Máximo usos totales. Null = ilimitado.';
COMMENT ON COLUMN discount_codes.usage_limit_per_user IS 'Máximo usos por usuario. Null = ilimitado.';

-- Registro de cada uso (al capturar el pago)
CREATE TABLE IF NOT EXISTS discount_code_uses (
  id SERIAL PRIMARY KEY,
  discount_code_id INTEGER NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_code_uses_payment ON discount_code_uses(payment_id);
CREATE INDEX IF NOT EXISTS idx_discount_code_uses_code ON discount_code_uses(discount_code_id);
CREATE INDEX IF NOT EXISTS idx_discount_code_uses_user ON discount_code_uses(user_id);

-- Vincular pago al cupón usado y guardar monto original (para reportes)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_code_id INTEGER REFERENCES discount_codes(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_before_discount NUMERIC(10,4);
CREATE INDEX IF NOT EXISTS idx_payments_discount_code_id ON payments(discount_code_id) WHERE discount_code_id IS NOT NULL;

COMMENT ON COLUMN payments.discount_code_id IS 'Cupón aplicado en esta compra (si hubo).';
COMMENT ON COLUMN payments.amount_before_discount IS 'Precio original antes del descuento (para reportes).';

-- >>> 022_discount_codes_campaign_and_user.sql
-- Cupón por usuario (regalo) y campañas (ref desde URL → bienvenida con cupón)
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS allowed_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS campaign_slug TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_discount_codes_allowed_user ON discount_codes(allowed_user_id) WHERE allowed_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_codes_campaign_slug ON discount_codes(campaign_slug) WHERE campaign_slug IS NOT NULL;
COMMENT ON COLUMN discount_codes.allowed_user_id IS 'Si está definido, solo este usuario puede usar el cupón (ej. regalo o bienvenida con campaña).';
COMMENT ON COLUMN discount_codes.campaign_slug IS 'Slug de campaña (ej. bienvenida-ene-2026). Si está definido, este cupón es plantilla: al registrarse con ?ref=slug se crea un clon por usuario.';

-- >>> 023_email_template_welcome_with_coupon.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_templates' AND column_name = 'language'
  ) THEN
    INSERT INTO email_templates (type, name, subject, body, updated_at)
    SELECT
      'welcome_with_coupon',
      'Bienvenida con cupón (campaña)',
      'Bienvenido a TradersWorld — Tu cupón de bienvenida',
      E'Hola {{name}},\n\nGracias por registrarte. Tienes un cupón de bienvenida exclusivo:\n\nCódigo: {{coupon_code}}\nUsar aquí: {{coupon_url}}\n\nEste cupón es solo para ti. Aplícalo al comprar cualquier contenido elegible.\n\n— TradersWorld',
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM email_templates WHERE type = 'welcome_with_coupon'
    );
  END IF;
END $$;

-- >>> 024_email_template_coupon_delivery.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_templates' AND column_name = 'language'
  ) THEN
    INSERT INTO email_templates (type, name, subject, body, updated_at)
    SELECT
      'coupon_delivery',
      'Envío de cupón por email',
      'Tu cupón de descuento — TradersWorld',
      E'Hola {{name}},\n\nTe enviamos un cupón de descuento para que lo uses en tu próxima compra:\n\nCódigo: {{coupon_code}}\nUsar aquí: {{coupon_url}}\n\nAplícalo en la página de compra del contenido que elijas.\n\n— TradersWorld',
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM email_templates WHERE type = 'coupon_delivery'
    );
  END IF;
END $$;

-- >>> 025_user_preferred_language.sql
-- Idioma preferido del usuario (sesión y configuración)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'preferred_language'
  ) THEN
    ALTER TABLE users ADD COLUMN preferred_language VARCHAR(10) DEFAULT NULL CHECK (preferred_language IS NULL OR preferred_language IN ('es', 'en'));
    RAISE NOTICE 'Columna preferred_language añadida a users';
  END IF;
END $$;

-- >>> 026_email_templates_language.sql
-- Plantillas de email por idioma (es/en). Se envía el email según preferred_language del usuario; si no tiene, por defecto 'en'.
-- Añadimos columna language y cambiamos PK a (type, language).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_templates' AND column_name = 'language'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN language VARCHAR(10) NOT NULL DEFAULT 'es'
      CHECK (language IN ('es', 'en'));
    UPDATE email_templates SET language = 'es' WHERE language IS NULL;
    ALTER TABLE email_templates ALTER COLUMN language DROP DEFAULT;
    RAISE NOTICE 'Columna language añadida a email_templates';
  END IF;
END $$;

-- Asegurar que los registros existentes tengan language = 'es'
UPDATE email_templates SET language = 'es' WHERE language IS NULL OR language = '';

-- Eliminar PK antigua y crear nueva (type, language)
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_pkey;
ALTER TABLE email_templates ADD PRIMARY KEY (type, language);

-- Insertar versiones en inglés (solo si no existe ya la fila para ese type+language)
INSERT INTO email_templates (type, language, name, subject, body, updated_at) VALUES
  ('download_link', 'en', 'Download link (after payment)', 'Your download link — TradersWorld',
   E'Hello,\n\nYour purchase has been confirmed. You can download the content at the following link:\n\n{{download_url}}\n\nValid until: {{expires_at}}\nPost: {{post_title}}\nView article: {{post_url}}\n\nIf you did not make this purchase, you can ignore this email.\n\n— TradersWorld',
   NOW()),
  ('welcome', 'en', 'Welcome (new user)', 'Welcome to TradersWorld',
   E'Hello {{name}},\n\nThank you for signing up for TradersWorld. Here you will find market analysis and news (crypto, metals, stocks and forex).\n\n— TradersWorld',
   NOW()),
  ('welcome_with_coupon', 'en', 'Welcome with coupon (campaign)', 'Welcome to TradersWorld — Your welcome coupon',
   E'Hello {{name}},\n\nThank you for signing up. You have an exclusive welcome coupon:\n\nCode: {{coupon_code}}\nUse here: {{coupon_url}}\n\nThis coupon is for you only. Apply it when purchasing any eligible content.\n\n— TradersWorld',
   NOW()),
  ('coupon_delivery', 'en', 'Coupon delivery by email', 'Your discount coupon — TradersWorld',
   E'Hello {{name}},\n\nWe are sending you a discount coupon to use on your next purchase:\n\nCode: {{coupon_code}}\nUse here: {{coupon_url}}\n\nApply it on the purchase page of the content you choose.\n\n— TradersWorld',
   NOW()),
  ('email_header', 'en', 'Global header', '', '', NOW()),
  ('email_footer', 'en', 'Global footer', '', '', NOW())
ON CONFLICT (type, language) DO NOTHING;

COMMENT ON COLUMN email_templates.language IS 'Idioma de la plantilla: es o en. El email se envía según preferred_language del destinatario (por defecto en).';

