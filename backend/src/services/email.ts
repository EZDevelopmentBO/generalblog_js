import nodemailer from 'nodemailer';
import { getSetting } from './settings';
import { getEmailTemplateWithDefault, getEmailTemplate, type TemplateLanguage, DEFAULT_SEND_LANGUAGE } from './emailTemplates';

function resolveLanguage(preferred: string | null | undefined): TemplateLanguage {
  return preferred === 'es' ? 'es' : 'en';
}

const EMAIL_ENABLED_KEY = 'email_enabled';
const SMTP_HOST_KEY = 'smtp_host';
const SMTP_PORT_KEY = 'smtp_port';
const SMTP_USER_KEY = 'smtp_user';
const SMTP_PASS_KEY = 'smtp_pass';
const SMTP_FROM_KEY = 'smtp_from';

export async function isEmailEnabled(): Promise<boolean> {
  const v = await getSetting(EMAIL_ENABLED_KEY);
  return v === 'true' || v === '1';
}

/** Plantilla de email para notificación "link de descarga" (por idioma). */
export async function getDownloadLinkTemplate(language: TemplateLanguage = DEFAULT_SEND_LANGUAGE): Promise<{ subject: string; body: string }> {
  return getEmailTemplateWithDefault('download_link', language);
}

/** Plantilla de email de bienvenida (por idioma). */
async function getWelcomeTemplate(language: TemplateLanguage): Promise<{ subject: string; body: string }> {
  return getEmailTemplateWithDefault('welcome', language);
}

/** Plantilla de email de bienvenida con cupón (por idioma). */
async function getWelcomeWithCouponTemplate(language: TemplateLanguage): Promise<{ subject: string; body: string }> {
  return getEmailTemplateWithDefault('welcome_with_coupon', language);
}

/** Plantilla de email para envío de cupón (por idioma). */
async function getCouponDeliveryTemplate(language: TemplateLanguage): Promise<{ subject: string; body: string }> {
  return getEmailTemplateWithDefault('coupon_delivery', language);
}

function replaceTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
  }
  return out;
}

/** Indica si el cuerpo parece HTML (para enviar como html en nodemailer). */
function isHtmlBody(body: string): boolean {
  const trimmed = body.trim();
  return trimmed.startsWith('<') || /<[a-zA-Z][^>]*>/.test(trimmed);
}

/** Genera versión texto plano del HTML para clientes que no soportan HTML. */
function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildMailOptions(params: { from: string; to: string; subject: string; body: string }) {
  const { from, to, subject, body } = params;
  if (isHtmlBody(body)) {
    return {
      from,
      to,
      subject,
      html: body,
      text: stripHtmlToText(body),
    };
  }
  return {
    from,
    to,
    subject,
    text: body,
  };
}

/**
 * Envía un email con la plantilla de link de descarga.
 * Solo envía si email está habilitado y SMTP está configurado.
 */
export async function sendDownloadLinkEmail(params: {
  to: string;
  downloadUrl: string;
  postTitle: string;
  postUrl: string;
  expiresAt: string;
  /** Idioma del destinatario (preferred_language). Por defecto 'en'. */
  preferredLanguage?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const enabled = await isEmailEnabled();
  if (!enabled) return { sent: false, error: 'Email not enabled' };

  const host = await getSetting(SMTP_HOST_KEY);
  const portRaw = await getSetting(SMTP_PORT_KEY);
  const user = await getSetting(SMTP_USER_KEY);
  const pass = await getSetting(SMTP_PASS_KEY);
  const from = await getSetting(SMTP_FROM_KEY);

  if (!host?.trim() || !user?.trim() || !pass?.trim()) {
    return { sent: false, error: 'SMTP not configured' };
  }

  const port = portRaw ? parseInt(portRaw, 10) : 587;
  const secure = Number.isFinite(port) && port === 465;
  const lang = resolveLanguage(params.preferredLanguage);

  const [template, headerTpl, footerTpl] = await Promise.all([
    getDownloadLinkTemplate(lang),
    getEmailTemplate('email_header', lang),
    getEmailTemplate('email_footer', lang),
  ]);
  const headerBody = headerTpl?.body?.trim() ?? '';
  const footerBody = footerTpl?.body?.trim() ?? '';
  const vars = {
    email_header: headerBody,
    email_footer: footerBody,
    download_url: params.downloadUrl,
    post_title: params.postTitle,
    post_url: params.postUrl,
    expires_at: params.expiresAt,
  };
  const subject = replaceTemplate(template.subject, vars);
  const body = replaceTemplate(template.body, vars);

  try {
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: Number.isFinite(port) ? port : 587,
      secure,
      auth: { user: user.trim(), pass: pass.trim() },
    });
    await transporter.sendMail(
      buildMailOptions({
        from: from?.trim() || user.trim(),
        to: params.to,
        subject,
        body,
      })
    );
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  }
}

