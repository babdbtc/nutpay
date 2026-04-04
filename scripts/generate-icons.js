#!/usr/bin/env node

import sharp from 'sharp';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZES = [16, 32, 48, 128];

async function generateIcons() {
  const iconsDir = resolve(__dirname, '../assets/icons');
  const logoPath = resolve(__dirname, '../assets/icons/logo.png');

  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true });
  }

  if (!existsSync(logoPath)) {
    console.error(`Error: logo source not found at ${logoPath}`);
    process.exit(1);
  }

  const sourceBuffer = readFileSync(logoPath);

  for (const size of SIZES) {
    const outputPath = resolve(iconsDir, `icon-${size}.png`);

    await sharp(sourceBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Generated: icon-${size}.png`);
  }

  console.log('Icon generation complete!');
}

generateIcons().catch(console.error);
