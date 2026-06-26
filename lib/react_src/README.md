# 📱 اپ اندروید پنل آموزشی جامع
**طراح: نادر اکشیک**

---

## 📋 امکانات اپ

### 👩‍🎓 بخش دانش‌آموز
- ورود با کد یا لینک آزمون
- پر کردن اطلاعات (نام، نام پدر، کد ملی، نام درس)
- تایمر معکوس رنگی (سبز → زرد → قرمز)
- پاسخ به سوالات چهارگزینه‌ای، صحیح/غلط، کوتاه‌پاسخ، تشریحی
- ثبت نهایی آزمون
- نمایش نتیجه تصحیح

### 👩‍🏫 بخش معلم
- ورود امن با رمز عبور
- **دانش‌آموزان**: افزودن، حذف، اشتراک‌گذاری لینک آزمون
- **سوالات**: ایجاد و ویرایش سوال (۴ نوع) + سربرگ آزمون
- **پاسخنامه‌ها**: تصحیح دستی، بازخورد، نمره‌دهی
- **دستیار AI**: چت با هوش مصنوعی برای ساخت سوال و کمک آموزشی
- **تنظیمات**: تغییر رمز عبور، خروج

---

## 🚀 نصب و راه‌اندازی

### پیش‌نیازها
- **Node.js** نسخه ۱۸ یا بالاتر
- **Android Studio** با Android SDK
- **Java JDK 17**

### مرحله ۱ — آماده‌سازی محیط
```bash
# نصب React Native CLI
npm install -g react-native-cli

# نصب پکیج‌ها
cd ExamApp
npm install
```

### مرحله ۲ — تنظیم آدرس ورکر
فایل `src/utils/api.js` را باز کنید و خط زیر را پیدا کنید:
```js
export const WORKER_URL = "https://YOUR_WORKER.workers.dev";
```
آدرس ورکر Cloudflare خود را جایگزین کنید:
```js
export const WORKER_URL = "https://exam-worker.your-name.workers.dev";
```

### مرحله ۳ — ساخت فایل APK

#### روش ۱: Debug APK (برای تست)
```bash
cd android
./gradlew assembleDebug
```
فایل APK در مسیر زیر است:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

#### روش ۲: Release APK (برای نشر)
```bash
cd android
./gradlew assembleRelease
```

### مرحله ۴ — نصب روی اندروید
```bash
# اگر گوشی وصل است
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🔧 اجرا در محیط توسعه
```bash
# شروع Metro bundler
npx react-native start

# در ترمینال دیگر
npx react-native run-android
```

---

## 📁 ساختار پروژه
```
ExamApp/
├── App.js                          ← نقطه شروع اپ
├── src/
│   ├── utils/
│   │   └── api.js                  ← اتصال به ورکر (آدرس اینجاست)
│   ├── context/
│   │   └── AuthContext.js          ← مدیریت ورود معلم
│   └── screens/
│       ├── TeacherLoginScreen.js   ← ورود معلم
│       ├── TeacherDashboard.js     ← داشبورد معلم
│       ├── StudentLoginScreen.js   ← ورود دانش‌آموز
│       ├── StudentExamScreen.js    ← صفحه آزمون
│       └── teacher/
│           ├── StudentsTab.js      ← مدیریت دانش‌آموزان
│           ├── QuestionsTab.js     ← مدیریت سوالات
│           ├── SubmissionsTab.js   ← تصحیح پاسخنامه‌ها
│           ├── AiChatTab.js        ← دستیار هوش مصنوعی
│           └── SettingsTab.js      ← تنظیمات
└── package.json
```

---

## ⚠️ نکات مهم

1. **CORS ورکر**: مطمئن شوید ورکر هدر `Access-Control-Allow-Origin: *` دارد
2. **HTTPS**: ورکر Cloudflare به صورت خودکار HTTPS دارد
3. **اندروید نسخه**: حداقل Android 6.0 (API 23)

---

## 🎨 رنگ‌بندی
- سبز (`#10b981`) → بخش دانش‌آموز
- بنفش (`#667eea`) → بخش معلم
