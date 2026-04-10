import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export const downloadsDir = path.join(process.cwd(), 'storage', 'downloads');

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, downloadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.zip';
    const name = `dl-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, name);
  },
});

export const uploadDownload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      /\.zip$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Solo archivos ZIP permitidos'));
  },
});
