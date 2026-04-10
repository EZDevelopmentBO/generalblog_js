import { query } from '../config/database';

export type TemplateLanguage = 'es' | 'en';

export interface EmailTemplateRow {
  type: string;
  language: string;
  name: string;
  subject: string;
  body: string;
  updated_at: string;
}

const DEFAULTS_ES: Record<string, { name: string; subject: string; body: string }> = {
  download_link: {
    name: 'Link de descarga (tras pago)',
    subject: 'Tu enlace de descarga — Mi blog',
    body: `Hola,

Tu compra ha sido confirmada. Puedes descargar el contenido en el siguiente enlace:

{{download_url}}

Válido hasta: {{expires_at}}
Post: {{post_title}}
Ver artículo: {{post_url}}

Si no has sido tú quien ha realizado la compra, puedes ignorar este correo.

— Mi blog`,
  },
  welcome: {
    name: 'Bienvenida (nuevo usuario)',
    subject: 'Bienvenido a Mi blog',
    body: `Hola {{name}},

Gracias por registrarte. Aquí encontrarás artículos y novedades del sitio.

— Mi blog`,
  },
  welcome_with_coupon: {
    name: 'Bienvenida con cupón (campaña)',
    subject: 'Bienvenido a Mi blog — Tu cupón de bienvenida',
    body: `Hola {{name}},

Gracias por registrarte. Tienes un cupón de bienvenida exclusivo:

Código: {{coupon_code}}
Usar aquí: {{coupon_url}}

Este cupón es solo para ti. Aplícalo al comprar cualquier contenido elegible.

— Mi blog`,
  },
  coupon_delivery: {
    name: 'Envío de cupón por email',
    subject: 'Tu cupón de descuento — Mi blog',
    body: `Hola {{name}},

Te enviamos un cupón de descuento para que lo uses en tu próxima compra:

Código: {{coupon_code}}
Usar aquí: {{coupon_url}}

Aplícalo en la página de compra del contenido que elijas.

— Mi blog`,
  },
  email_header: { name: 'Encabezado global', subject: '', body: '' },
  email_footer: { name: 'Pie global', subject: '', body: '' },
};

const DEFAULTS_EN: Record<string, { name: string; subject: string; body: string }> = {
  download_link: {
    name: 'Download link (after payment)',
    subject: 'Your download link — My blog',
    body: `Hello,

Your purchase has been confirmed. You can download the content at the following link:

{{download_url}}

Valid until: {{expires_at}}
Post: {{post_title}}
View article: {{post_url}}

If you did not make this purchase, you can ignore this email.

— My blog`,
  },
  welcome: {
    name: 'Welcome (new user)',
    subject: 'Welcome to My blog',
    body: `Hello {{name}},

Thank you for signing up. Here you will find articles and updates from the site.

— My blog`,
  },
  welcome_with_coupon: {
    name: 'Welcome with coupon (campaign)',
    subject: 'Welcome to My blog — Your welcome coupon',
    body: `Hello {{name}},

Thank you for signing up. You have an exclusive welcome coupon:

Code: {{coupon_code}}
Use here: {{coupon_url}}

This coupon is for you only. Apply it when purchasing any eligible content.

— My blog`,
  },
  coupon_delivery: {
    name: 'Coupon delivery by email',
    subject: 'Your discount coupon — My blog',
    body: `Hello {{name}},

We are sending you a discount coupon to use on your next purchase:

Code: {{coupon_code}}
Use here: {{coupon_url}}

Apply it on the purchase page of the content you choose.

— My blog`,
  },
  email_header: { name: 'Global header', subject: '', body: '' },
  email_footer: { name: 'Global footer', subject: '', body: '' },
};

function getDefault(lang: TemplateLanguage, type: string): { name: string; subject: string; body: string } | undefined {
  return lang === 'en' ? DEFAULTS_EN[type] : DEFAULTS_ES[type];
}

/** Idioma por defecto para envío cuando el usuario no tiene preferencia. */
export const DEFAULT_SEND_LANGUAGE: TemplateLanguage = 'en';

