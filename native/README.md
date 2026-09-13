# ميقاتي على Android

هذا المجلد يحتوي غلاف Capacitor الخاص بنسخة Android، بينما يبقى تطبيق الويب/PWA في جذر المستودع دون تغيير.

## المتطلبات

- Node.js 22 أو أحدث
- Android Studio مع Android SDK
- JDK 21

## إنشاء مشروع Android محليًا

من جذر المستودع:

```bash
npm ci
npm test
npm run build -- --mode capacitor
cd native
npm install
npx cap add android
npx cap sync android
node scripts/prepare-android.mjs
npx cap open android
```

بعد إنشاء `native/android/` لأول مرة، لا تكرر `cap add android`. عند تعديل واجهة ميقاتي يكفي إعادة بناء حزمة الويب ثم تشغيل:

```bash
cd native
npx cap sync android
node scripts/prepare-android.mjs
```

## APK التجريبي

يمكن بناء APK من Android Studio أو بالأمر:

```bash
cd native/android
./gradlew assembleDebug
```

الناتج يكون عادة في:

`native/android/app/build/outputs/apk/debug/app-debug.apk`

كما يبني GitHub Actions ملف APK تجريبيًا تلقائيًا ويضعه ضمن Artifacts لسير العمل `Build Android APK`.

## ملاحظة مهمة عن التنبيهات

هذه المرحلة تغلف تطبيق PWA كتطبيق Android أصلي وتدعم الموقع. التنبيهات الحالية في شفرة الويب ليست بعدُ منبّه Android أصليًا مجدولًا في الخلفية. للحصول على تنبيهات صلاة موثوقة عند إغلاق التطبيق، يجب إضافة `@capacitor/local-notifications` وجدولة المواقيت على Android، وهي مرحلة مستقلة عن نجاح إنشاء APK.
