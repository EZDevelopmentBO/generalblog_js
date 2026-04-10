import { Router, Request, Response } from 'express';
import path from 'path';
import { requireAuth, requireContentEditorOrSuperuser } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

export const uploadsRouter = Router();

uploadsRouter.post(
  '/',
  requireAuth,
  requireContentEditorOrSuperuser,
  upload.single('image'),
  (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No image file' });
        return;
      }
      res.json({ url: `/api/uploads/${req.file.filename}` });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);
