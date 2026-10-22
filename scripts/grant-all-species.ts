// Usage: node --env-file=.env.local --import tsx scripts/grant-all-species.ts [email]
// Dev helper: puts one fish of every active live species into a player's storage (default: DEV_PLAYER_EMAIL).
// Goes through the game's own createFish, so each fish gets its history and discovery; storage capacity is not
// checked, and each fish gets its species' smallest spawn weight.
import { prisma } from '@/lib/db';
import { createFish } from '@/lib/game/fish/create';
import { withPlayer } from '@/lib/game/tx';

const email = (process.argv[2] ?? process.env.DEV_PLAYER_EMAIL)?.trim().toLowerCase();
if (!email) {
  console.error('usage: node --env-file=.env.local --import tsx scripts/grant-all-species.ts <email>');
  process.exit(1);
}

async function main(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error('no account for that email');
  const species = await prisma.species.findMany({ where: { profile: 'live', active: true, deletedAt: null }, orderBy: [{ rarity: 'asc' }, { key: 'asc' }] });
  await withPlayer(user.id, async (tx, ctx) => {
    for (const sp of species) {
      await createFish(tx, user.id, sp.key, 'reward', { location: 'storage', weightGrams: sp.spawnWeightMinGrams }, ctx);
    }
  });
  console.log(`added ${species.length} fish to storage:`);
  for (const sp of species) console.log(`  ${sp.rarity.padEnd(9)} ${sp.displayName}`);
}

main(email)
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
