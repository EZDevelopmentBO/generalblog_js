/**
 * Borra un usuario de la base de datos por email.
 * Limpia la cuenta: se elimina el usuario; los posts que tuviera como autor quedan con author_id = NULL.
 *
 * Uso: npm run delete-user -- <email>
 * Ejemplo: npm run delete-user -- usuario@gmail.com
 */
import 'dotenv/config';
import { query } from '../config/database';

const email = process.argv[2];
if (!email) {
  console.error('Uso: npm run delete-user -- <email>');
  process.exit(1);
}

const emailTrim = email.trim();

query<{ id: number; email: string; name: string }>(
  'DELETE FROM users WHERE email = $1 RETURNING id, email, name',
  [emailTrim]
)
  .then(({ rows }) => {
    if (rows.length === 0) {
      console.error('No se encontró ningún usuario con ese email.');
      process.exit(1);
    }
    console.log('Usuario eliminado:', rows[0].email, `(id: ${rows[0].id}, name: ${rows[0].name})`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
