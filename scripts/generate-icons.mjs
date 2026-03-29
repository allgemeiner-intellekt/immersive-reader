// Generate simple SVG-based PNG icons for development
// In production, replace with proper designed icons
import { writeFileSync } from 'fs';

const sizes = [16, 48, 128];

function generateSVG(size) {
  const fontSize = Math.round(size * 0.5);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="#3B82F6"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="Arial" font-size="${fontSize}" font-weight="bold">IR</text>
</svg>`;
}

for (const size of sizes) {
  writeFileSync(`public/icons/icon-${size}.svg`, generateSVG(size));
  console.log(`Generated icon-${size}.svg`);
}

console.log('Note: Convert SVGs to PNGs for production use');