/** Devuelve la fila de plantilla por type+language o null si no existe (sin aplicar defaults). */
export async function getEmailTemplateRow(
  type: string,
  language: TemplateLanguage
): Promise<EmailTemplateRow | null> {
  const lang = language === 'es' || language === 'en' ? language : DEFAULT_SEND_LANGUAGE;
  const { rows } = await query<EmailTemplateRow>(
    'SELECT type, language, name, subject, body, updated_at FROM email_templates WHERE type = $1 AND language = $2',
    [type, lang]
  );
  return rows[0] != null ? rows[0] : null;
}

export async function getEmailTemplate(
  type: string,
  language: TemplateLanguage = DEFAULT_SEND_LANGUAGE
): Promise<{ subject: string; body: string; name: string } | null> {
  const lang = language === 'es' || language === 'en' ? language : DEFAULT_SEND_LANGUAGE;
  const row = await getEmailTemplateRow(type, lang);
  if (row) return { subject: row.subject, body: row.body, name: row.name };
  const def = getDefault(lang, type);
  if (def) return { subject: def.subject, body: def.body, name: def.name };
  return null;
}

export async function getEmailTemplateWithDefault(
  type: string,
  language: TemplateLanguage = DEFAULT_SEND_LANGUAGE
): Promise<{ subject: string; body: string }> {
  const lang = language === 'es' || language === 'en' ? language : DEFAULT_SEND_LANGUAGE;
  const t = await getEmailTemplate(type, lang);
  const def = getDefault(lang, type);
  if (t) return { subject: t.subject.trim() || def?.subject || '', body: t.body.trim() || def?.body || '' };
  if (def) return { subject: def.subject, body: def.body };
  return { subject: '', body: '' };
}

export async function listEmailTemplates(): Promise<EmailTemplateRow[]> {
  const { rows } = await query<EmailTemplateRow>(
    `SELECT type, language, name, subject, body, updated_at FROM email_templates
     ORDER BY (CASE type WHEN 'email_header' THEN 0 WHEN 'email_footer' THEN 1 WHEN 'download_link' THEN 2 WHEN 'welcome' THEN 3 ELSE 99 END), type, language`
  );
  return rows;
}

export async function setEmailTemplate(
  type: string,
  language: TemplateLanguage,
  subject: string,
  body: string,
  name?: string
): Promise<EmailTemplateRow> {
  const lang = language === 'es' || language === 'en' ? language : 'en';
  const def = getDefault(lang, type);
  const candidate = name?.trim() || def?.name;
  const displayName = candidate != null ? candidate : type;
  const { rows } = await query<EmailTemplateRow>(
    `INSERT INTO email_templates (type, language, name, subject, body, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (type, language) DO UPDATE SET name = $3, subject = $4, body = $5, updated_at = NOW()
     RETURNING *`,
    [type, lang, displayName, subject, body]
  );
  return rows[0];
}

export function getTemplatePlaceholders(type: string): string[] {
  if (type === 'download_link') return ['email_header', 'email_footer', 'download_url', 'post_title', 'post_url', 'expires_at'];
  if (type === 'welcome') return ['email_header', 'email_footer', 'name'];
  return [];
}

export interface TemplateVariable {
  variable: string;
  descriptionKey: string;
}

const TEMPLATE_VARIABLES: Record<string, TemplateVariable[]> = {
  download_link: [
    { variable: 'email_header', descriptionKey: 'emailTemplateVar.email_header' },
    { variable: 'email_footer', descriptionKey: 'emailTemplateVar.email_footer' },
    { variable: 'download_url', descriptionKey: 'emailTemplateVar.download_url' },
    { variable: 'post_title', descriptionKey: 'emailTemplateVar.post_title' },
    { variable: 'post_url', descriptionKey: 'emailTemplateVar.post_url' },
    { variable: 'expires_at', descriptionKey: 'emailTemplateVar.expires_at' },
  ],
  welcome: [
    { variable: 'email_header', descriptionKey: 'emailTemplateVar.email_header' },
    { variable: 'email_footer', descriptionKey: 'emailTemplateVar.email_footer' },
    { variable: 'name', descriptionKey: 'emailTemplateVar.name' },
  ],
};

export function getTemplateVariables(type: string): TemplateVariable[] {
  const v = TEMPLATE_VARIABLES[type];
  return v != null ? v : [];
}
