import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

export default async function teardown() {
  config({ path: '.env.local' });
  const prisma = new PrismaClient();
  try {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@fishora.test' } } });
  } finally {
    await prisma.$disconnect();
  }
}