/**
 * Envía el email de bienvenida a un usuario recién registrado.
 * Usa la plantilla "welcome" según preferredLanguage (por defecto 'en').
 */
export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  preferredLanguage?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const enabled = await isEmailEnabled();
  if (!enabled) return { sent: false, error: 'Email not enabled' };

  const host = await getSetting(SMTP_HOST_KEY);
  const portRaw = await getSetting(SMTP_PORT_KEY);
  const user = await getSetting(SMTP_USER_KEY);
  const pass = await getSetting(SMTP_PASS_KEY);
  const from = await getSetting(SMTP_FROM_KEY);

  if (!host?.trim() || !user?.trim() || !pass?.trim()) {
    return { sent: false, error: 'SMTP not configured' };
  }

  const port = portRaw ? parseInt(portRaw, 10) : 587;
  const secure = Number.isFinite(port) && port === 465;
  const lang = resolveLanguage(params.preferredLanguage);

  const [template, headerTpl, footerTpl] = await Promise.all([
    getWelcomeTemplate(lang),
    getEmailTemplate('email_header', lang),
    getEmailTemplate('email_footer', lang),
  ]);
  const headerBody = headerTpl?.body?.trim() ?? '';
  const footerBody = footerTpl?.body?.trim() ?? '';
  const vars = {
    email_header: headerBody,
    email_footer: footerBody,
    name: params.name,
  };
  const subject = replaceTemplate(template.subject, vars);
  const body = replaceTemplate(template.body, vars);

  try {
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: Number.isFinite(port) ? port : 587,
      secure,
      auth: { user: user.trim(), pass: pass.trim() },
    });
    await transporter.sendMail(
      buildMailOptions({
        from: from?.trim() || user.trim(),
        to: params.to,
        subject,
        body,
      })
    );
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  }
}

/**
 * Envía el email de bienvenida con cupón (campaña) a un usuario recién registrado.
 * Variables: {{name}}, {{coupon_code}}, {{coupon_url}}.
 */
export async function sendWelcomeWithCouponEmail(params: {
  to: string;
  name: string;
  couponCode: string;
  couponUrl: string;
  preferredLanguage?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const enabled = await isEmailEnabled();
  if (!enabled) return { sent: false, error: 'Email not enabled' };

  const host = await getSetting(SMTP_HOST_KEY);
  const portRaw = await getSetting(SMTP_PORT_KEY);
  const user = await getSetting(SMTP_USER_KEY);
  const pass = await getSetting(SMTP_PASS_KEY);
  const from = await getSetting(SMTP_FROM_KEY);

  if (!host?.trim() || !user?.trim() || !pass?.trim()) {
    return { sent: false, error: 'SMTP not configured' };
  }

  const port = portRaw ? parseInt(portRaw, 10) : 587;
  const secure = Number.isFinite(port) && port === 465;
  const lang = resolveLanguage(params.preferredLanguage);

  const [template, headerTpl, footerTpl] = await Promise.all([
    getWelcomeWithCouponTemplate(lang),
    getEmailTemplate('email_header', lang),
    getEmailTemplate('email_footer', lang),
  ]);
  const headerBody = headerTpl?.body?.trim() ?? '';
  const footerBody = footerTpl?.body?.trim() ?? '';
  const vars = {
    email_header: headerBody,
    email_footer: footerBody,
    name: params.name,
    coupon_code: params.couponCode,
    coupon_url: params.couponUrl,
  };
  const subject = replaceTemplate(template.subject, vars);
  const body = replaceTemplate(template.body, vars);

  try {
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: Number.isFinite(port) ? port : 587,
      secure,
      auth: { user: user.trim(), pass: pass.trim() },
    });
    await transporter.sendMail(
      buildMailOptions({
        from: from?.trim() || user.trim(),
        to: params.to,
        subject,
        body,
      })
    );
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  }
}

/**
 * Envía un email con un cupón a un usuario existente (plantilla coupon_delivery).
 * Variables: {{name}}, {{coupon_code}}, {{coupon_url}}.
 */
