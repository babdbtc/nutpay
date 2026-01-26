#!/usr/bin/env node

import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZES = [16, 32, 48, 128];

// Peanut/nut themed icon SVG - stylized peanut with Bitcoin orange
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Background -->
  <rect width="128" height="128" rx="24" fill="#1a1a2e"/>

  <!-- Peanut shape - two connected lobes -->
  <ellipse cx="64" cy="44" rx="28" ry="24" fill="#f7931a"/>
  <ellipse cx="64" cy="84" rx="28" ry="24" fill="#f7931a"/>

  <!-- Center connection/waist -->
  <ellipse cx="64" cy="64" rx="18" ry="12" fill="#d97706"/>

  <!-- Highlight on top lobe -->
  <ellipse cx="56" cy="38" rx="8" ry="6" fill="#fbbf24" opacity="0.6"/>

  <!-- Shell texture lines -->
  <path d="M 42 36 Q 48 40 42 50" stroke="#d97706" stroke-width="2" fill="none" opacity="0.5"/>
  <path d="M 86 36 Q 80 40 86 50" stroke="#d97706" stroke-width="2" fill="none" opacity="0.5"/>
  <path d="M 42 78 Q 48 82 42 92" stroke="#d97706" stroke-width="2" fill="none" opacity="0.5"/>
  <path d="M 86 78 Q 80 82 86 92" stroke="#d97706" stroke-width="2" fill="none" opacity="0.5"/>
</svg>
`;

async function generateIcons() {
  const iconsDir = resolve(__dirname, '../assets/icons');

  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true });
  }

  const svgBuffer = Buffer.from(iconSvg);

  for (const size of SIZES) {
    const outputPath = resolve(iconsDir, `icon-${size}.png`);

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Generated: icon-${size}.png`);
  }

  console.log('Icon generation complete!');
}

generateIcons().catch(console.error);
