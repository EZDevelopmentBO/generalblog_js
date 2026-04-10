import { Router, Request, Response } from 'express';
import passport from 'passport';
import { query } from '../config/database';
import type { User } from '../types';
import { env, loadedEnvPath } from '../config/env';
import { sendWelcomeEmail, sendWelcomeWithCouponEmail } from '../services/email';
import { logNotification } from '../services/notificationLog';
import { getSetting } from '../services/settings';
import {
  findDiscountByCampaignSlug,
  createUserCampaignCoupon,
  getDiscountCodeById,
} from '../services/discountCode';
import { getPermissionsByRole } from '../services/rbac';
import { SEED_DEMO_AUTHOR_EMAIL } from '../constants/seedDemo';

export const authRouter = Router();

const PENDING_REF_COOKIE = 'pending_ref';
const LOGIN_RETURN_COOKIE = 'login_return_url';
const PENDING_REF_MAX_AGE_MS = 10 * 60 * 1000; // 10 min

/** Solo acepta rutas relativas (empiezan por /) para evitar open redirect. */
function isValidReturnPath(path: string): boolean {
  const s = path.trim();
  return s.length > 0 && s.length <= 500 && s.startsWith('/') && !s.startsWith('//');
}

authRouter.get('/google', (req: Request, res: Response, next) => {
  if (!env.GOOGLE_CLIENT_ID) {
    console.warn(
      '[auth] Google OAuth not configured. Env loaded from:',
      loadedEnvPath ?? 'dotenv default (cwd)',
      '— Comprueba que GOOGLE_CLIENT_ID esté en ese archivo.'
    );
    res.status(503).json({ error: 'Google OAuth not configured' });
    return;
  }
  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : '';
  if (ref) {
    res.cookie(PENDING_REF_COOKIE, ref, {
      maxAge: PENDING_REF_MAX_AGE_MS,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }
  const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : '';
  if (isValidReturnPath(returnUrl)) {
    res.cookie(LOGIN_RETURN_COOKIE, returnUrl, {
      maxAge: PENDING_REF_MAX_AGE_MS,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

authRouter.get('/google/callback', (req: Request, res: Response, next) => {
  if (!env.GOOGLE_CLIENT_ID) {
    res.redirect(env.FRONTEND_URL.replace(/\/$/, '/'));
    return;
  }
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  passport.authenticate(
    'google',
    { session: false },
    async (err: Error | null, user?: User, info?: { created?: boolean }) => {
      if (err || !user) {
        res.redirect(base + '/');
        return;
      }
      const created = info?.created === true;
      const pendingRef = typeof req.cookies?.[PENDING_REF_COOKIE] === 'string' ? req.cookies[PENDING_REF_COOKIE].trim() : '';

      if (created) {
        const welcomeWithCouponEnabled = (await getSetting('welcome_with_coupon_enabled')) === 'true';
        const selectedCampaignIdRaw = await getSetting('welcome_campaign_discount_code_id');
        const selectedCampaignId = selectedCampaignIdRaw ? parseInt(selectedCampaignIdRaw, 10) : null;

        let sentWelcomeWithCoupon = false;

        if (welcomeWithCouponEnabled && selectedCampaignId) {
          const campaign = await getDiscountCodeById(selectedCampaignId);
          if (campaign?.campaign_slug) {
            const userCoupon = await createUserCampaignCoupon(user.id, campaign.campaign_slug);
            if (userCoupon) {
              const couponUrl = `${base}/?coupon=${encodeURIComponent(userCoupon.code)}`;
              const result = await sendWelcomeWithCouponEmail({
                to: user.email,
                name: user.name,
                couponCode: userCoupon.code,
                couponUrl,
                preferredLanguage: user.preferred_language ?? 'en',
              });
              await logNotification({
                channel: 'email',
                recipient: user.email,
                subject_or_template: 'welcome_with_coupon',
                related_type: 'user',
                related_id: user.id,
                status: result.sent ? 'sent' : 'failed',
                error_message: result.error ?? null,
              });
              if (!result.sent && result.error) {
                console.error('[email] sendWelcomeWithCouponEmail failed:', result.error);
              }
              sentWelcomeWithCoupon = true;
            }
          }
        } else if (welcomeWithCouponEnabled && pendingRef) {
          const slug = pendingRef.toLowerCase();
          const campaign = await findDiscountByCampaignSlug(slug);
          if (campaign) {
            const userCoupon = await createUserCampaignCoupon(user.id, slug);
            if (userCoupon) {
              const couponUrl = `${base}/?coupon=${encodeURIComponent(userCoupon.code)}`;
              const result = await sendWelcomeWithCouponEmail({
                to: user.email,
                name: user.name,
                couponCode: userCoupon.code,
                couponUrl,
                preferredLanguage: user.preferred_language ?? 'en',
              });
              await logNotification({
                channel: 'email',
                recipient: user.email,
                subject_or_template: 'welcome_with_coupon',
                related_type: 'user',
                related_id: user.id,
                status: result.sent ? 'sent' : 'failed',
                error_message: result.error ?? null,
              });
              if (!result.sent && result.error) {
                console.error('[email] sendWelcomeWithCouponEmail failed:', result.error);
              }
              sentWelcomeWithCoupon = true;
            }
          }
        }

        if (!sentWelcomeWithCoupon) {
          trySendWelcomeAndLog(user).catch((e) => console.error('[auth] welcome email', e));
        }
      }

      if (pendingRef) {
        res.clearCookie(PENDING_REF_COOKIE, { path: '/' });
      }

      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error('[auth] session regenerate error:', regenErr);
          res.redirect(base + '/');
          return;
        }
        req.logIn(user, (loginErr) => {
          if (loginErr) {
            res.redirect(base + '/');
            return;
          }
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error('Session save error:', saveErr);
              res.redirect(base + '/');
              return;
            }
            const returnPath = typeof req.cookies?.[LOGIN_RETURN_COOKIE] === 'string' && isValidReturnPath(req.cookies[LOGIN_RETURN_COOKIE].trim())
              ? req.cookies[LOGIN_RETURN_COOKIE].trim()
              : '/app';
            res.clearCookie(LOGIN_RETURN_COOKIE, { path: '/' });
            res.redirect(base + returnPath);
          });
        });
      });
    }
  )(req, res, next);
});

authRouter.get('/me', async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const user = req.user as User;
  const permissions = await getPermissionsByRole(user.role);
  res.json({ ...user, permissions });
});

