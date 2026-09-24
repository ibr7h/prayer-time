import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
  'android.permission.SCHEDULE_EXACT_ALARM'
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
  console.log('Required Android permissions already present.');
}
