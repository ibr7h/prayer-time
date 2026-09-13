import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const manifestUrl = new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url);
const manifestPath = fileURLToPath(manifestUrl);

if (!existsSync(manifestPath)) {
  console.error('Android project not found. Run `npx cap add android` from native/ first.');
  process.exit(1);
}

let manifest = readFileSync(manifestPath, 'utf8');
const permissions = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.VIBRATE'
];

const missing = permissions.filter((permission) => !manifest.includes(permission));
if (missing.length) {
  const declarations = missing
    .map((permission) => `    <uses-permission android:name="${permission}" />`)
    .join('\n');
  manifest = manifest.replace(/\s*<application\b/, `\n${declarations}\n\n    <application`);
  writeFileSync(manifestPath, manifest);
  console.log(`Added Android permissions: ${missing.join(', ')}`);
} else {
  console.log('Android permissions already present.');
}

const rawDir = fileURLToPath(new URL('../android/app/src/main/res/raw/', import.meta.url));
mkdirSync(rawDir, { recursive: true });

const sounds = [
  ['../../public/audio/adhan-default.mp3', 'adhan_default.mp3'],
  ['../../public/audio/adhan-fajr.mp3', 'adhan_fajr.mp3']
];

for (const [sourceRelative, targetName] of sounds) {
  const source = fileURLToPath(new URL(sourceRelative, import.meta.url));
  if (!existsSync(source)) {
    console.error(`Missing adhan source file: ${source}`);
    process.exit(1);
  }
  copyFileSync(source, `${rawDir}/${targetName}`);
  console.log(`Copied native notification sound: ${targetName}`);
}
