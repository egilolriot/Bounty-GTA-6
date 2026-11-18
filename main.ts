import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Porto Sol — dossier builder (make.fun gta6-01).
// Copies game/ (+ screenshots/ when present) into the output directory and
// builds the submission dossier with the starter kit's buildDossier helper.

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

function countFiles(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += countFiles(full);
    else if (entry.isFile()) total += 1;
  }
  return total;
}

function dirSizeBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

// Clear the output directory, then recreate it fresh.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Copy the game (and screenshots when the folder exists) into the output.
const gameSrc = join(repoRoot, 'game');
if (!existsSync(gameSrc)) throw new Error(`game/ folder not found at ${gameSrc}`);
cpSync(gameSrc, join(outDir, 'game'), { recursive: true });

const shotsSrc = join(repoRoot, 'screenshots');
if (existsSync(shotsSrc)) {
  cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });
}

const dossier = await buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

const dossierPath = join(outDir, 'dossier.json');
// buildDossier mengembalikan Uint8Array yang SUDAH berisi byte dossier yang
// tepat — tulis langsung sebagai biner. JANGAN JSON.stringify: itu mengubah
// Uint8Array menjadi objek {"0":123,"1":34,...} yang membengkak dan salah.
writeFileSync(dossierPath, dossier);

const gameFiles = countFiles(join(outDir, 'game'));
const gameBytes = dirSizeBytes(join(outDir, 'game'));
console.log(`Porto Sol dossier built: ${gameFiles} game files (${gameBytes} bytes)`);
console.log(`Dossier: ${dossierPath} (${dossier.byteLength} bytes)`);
console.log(`Output dir: ${outDir}`);
