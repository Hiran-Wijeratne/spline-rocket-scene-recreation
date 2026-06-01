/**
 * GLB optimizer — strips unused textures/UVs and deduplicates accessors.
 * Safe for custom GLSL shaders: no quantize or weld (both change vertex
 * positions in ways that break our gradient/displacement shaders).
 * Run once after updating source GLBs:  node scripts/optimize-glb.mjs
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import { statSync } from 'fs';
import { resolve } from 'path';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function optimize(inputPath, outputPath, { stripTextures = true, stripUVs = false } = {}) {
  const before = statSync(inputPath).size;
  console.log(`\nProcessing: ${inputPath}`);
  console.log(`  Before: ${(before / 1024 / 1024).toFixed(2)} MB`);

  const doc = await io.read(inputPath);
  const root = doc.getRoot();

  if (stripTextures) {
    for (const mat of root.listMaterials()) {
      mat.setBaseColorTexture(null);
      mat.setNormalTexture(null);
      mat.setMetallicRoughnessTexture(null);
      mat.setOcclusionTexture(null);
      mat.setEmissiveTexture(null);
    }
    for (const tex of root.listTextures()) {
      tex.dispose();
    }
  }

  if (stripUVs) {
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const uv = prim.getAttribute('TEXCOORD_0');
        if (uv) prim.setAttribute('TEXCOORD_0', null);
      }
    }
  }

  // dedup merges shared identical accessors; prune drops orphaned resources.
  // No quantize (changes position encoding, breaks custom shaders).
  // No weld (merges vertices, can corrupt displacement geometry).
  await doc.transform(dedup(), prune());

  await io.write(outputPath, doc);

  const after = statSync(outputPath).size;
  const pct = (((before - after) / before) * 100).toFixed(1);
  console.log(`  After:  ${(after / 1024 / 1024).toFixed(2)} MB  (${pct}% reduction)`);
}

const root = resolve(process.cwd(), 'public');

// Rocket: strip the 3x 4096px PNGs + unused UV coords — huge win, UVs unused in our shader
await optimize(`${root}/Orange_Rocket.glb`, `${root}/Orange_Rocket.glb`, {
  stripTextures: true,
  stripUVs: true,
});

// Flame: strip tiny textures only — keep all geometry intact
await optimize(`${root}/toy_rocket.glb`, `${root}/toy_rocket.glb`, {
  stripTextures: true,
  stripUVs: false,
});

console.log('\nDone.');
