// Splits "Fish Pack 30 - Coral Bay" into one GLB per fish.
//
//   node scripts/split-fish-pack.mjs [input.glb] [outDir]
//
// Each output keeps only that fish's meshes, its skeleton and the animation channels that drive it,
// resamples the baked animation (drops redundant keys), strips meaningless vertex colours, prunes
// everything unused, then shrinks textures to 1024px WebP.
//
// Work runs in child processes, one step at a time: @gltf-transform/functions pulls in ndarray-pixels,
// which bundles its own sharp/libvips. Loading that alongside the project's sharp in one process breaks
// libvips ("colourspace: parameter space not set"), so the split step never loads sharp and the texture
// step never loads @gltf-transform/functions.

import { mkdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const INPUT = args[0] ?? 'public/models/fishes/Fish_Pack_30_-_Coral_Bay.glb';
const OUT_DIR = args[1] ?? 'public/models/fishes/coral-bay';
const TEXTURE_SIZE = 1024;

// slug, display name, mesh-name prefix used in the pack.
const FISH = [
  ['double-saddle', 'Double-Saddle', 'DSaddle_'],
  ['powder-blue-tang', 'Powder Blue Tang', 'PowBTang_'],
  ['yellow-tang', 'Yellow Tang', 'YTang01_'],
  ['caranx', 'Caranx fish', 'Caranx_'],
  ['bannerfish', 'Bannerfish', 'Bannerfish_'],
  ['bicolor-angelfish', 'Bicolor Angelfish', 'Bicolor_'],
  ['clown-triggerfish', 'Clown Triggerfish', 'ClownTriggerfish_'],
  ['convict-tang', 'Convict Tang', 'convict_tang_'],
  ['emperor-angelfish', 'Emperor Angelfish', 'EmperorAngelfish_'],
  ['juvenile-angelfish', 'Juvenile Angelfish', 'Juvenile_'],
  ['royal-angelfish', 'Royal Angelfish', 'RoyalAngelfish_'],
  ['threadfin', 'Threadfin', 'Threadfin_'],
  ['yellow-longnose', 'Yellow Longnose', 'YLongnose_'],
  ['blue-tang', 'Blue Tang', 'bluetang_'],
  ['purple-tang', 'Purple Tang', 'PurpleTang_'],
  ['copperband', 'Copperband', 'copperband_'],
  ['lined-surgeon', 'Lined Surgeon', 'LinedSurgeon_'],
  ['flame-angelfish', 'Flame Angelfish', 'FlameAngelfish_'],
  ['fusilier', 'Fusilier', 'fusilier_'],
  ['clownfish-black', 'Clownfish Black', 'ClownfishBlack_'],
  ['clownfish-orange', 'Clownfish Orange', 'ClownfishOrange_'],
  ...Array.from({ length: 9 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return [`discus-${n}`, `Discus ${n}`, `Discus${n}__`];
  }),
];

const io = new NodeIO().registerExtensions([EXTTextureWebP]);
const outPath = (slug) => path.join(OUT_DIR, `${slug}.glb`);

/** Step 1 (no sharp loaded): cut one fish out of the pack. */
async function split([slug, label, prefix]) {
  const { dedup, prune, resample } = await import('@gltf-transform/functions');
  const doc = await io.read(INPUT);
  const root = doc.getRoot();
  const nodes = root.listNodes();

  const meshNodes = nodes.filter((n) => n.getMesh() && n.getName().startsWith(prefix));
  if (meshNodes.length === 0) throw new Error(`${label}: no meshes match "${prefix}"`);

  // Keep the fish's meshes, every joint of their skins, and all ancestors of those.
  const keep = new Set();
  const addWithAncestors = (n) => {
    for (let p = n; p && !keep.has(p); p = p.getParentNode()) keep.add(p);
  };
  for (const m of meshNodes) {
    addWithAncestors(m);
    const skin = m.getSkin();
    if (skin) {
      for (const j of skin.listJoints()) addWithAncestors(j);
      const sk = skin.getSkeleton();
      if (sk) addWithAncestors(sk);
    }
  }

  // Animation: keep only channels that target this fish's nodes.
  for (const anim of root.listAnimations()) {
    for (const ch of anim.listChannels()) {
      const target = ch.getTargetNode();
      if (!target || !keep.has(target)) {
        // Samplers hold the keyframe data; leaving them on the animation keeps every other fish's keys alive.
        ch.getSampler()?.dispose();
        ch.dispose();
      }
    }
    anim.setName('swim');
  }

  // Drop every node that isn't part of this fish (children first).
  for (const n of [...nodes].reverse()) if (!keep.has(n)) n.dispose();

  // The pack's COLOR_0 is a flat black conversion artefact. three.js multiplies it into the texture, which
  // turns the fish black, so drop vertex colours that carry no information.
  for (const n of meshNodes) {
    for (const prim of n.getMesh().listPrimitives()) {
      const color = prim.getAttribute('COLOR_0');
      if (!color) continue;
      const min = color.getMinNormalized([]);
      const max = color.getMaxNormalized([]);
      if (max.slice(0, 3).every((v, i) => Math.abs(v - min[i]) < 0.02)) prim.setAttribute('COLOR_0', null);
    }
  }

  // Some materials have no metallic/roughness map but factors of metal=1, rough=0 (e.g. discus03), which renders
  // as a perfect chrome mirror — black without a bright environment. Fish skin isn't metal.
  for (const mat of root.listMaterials()) {
    if (!mat.getMetallicRoughnessTexture()) mat.setMetallicFactor(0).setRoughnessFactor(0.55);
  }

  root.getAsset().extras = { source: 'Fish Pack 30 - Coral Bay (split)', fish: label };
  await doc.transform(resample({ tolerance: 1e-4 }), prune(), dedup());
  await io.write(outPath(slug), doc);
}

/** Step 2 (no @gltf-transform/functions loaded): resize textures and re-encode as WebP. */
async function shrink(slug) {
  const sharp = (await import('sharp')).default;
  const doc = await io.read(outPath(slug));
  let converted = 0;
  for (const tex of doc.getRoot().listTextures()) {
    const src = tex.getImage();
    if (!src || tex.getMimeType() === 'image/webp') continue;
    const out = await sharp(Buffer.from(src))
      .resize({ width: TEXTURE_SIZE, height: TEXTURE_SIZE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toBuffer();
    tex.setImage(new Uint8Array(out)).setMimeType('image/webp');
    tex.setURI((tex.getURI() || tex.getName() || 'texture').replace(/\.(png|jpe?g)(_flipY)?$/i, '') + '.webp');
    converted++;
  }
  // Only declare the extension when WebP images are actually present.
  if (converted) doc.createExtension(EXTTextureWebP).setRequired(true);
  await io.write(outPath(slug), doc);
}

async function report(slug, label) {
  const doc = await io.read(outPath(slug));
  const r = doc.getRoot();
  const tris = r.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  const kb = Math.round(statSync(outPath(slug)).size / 1024);
  const tex = r.listTextures().map((t) => `${t.getMimeType().replace('image/', '')}:${t.getSize()?.join('x')}`).join(' ');
  const joints = r.listSkins().reduce((s, k) => s + k.listJoints().length, 0);
  const channels = r.listAnimations()[0]?.listChannels().length ?? 0;
  const vcol = r.listMeshes().some((m) => m.listPrimitives().some((p) => p.getAttribute('COLOR_0')));
  console.log(`${slug.padEnd(20)} ${String(kb).padStart(6)} KB  tris=${tris} joints=${joints} ch=${channels} vcol=${vcol} tex=[${tex}]`);
  return kb;
}

const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const findFish = (slug) => FISH.find((f) => f[0] === slug) ?? (() => { throw new Error(`unknown fish "${slug}"`); })();

if (flag('split')) {
  await split(findFish(flag('split')));
} else if (flag('shrink')) {
  await shrink(flag('shrink'));
} else {
  await mkdir(OUT_DIR, { recursive: true });
  const run = (step, slug) => {
    const res = spawnSync(process.execPath, [process.argv[1], INPUT, OUT_DIR, `--${step}=${slug}`], { encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`${step} ${slug} failed:\n${res.stderr}`);
  };
  let total = 0;
  for (const [slug, label] of FISH) {
    run('split', slug);
    run('shrink', slug);
    total += await report(slug, label);
  }
  console.log(`\n${FISH.length} fish, ${(total / 1024).toFixed(1)} MB total`);
}
