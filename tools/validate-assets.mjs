import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('apps/client/public/assets/cats');
const triggerRoot = resolve('apps/client/public/assets/triggers');
const expectedKittens = [
  'kitten_01_lightning_tail',
  'kitten_02_ground_gripper',
  'kitten_03_judgmental_eyes',
  'kitten_04_big_hiss',
];
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function inspectPng(buffer, file) {
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error(`${file}: not a PNG`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const interlace = buffer[28];
  if (width !== 64 || height !== 64) throw new Error(`${file}: expected 64x64, got ${width}x${height}`);
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error(`${file}: expected non-interlaced 8-bit RGBA PNG`);

  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const rows = [];
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor++];
    const row = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    const previous = rows[y - 1];
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous?.[x] ?? 0;
      const upLeft = x >= 4 ? previous?.[x - 4] ?? 0 : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`${file}: unsupported PNG filter ${filter}`);
    }
    rows.push(row);
  }
  const alpha = rows.flatMap((row) => [...row.filter((_, index) => index % 4 === 3)]);
  if (!alpha.includes(0) || !alpha.some((value) => value > 0)) throw new Error(`${file}: transparency check failed`);
}

async function main() {
  const folders = await readdir(root);
  for (const kitten of expectedKittens) {
    if (!folders.includes(kitten)) throw new Error(`Missing ${kitten}`);
    const directory = resolve(root, kitten);
    const files = await readdir(directory);
    const states = ['idle', 'anticipate', 'hiss', 'recover', 'side_eye', 'walk', 'meow', 'boop', 'surprised'];
    for (const required of [...states.map((state) => `${state}.png`), 'metadata.json']) {
      if (!files.includes(required)) throw new Error(`${kitten}: missing ${required}`);
    }
    const metadata = JSON.parse(await readFile(resolve(directory, 'metadata.json'), 'utf8'));
    if (metadata.frameWidth !== 64 || metadata.frameHeight !== 64 || metadata.pivot?.x !== 32 || metadata.pivot?.y !== 61) {
      throw new Error(`${kitten}: invalid metadata dimensions or pivot`);
    }
    for (const state of states) {
      if (metadata.animations?.[state]?.file !== `${state}.png`) throw new Error(`${kitten}: invalid ${state} metadata`);
      inspectPng(await readFile(resolve(directory, `${state}.png`)), `${kitten}/${state}.png`);
    }
  }
  const hissPath = resolve('apps/client/public/assets/audio/cat-hiss-zabuhailo.wav');
  const hiss = await readFile(hissPath);
  if (hiss.toString('ascii', 0, 4) !== 'RIFF' || hiss.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('cat-hiss-zabuhailo.wav: expected RIFF/WAVE audio');
  }
  if (hiss.readUInt16LE(22) !== 1 || hiss.readUInt32LE(24) !== 96_000) {
    throw new Error('cat-hiss-zabuhailo.wav: expected 96 kHz mono source');
  }
  const hissSha1 = createHash('sha1').update(hiss).digest('hex');
  if (hissSha1 !== 'f7df5552d045bff90274a4069aa5635bedf5e4c6') {
    throw new Error(`cat-hiss-zabuhailo.wav: unexpected SHA-1 ${hissSha1}`);
  }
  for (const trigger of ['dog', 'cat-mom', 'stranger', 'vacuum-mom']) {
    inspectPng(await readFile(resolve(triggerRoot, `${trigger}.png`)), `triggers/${trigger}.png`);
  }
  console.log(`Validated ${expectedKittens.length * 9} cat poses, 4 trigger sprites, metadata and CC0 hiss WAV.`);
}

await main();
