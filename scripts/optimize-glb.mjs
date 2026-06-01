/**
 * GLB optimizer — strips unused textures/UVs, deduplicates accessors,
 * and welds vertices. Run once after updating source GLBs:
 *   node scripts/optimize-glb.mjs
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize } from '@gltf-transform/functions';
import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function optimize(inputPath, outputPath, { stripTextures = true, stripUVs = true } = {}) {
  const before = statSync(inputPath).size;
  console.log(`\nProcessing: ${inputPath}`);
  console.log(`  Before: ${(before / 1024 / 1024).toFixed(2)} MB`);

  const doc = await io.read(inputPath);
  const root = doc.getRoot();

  if (stripTextures) {
    // Disconnect all texture references from materials so textures become orphaned
    for (const mat of root.listMaterials()) {
      mat.setBaseColorTexture(null);
      mat.setNormalTexture(null);
      mat.setMetallicRoughnessTexture(null);
      mat.setOcclusionTexture(null);
      mat.setEmissiveTexture(null);
    }
    // Dispose orphaned textures
    for (const tex of root.listTextures()) {
      tex.dispose();
    }
  }

  if (stripUVs) {
    // Remove TEXCOORD_0 (we use only POSITION + NORMAL in our custom shaders)
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const uv = prim.getAttribute('TEXCOORD_0');
        if (uv) {
          prim.setAttribute('TEXCOORD_0', null);
        }
      }
    }
  }

  // Quantize positions/normals to 16-bit integers (halves geometry size with no visual loss)
  // dedup merges identical accessors, prune removes orphaned resources
  await doc.transform(
    quantize({ quantizePosition: 14, quantizeNormal: 10 }),
    dedup(),
    prune(),
    weld({ tolerance: 1e-4 }),
  );

  await io.write(outputPath, doc);

  const after = statSync(outputPath).size;
  const pct = (((before - after) / before) * 100).toFixed(1);
  console.log(`  After:  ${(after / 1024 / 1024).toFixed(2)} MB  (${pct}% reduction)`);
}

const root = resolve(process.cwd(), 'public');

await optimize(`${root}/Orange_Rocket.glb`, `${root}/Orange_Rocket.glb`, {
  stripTextures: true,
  stripUVs: true,
});

await optimize(`${root}/toy_rocket.glb`, `${root}/toy_rocket.glb`, {
  stripTextures: true,
  stripUVs: false, // keep UVs on flame in case needed
});

console.log('\nDone.');
