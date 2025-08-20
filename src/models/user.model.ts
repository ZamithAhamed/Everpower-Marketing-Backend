import bcrypt from 'bcryptjs';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
}

const users: User[] = [];

// Seed a demo user for testing
(function seed() {
  const passwordHash = bcrypt.hashSync('password123', 10);
  users.push({
    id: '1',
    email: 'demo@acme.com',
    name: 'Demo User',
    passwordHash,
  });
})();

export function findUserByEmail(email: string): User | undefined {
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}