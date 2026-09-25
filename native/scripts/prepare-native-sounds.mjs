import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nativeDir = resolve(here, '..');
const soundsDir = join(nativeDir, 'sounds');
const platform = process.argv[2];
const files = ['adhan_default_short.wav', 'adhan_fajr_short.wav'];

for (const file of files) {
  const source = join(soundsDir, file);
  if (!existsSync(source)) {
    console.error(`Missing native notification sound: ${source}`);
    process.exit(1);
  }
}

if (platform === 'android') {
  const targetDir = join(nativeDir, 'android', 'app', 'src', 'main', 'res', 'raw');
  mkdirSync(targetDir, { recursive: true });
  for (const file of files) copyFileSync(join(soundsDir, file), join(targetDir, file));
  console.log('Copied Miqati notification sounds into Android res/raw.');
} else if (platform === 'ios') {
  const targetDir = join(nativeDir, 'ios', 'App', 'App');
  if (!existsSync(targetDir)) {
    console.error('Generated iOS app directory not found. Run npx cap add ios first.');
    process.exit(1);
  }
  for (const file of files) copyFileSync(join(soundsDir, file), join(targetDir, file));
  console.log('Copied Miqati notification sounds into the iOS app bundle directory.');
} else {
  console.error('Usage: node scripts/prepare-native-sounds.mjs <android|ios>');
  process.exit(1);
}
