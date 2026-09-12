#!/usr/bin/env node
// scripts/copy-mediapipe.mjs
// Vendors the MediaPipe FaceMesh runtime assets from node_modules into
// public/mediapipe/face_mesh so the proctor never depends on cdn.jsdelivr.net
// (which is unreachable on some networks and would silently disable all
// visual detection). Wired as `predev` / `prebuild`; idempotent — skips files
// that already exist with a matching size.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');

const SRC_DIR = path.join(frontendRoot, 'node_modules', '@mediapipe', 'face_mesh');
const DEST_DIR = path.join(frontendRoot, 'public', 'mediapipe', 'face_mesh');

// Runtime assets only — docs/types are not needed by the browser.
const RUNTIME_FILES = [
    'face_mesh.binarypb',
    'face_mesh.js',
    'face_mesh_solution_packed_assets.data',
    'face_mesh_solution_packed_assets_loader.js',
    'face_mesh_solution_simd_wasm_bin.data',
    'face_mesh_solution_simd_wasm_bin.js',
    'face_mesh_solution_simd_wasm_bin.wasm',
    'face_mesh_solution_wasm_bin.js',
    'face_mesh_solution_wasm_bin.wasm',
];

function fail(message) {
    console.error(`✗ copy-mediapipe: ${message}`);
    process.exit(1);
}

if (!fs.existsSync(SRC_DIR)) {
    fail('@mediapipe/face_mesh not found in node_modules — run `npm install` first.');
}

fs.mkdirSync(DEST_DIR, { recursive: true });

let copied = 0;
let skipped = 0;

for (const name of RUNTIME_FILES) {
    const src = path.join(SRC_DIR, name);
    const dest = path.join(DEST_DIR, name);

    if (!fs.existsSync(src)) continue; // optional file in this package version

    const srcSize = fs.statSync(src).size;
    if (fs.existsSync(dest) && fs.statSync(dest).size === srcSize) {
        skipped++;
        continue;
    }

    fs.copyFileSync(src, dest);
    copied++;
}

const missing = RUNTIME_FILES.filter(
    n => !fs.existsSync(path.join(SRC_DIR, n))
);

console.log(
    `✓ copy-mediapipe: ${copied} copied, ${skipped} up-to-date` +
    (missing.length ? ` (not present in installed version: ${missing.join(', ')})` : '')
);

// The SIMD wasm is mandatory — refuse to continue without it.
if (!fs.existsSync(path.join(DEST_DIR, 'face_mesh_solution_simd_wasm_bin.wasm'))) {
    fail('face_mesh_solution_simd_wasm_bin.wasm is missing after copy.');
}