export async function sendCouponDeliveryEmail(params: {
  to: string;
  name: string;
  couponCode: string;
  couponUrl: string;
  preferredLanguage?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const enabled = await isEmailEnabled();
  if (!enabled) return { sent: false, error: 'Email not enabled' };

  const host = await getSetting(SMTP_HOST_KEY);
  const portRaw = await getSetting(SMTP_PORT_KEY);
  const user = await getSetting(SMTP_USER_KEY);
  const pass = await getSetting(SMTP_PASS_KEY);
  const from = await getSetting(SMTP_FROM_KEY);

  if (!host?.trim() || !user?.trim() || !pass?.trim()) {
    return { sent: false, error: 'SMTP not configured' };
  }

  const port = portRaw ? parseInt(portRaw, 10) : 587;
  const secure = Number.isFinite(port) && port === 465;
  const lang = resolveLanguage(params.preferredLanguage);

  const [template, headerTpl, footerTpl] = await Promise.all([
    getCouponDeliveryTemplate(lang),
    getEmailTemplate('email_header', lang),
    getEmailTemplate('email_footer', lang),
  ]);
  const headerBody = headerTpl?.body?.trim() ?? '';
  const footerBody = footerTpl?.body?.trim() ?? '';
  const vars = {
    email_header: headerBody,
    email_footer: footerBody,
    name: params.name,
    coupon_code: params.couponCode,
    coupon_url: params.couponUrl,
  };
  const subject = replaceTemplate(template.subject, vars);
  const body = replaceTemplate(template.body, vars);

  try {
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: Number.isFinite(port) ? port : 587,
      secure,
      auth: { user: user.trim(), pass: pass.trim() },
    });
    await transporter.sendMail(
      buildMailOptions({
        from: from?.trim() || user.trim(),
        to: params.to,
        subject,
        body,
      })
    );
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  }
}

/**
 * Envía un email de prueba al destino indicado.
 * Incluye encabezado y pie según idioma; por defecto 'en'.
 */
export async function sendTestEmail(params: {
  to: string;
  language?: TemplateLanguage;
}): Promise<{ sent: boolean; error?: string }> {
  const enabled = await isEmailEnabled();
  if (!enabled) return { sent: false, error: 'Email not enabled' };

  const host = await getSetting(SMTP_HOST_KEY);
  const portRaw = await getSetting(SMTP_PORT_KEY);
  const user = await getSetting(SMTP_USER_KEY);
  const pass = await getSetting(SMTP_PASS_KEY);
  const from = await getSetting(SMTP_FROM_KEY);

  if (!host?.trim() || !user?.trim() || !pass?.trim()) {
    return { sent: false, error: 'SMTP not configured' };
  }

  const to = params.to?.trim();
  if (!to) return { sent: false, error: 'Recipient email required' };

  const lang: TemplateLanguage =
    params.language === 'es' || params.language === 'en' ? params.language : DEFAULT_SEND_LANGUAGE;
  const [headerTpl, footerTpl] = await Promise.all([
    getEmailTemplate('email_header', lang),
    getEmailTemplate('email_footer', lang),
  ]);
  const headerBody = headerTpl?.body?.trim() ?? '';
  const footerBody = footerTpl?.body?.trim() ?? '';

  const bodyContent =
    lang === 'es'
      ? `
<table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 28px 24px; font-family: sans-serif; color: #1e293b;">
  <tr>
    <td style="font-size: 16px; line-height: 1.6;">
      <p style="margin: 0 0 16px;">Este es un <strong>correo de prueba</strong> de Mi blog.</p>
      <p style="margin: 0 0 16px;">Si lo recibes correctamente, la configuración SMTP y las plantillas (encabezado y pie) están funcionando.</p>
      <p style="margin: 0;">Enviado desde el panel de plantillas de email.</p>
    </td>
  </tr>
</table>`.trim()
      : `
<table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 28px 24px; font-family: sans-serif; color: #1e293b;">
  <tr>
    <td style="font-size: 16px; line-height: 1.6;">
      <p style="margin: 0 0 16px;">This is a <strong>test email</strong> from My blog.</p>
      <p style="margin: 0 0 16px;">If you receive it correctly, SMTP and the header/footer templates are working.</p>
      <p style="margin: 0;">Sent from the email templates panel.</p>
    </td>
  </tr>
</table>`.trim();

  const body = headerBody + bodyContent + footerBody;
  const subject = lang === 'es' ? '[Prueba] Mi blog — Email de prueba' : '[Test] My blog — Test email';
  const fallbackBody =
    lang === 'es' ? 'Correo de prueba de Mi blog. SMTP configurado correctamente.' : 'My blog test email. SMTP configured correctly.';

  const port = portRaw ? parseInt(portRaw, 10) : 587;
  const secure = Number.isFinite(port) && port === 465;

  try {
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: Number.isFinite(port) ? port : 587,
      secure,
      auth: { user: user.trim(), pass: pass.trim() },
    });
    await transporter.sendMail(
      buildMailOptions({
        from: from?.trim() || user.trim(),
        to,
        subject,
        body: body || fallbackBody,
      })
    );
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  }
}
