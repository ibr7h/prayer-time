import sharp from 'sharp';

for (const [size, filename] of [
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
  [180, 'apple-touch-icon.png']
]) {
  await sharp('public/icon.svg', { density: 384 })
    .resize(size, size)
    .png()
    .toFile(`public/${filename}`);
}

console.log('Generated PWA and Apple touch icons.');
