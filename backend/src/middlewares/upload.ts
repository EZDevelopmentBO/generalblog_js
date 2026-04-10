import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadsDir = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const slug = (req.body?.slug ?? req.body?.title ?? 'image').toString();
    const safe = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 80) || 'image';
    const ext = path.extname(file.originalname) || '.jpg';
    const name = `${safe}-${Date.now()}${ext}`;
    cb(null, name);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error('Solo imágenes (jpeg, png, gif, webp) permitidas'));
  },
});
