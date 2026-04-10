/**
 * Promueve un usuario a superuser por email.
 * Uso: npm run promote-superuser -- tu@email.com
 */
import 'dotenv/config';
import { query } from '../config/database';

const email = process.argv[2];
if (!email) {
  console.error('Uso: npm run promote-superuser -- <email>');
  process.exit(1);
}

query('UPDATE users SET role = $1 WHERE email = $2 RETURNING id, email, role', [
  'superuser',
  email.trim(),
])
  .then(({ rows }) => {
    if (rows.length === 0) {
      console.error('No se encontró ningún usuario con ese email.');
      process.exit(1);
    }
    console.log('Usuario actualizado a superuser:', (rows[0] as { email: string }).email);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
