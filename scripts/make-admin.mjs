// Usage: node --env-file=.env.local scripts/make-admin.mjs <email>
// Grants the admin role to an existing account.
import { PrismaClient } from '@prisma/client';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('usage: node --env-file=.env.local scripts/make-admin.mjs <email>');
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  const { count } = await prisma.user.updateMany({ where: { email }, data: { role: 'admin' } });
  console.log(count ? `${email} is now an admin` : `no account for ${email}`);
} finally {
  await prisma.$disconnect();
}
