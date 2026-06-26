# 📱 پنل آموزشی جامع
**طراح: نادر اکشیک**

---

## 📦 محتوای پروژه

این Repository شامل دو بخش است:

### 1️⃣ اپلیکیشن اندروید (React Native/Expo)
فایل‌های مربوط به اپلیکیشن موبایل:
- `App.js` - نقطه شروع
- `app.json` - تنظیمات Expo
- `src/` - کدهای React Native

### 2️⃣ Cloudflare Worker (Backend)
فایل `worker.js` - بک‌اند کامل پنل شامل:
- پنل معلم (ورود/خروج، تغییر رمز عبور)
- مدیریت دانش‌آموزان با لینک اختصاصی
- آزمون‌سازی با انواع سوال (تشریحی، چهارگزینه‌ای، صحیح/غلط، کوتاه‌پاسخ)
- تایمر معکوس برای دانش‌آموز
- تصحیح و بازخورد (دستی + خودکار)
- برنامه هفتگی با خروجی Word/PDF
- جدول‌ساز حرفه‌ای با خروجی اکسل RTL
- اسکنر حرفه‌ای (مشابه CamScanner)
- کاهش حجم عکس، برش عکس، تبدیل PDF به عکس
- چت AI با Groq
- ترجمه متن با MyMemory

---

## 🚀 راهنمای ساخت APK با GitHub Actions

### مرحله ۱ — ساخت حساب Expo
1. برو به **[expo.dev](https://expo.dev)** و ثبت‌نام کن (رایگان)
2. بعد از ورود، از منوی بالا روی **Access Tokens** برو:
   `expo.dev → Account → Access Tokens → Create Token`
3. یه نام بنویس (مثلاً `github-build`) و توکن رو کپی کن

---

### مرحله ۲ — آپلود پروژه روی GitHub
1. یه **Repository جدید** در [github.com](https://github.com) بساز (Private یا Public)
2. این پوشه رو آپلود کن:

```bash
cd ExamApp2
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

---

### مرحله ۳ — تنظیم Secret در GitHub
1. در ریپو خود برو به:
   `Settings → Secrets and variables → Actions → New repository secret`
2. اضافه کن:
   - **Name:** `EXPO_TOKEN`
   - **Value:** توکنی که از Expo گرفتی

---

### مرحله ۴ — تنظیم آدرس ورکر
فایل `src/utils/api.js` را باز کن و این خط را پیدا کن:
```js
export const WORKER_URL = "https://YOUR_WORKER.workers.dev";
```
آدرس ورکر Cloudflare خود را بنویس.

---

### مرحله ۵ — ثبت پروژه در Expo
```bash
npm install -g eas-cli
npx expo login
npx eas init
```
بعد `app.json` را با `projectId` جدید آپدیت کن و push کن.

---

### مرحله ۶ — دریافت APK
1. بعد از push کردن، برو به تب **Actions** در GitHub
2. روی آخرین workflow کلیک کن
3. صبر کن تا سبز بشه (~۱۰-۱۵ دقیقه)
4. در قسمت **Artifacts** فایل `ExamApp-APK` را دانلود کن
5. روی گوشی اندروید نصب کن ✅

---

## 📁 ساختار پروژه
```
panelnader/
├── App.js                          ← نقطه شروع اپلیکیشن
├── app.json                        ← تنظیمات Expo
├── eas.json                        ← تنظیمات ساخت APK
├── package.json
├── worker.js                      ← Cloudflare Worker ⚠️
├── build-apk.yml                   ← GitHub Actions
└── src/
    ├── utils/api.js                ← آدرس ورکر اینجاست ⚠️
    ├── context/AuthContext.js
    └── screens/
        ├── StudentLoginScreen.js
        ├── StudentExamScreen.js
        ├── TeacherLoginScreen.js
        ├── TeacherDashboard.js
        └── teacher/
            ├── StudentsTab.js
            ├── QuestionsTab.js
            ├── SubmissionsTab.js
            ├── AiChatTab.js
            └── SettingsTab.js
```

---

## ⚙️ راهنمای نصب Cloudflare Worker

### مرحله ۱ — ساخت KV Namespace
1. برو به **[dash.cloudflare.com](https://dash.cloudflare.com)**
2. یه Worker بساز (یا از قبلی استفاده کن)
3. یه **KV Namespace** بساز:
   - Workers & Pages → KV → Create namespace
   - یه نام بذار (مثلاً `exam-kv`)
4. اسم namespace رو کپی کن

### مرحله ۲ — اتصال KV به Worker
1. در Worker settings:
   - KV Namespaces → Bind variable
   - Name: `EXAM_KV`
   - Namespace ID: اونی که کپی کردی

### مرحله ۳ — آپلود Worker
```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

### مرحله ۴ — تنظیم AI (اختیاری)
برای چت AI، متغیر `GROQ_API_KEY` رو در Worker secrets تنظیم کن:
```bash
wrangler secret put GROQ_API_KEY
```

---

## ⚠️ نکته مهم — CORS
در ورکر Cloudflare خود مطمئن شو این هدر وجود داره:
```js
headers: { "Access-Control-Allow-Origin": "*", ... }
```
