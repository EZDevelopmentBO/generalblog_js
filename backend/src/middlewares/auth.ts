import type { Request, Response, NextFunction } from 'express';
import { canManageBlogContent, canManageDiscountCodes } from '../types';
import { roleHasPermission } from '../services/rbac';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated() && req.user) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}

export function requireSuperUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = req.user as { role?: string };
  if (user.role !== 'superuser') {
    res.status(403).json({ error: 'Forbidden: superuser required' });
    return;
  }
  next();
}

/** Editor (gestor de contenidos) o superusuario: rutas del blog admin que no son solo superuser. */
export function requireContentEditorOrSuperuser(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = req.user as { role?: string };
  roleHasPermission(user.role, 'blog.manage')
    .then((allowed) => {
      if (!allowed && !canManageBlogContent(user.role)) {
        res.status(403).json({ error: 'Forbidden: editor or superuser required' });
        return;
      }
      next();
    })
    .catch(() => res.status(500).json({ error: 'Internal server error' }));
}

/** Manager de cupones o superuser. */
export function requireDiscountManager(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = req.user as { role?: string };
  roleHasPermission(user.role, 'discount.manage')
    .then((allowed) => {
      if (!allowed && !canManageDiscountCodes(user.role)) {
        res.status(403).json({ error: 'Forbidden: discount manager required' });
        return;
      }
      next();
    })
    .catch(() => res.status(500).json({ error: 'Internal server error' }));
}
