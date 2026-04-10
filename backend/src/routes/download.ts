import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getDownloadTokenInfo, incrementDownloadCount, getPostIdByToken } from '../services/downloadToken';
import { getDownloadMaxCount } from '../services/settings';
import { getPostDownloadByPostId, getPostSlugAndCategory } from '../services/blog';
import { downloadsDir } from '../middlewares/uploadDownload';
import { env } from '../config/env';

export const downloadRouter = Router();

function buildDownloadErrorRedirect(reason: 'limit' | 'expired', slug?: string, category?: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const params = new URLSearchParams({ reason });
  if (slug) params.set('slug', slug);
  if (category) params.set('category', category);
  return `${base}/download-error?${params.toString()}`;
}

downloadRouter.get('/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token?.trim();
    if (!token) {
      res.status(400).json({ error: 'Token required' });
      return;
    }
    const tokenRow = await getDownloadTokenInfo(token);
    if (!tokenRow) {
      const postId = await getPostIdByToken(token);
      const info = postId ? await getPostSlugAndCategory(postId) : null;
      const url = buildDownloadErrorRedirect(
        'expired',
        info?.slug,
        info?.category
      );
      res.redirect(302, url);
      return;
    }
    const maxCount = await getDownloadMaxCount();
    const currentCount = tokenRow.download_count ?? 0;
    if (currentCount >= maxCount) {
      const info = await getPostSlugAndCategory(tokenRow.post_id);
      const url = buildDownloadErrorRedirect(
        'limit',
        info?.slug,
        info?.category
      );
      res.redirect(302, url);
      return;
    }
    const incremented = await incrementDownloadCount(tokenRow.id, maxCount);
    if (!incremented) {
      const info = await getPostSlugAndCategory(tokenRow.post_id);
      const url = buildDownloadErrorRedirect(
        'limit',
        info?.slug,
        info?.category
      );
      res.redirect(302, url);
      return;
    }
    const download = await getPostDownloadByPostId(tokenRow.post_id);
    if (!download) {
      res.status(404).json({ error: 'Archivo no encontrado' });
      return;
    }
    const filePath = path.join(downloadsDir, download.file_path);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Archivo no encontrado' });
      return;
    }
    const filename = download.filename_display || 'download.zip';
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '\\"')}"`);
    res.sendFile(path.resolve(filePath));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al descargar' });
  }
});
