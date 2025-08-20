import { pool } from '../config/db';
import bcrypt from 'bcryptjs';

async function main() {
  const hash = bcrypt.hashSync('password123', 10);
  await pool.execute(
    `INSERT IGNORE INTO users (email, name, password_hash)
     VALUES (:email, :name, :hash)`,
    { email: 'admin@everpower.com', name: 'Everpower Admin', hash }
  );
  console.log('Seeded user admin@everpower.com / password123');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
