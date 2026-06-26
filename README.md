# 📱 پنل آموزشی جامع — نسخه اندروید
**طراح: نادر اکشیک**

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
ExamApp2/
├── App.js                          ← نقطه شروع
├── app.json                        ← تنظیمات Expo
├── eas.json                        ← تنظیمات ساخت APK
├── package.json
├── .github/
│   └── workflows/
│       └── build-apk.yml          ← GitHub Actions
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

## ⚠️ نکته مهم — CORS
در ورکر Cloudflare خود مطمئن شو این هدر وجود داره:
```js
headers: { "Access-Control-Allow-Origin": "*", ... }
```
