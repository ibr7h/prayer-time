# Android build for ميقاتي

The Android variant wraps the existing React/Vite application with Capacitor while keeping the GitHub Pages PWA build unchanged.

## Build modes

- `npm run build` builds the PWA into `docs/` for GitHub Pages.
- `npm run build:android` builds relative web assets into `dist/` for the native Android WebView.
- `npm run android:init` creates the Android project the first time.
- `npm run android:sync` rebuilds the web bundle and copies it into an existing Android project.
- `npm run android:open` opens the generated project in Android Studio.

The Android application ID is currently `sa.ibr7h.miqati`. Confirm this identifier before the first Google Play publication because changing the package identity after publication is not a normal upgrade path.

## Continuous integration

The `Build Android APK and AAB` GitHub Actions workflow validates tests, creates the Capacitor Android project, then builds:

- an installable debug APK for device testing;
- an unsigned release AAB as a packaging check.

The AAB is not ready for Google Play until release signing and a protected signing key are configured.

## Current notification boundary

This branch establishes the native Android shell and build pipeline. The current application still uses its browser-era notification/audio logic, so reliable scheduled prayer notifications while the app is closed are **not yet implemented**. Native local-notification scheduling, Android 13 notification permission handling, and exact-alarm policy should be added as a separate implementation step before treating the Android app as a dependable prayer alarm.
