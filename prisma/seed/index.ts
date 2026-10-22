import { PrismaClient } from '@prisma/client';
import { applyContent } from './apply';
import { PLACEHOLDER_CONTENT } from './placeholder-balance';

// `npm run db:seed`: writes the placeholder content into the 'live' profile. Safe to re-run.
const prisma = new PrismaClient();

applyContent(prisma, PLACEHOLDER_CONTENT, 'live')
  .then(() => console.log('seeded live content'))
  .finally(() => prisma.$disconnect());