authRouter.get('/logout', (req: Request, res: Response) => {
  const redirectUrl = env.FRONTEND_URL.replace(/\/$/, '') + '/';
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error('[auth] session destroy error:', destroyErr);
        res.status(500).json({ error: 'Logout failed' });
        return;
      }
      res.redirect(redirectUrl);
    });
  });
});

async function findOrCreateUser(profile: {
  id: string;
  emails?: Array<{ value: string }>;
  displayName?: string;
}): Promise<{ user: User; created: boolean }> {
  const email = profile.emails?.[0]?.value ?? `${profile.id}@google.oauth`;
  const name = profile.displayName ?? 'User';

  const { rows: existing } = await query<User>(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  if (existing.length > 0) {
    const user = existing[0];
    // Si el usuario estaba soft-deleted (deleted_at no null), lo reactivamos
    if ((user as any).deleted_at) {
      await query('UPDATE users SET deleted_at = NULL, updated_at = NOW() WHERE id = $1', [user.id]);
      const { rows: refreshed } = await query<User>('SELECT * FROM users WHERE id = $1', [user.id]);
      return { user: refreshed[0] ?? user, created: false };
    }
    return { user, created: false };
  }

  const { rows: realCount } = await query<{ c: string }>(
    'SELECT COUNT(*)::int AS c FROM users WHERE email <> $1',
    [SEED_DEMO_AUTHOR_EMAIL]
  );
  const isFirstUser = Number(realCount[0]?.c) === 0;
  const role = isFirstUser ? 'superuser' : 'user';

  const { rows: inserted } = await query<User>(
    `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING *`,
    [email, name, role]
  );
  return { user: inserted[0], created: true };
}

async function trySendWelcomeAndLog(user: User): Promise<void> {
  try {
    const result = await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      preferredLanguage: user.preferred_language ?? 'en',
    });
    await logNotification({
      channel: 'email',
      recipient: user.email,
      subject_or_template: 'welcome',
      related_type: 'user',
      related_id: user.id,
      status: result.sent ? 'sent' : 'failed',
      error_message: result.error ?? null,
    });
    if (!result.sent && result.error) {
      console.error('[email] sendWelcomeEmail failed:', result.error);
    }
  } catch (e) {
    console.error('[email] sendWelcomeEmail error:', e);
  }
}

export function configurePassport(): void {
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const GoogleStrategy = require('passport-google-oauth20').Strategy;
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${env.API_URL.replace(/\/$/, '')}/auth/google/callback`,
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: { id: string; emails?: Array<{ value: string }>; displayName?: string },
          done: (err: Error | null, user?: User, info?: { created?: boolean }) => void
        ) => {
          try {
            const { user, created } = await findOrCreateUser(profile);
            done(null, user, { created });
          } catch (e) {
            done(e as Error);
          }
        }
      )
    );
  }

  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as User).id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const { rows } = await query<User>('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
      done(null, rows[0] ?? null);
    } catch (e) {
      done(e as Error);
    }
  });
}
