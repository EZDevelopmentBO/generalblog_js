import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { query } from '../config/database';
import { createPost, isValidCategory } from '../services/blog';
import type { BlogCategory, BlogPostCreateInput } from '../types';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function main(): void {
  const args = process.argv.slice(2);
  const jsonPath = args[0];
  let authorId: number | undefined;
  if (args[1] != null) {
    authorId = parseInt(args[1], 10);
    if (Number.isNaN(authorId)) authorId = undefined;
  }
  if (process.env.AUTHOR_ID) {
    authorId = parseInt(process.env.AUTHOR_ID, 10);
  }

  if (!jsonPath) {
    console.error('Uso: node create-post-from-json.js <archivo.json> [author_id]');
    console.error('  o: AUTHOR_ID=1 node create-post-from-json.js post.json');
    process.exit(1);
  }

  const fullPath = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
  if (!fs.existsSync(fullPath)) {
    console.error('Archivo no encontrado:', fullPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(fullPath, 'utf-8');
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    console.error('JSON inválido:', (e as Error).message);
    process.exit(1);
  }

  const title = String(data.title ?? '').trim();
  const category = String(data.category ?? '').trim();
  const content = String(data.content ?? '').trim();

  if (!title || !category || !content) {
    console.error('Faltan campos obligatorios: title, category, content');
    process.exit(1);
  }
  if (!isValidCategory(category)) {
    console.error('Categoría no permitida:', category);
    process.exit(1);
  }

  const input: BlogPostCreateInput = {
    title,
    category: category as BlogCategory,
    content,
    excerpt: data.excerpt != null ? String(data.excerpt) : null,
    featured_image: data.featured_image != null ? String(data.featured_image) : null,
    published: Boolean(data.published),
    published_at: data.published_at != null ? String(data.published_at) : null,
    meta_title: data.meta_title != null ? String(data.meta_title) : null,
    meta_description: data.meta_description != null ? String(data.meta_description) : null,
    meta_keywords: data.meta_keywords != null ? String(data.meta_keywords) : null,
    language: (data.language as string) ?? 'es',
    related_title: data.related_title != null ? String(data.related_title) : null,
    related_year: data.related_year != null ? String(data.related_year) : null,
  };

  run(input, authorId).then(
    (post) => {
      console.log('Post creado:');
      console.log('  id:', post.id);
      console.log('  slug:', post.slug);
      console.log('  title:', post.title);
      process.exit(0);
    },
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}

async function run(
  input: BlogPostCreateInput,
  authorId?: number
): Promise<{ id: number; slug: string; title: string }> {
  let resolvedAuthorId: number | null = authorId ?? null;
  if (resolvedAuthorId == null) {
    const { rows } = await query<{ id: number }>(
      "SELECT id FROM users WHERE role = 'superuser' ORDER BY id LIMIT 1"
    );
    if (rows.length === 0) {
      throw new Error('No hay usuario superuser en la BD. Pasa author_id o define AUTHOR_ID.');
    }
    resolvedAuthorId = rows[0].id;
  }

  const post = await createPost(input, resolvedAuthorId);
  return { id: post.id, slug: post.slug, title: post.title };
}

main();
