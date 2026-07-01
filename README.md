# 📚 پنل آموزشی جامع

[![GitHub stars](https://img.shields.io/github/stars/naderuser/panelnader?style=flat-square)](https://github.com/naderuser/panelnader/stargazers)
[![License](https://img.shields.io/badge/License-Free%20for%20Educational%20Use-blue?style=flat-square)](LICENSE)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Worker-orange?style=flat-square)](https://workers.cloudflare.com/)

یک پنل آموزشی کامل ساخته شده با **Cloudflare Worker** برای معلمان و دانش‌آموزان.

> 🎨 طراح: **نادر اکشیک**

---

## ✨ امکانات

### 👨‍🏫 پنل معلم
- 🔐 ورود و خروج با رمز عبور امن
- 🔄 تغییر رمز عبور
- 🎨 تم روشن/تاریک
- 📊 مدیریت دانش‌آموزان با لینک اختصاصی

### 📝 آزمون‌ساز
- انواع سوالات:
  - 📖 تشریحی
  - ❓ چهارگزینه‌ای
  - ✓ صحیح / غلط
  - ✏️ کوتاه‌پاسخ
- سربرگ کامل آزمون:
  - نام مدرسه
  - نام آموزگار
  - نام آزمون
  - مدت زمان آزمون (به دقیقه)
- ⏱️ تایمر معکوس برای دانش‌آموز
- 📷 ویرایشگر غنی سوالات:
  - علائم ریاضی
  - کسر و تقسیم چکشی
  - اشکال هندسی SVG
  - آپلود عکس

### 📋 تصحیح و بازخورد
- ✅ تصحیح دستی
- 🤖 تصحیح خودکار (چهارگزینه‌ای)
- 📄 پاسخنامه با وضعیت‌های مختلف

### 📅 برنامه هفتگی
- خروجی Word/PDF/چاپ
- ذخیره در Cloudflare KV

### 📊 جدول‌ساز حرفه‌ای
- خروجی اکسل RTL
- محاسبه میانگین

### 🖼️ ابزارهای تصویری
- 📱 اسکنر حرفه‌ای (مشابه CamScanner)
- 🎨 فیلترهای متنوع
- 📦 کاهش حجم عکس
- ✂️ برش عکس با نسبت‌های مختلف
- 📄 تبدیل PDF به عکس

### 🤖 هوش مصنوعی
- 💬 چت AI با Groq (حالت‌های مختلف)
- 🌐 ترجمه متن با MyMemory

---

## 🛠️ نصب و راه‌اندازی

### پیش‌نیازها
- حساب [Cloudflare](https://dash.cloudflare.com/)
- Node.js v16 یا بالاتر
- حساب Groq برای Chat AI

### مراحل نصب

1. **کلون کردن پروژه:**
```bash
git clone https://github.com/naderuser/panelnader.git
cd panelnader
```

2. **ساخت Worker در Cloudflare:**
   - به [Cloudflare Dashboard](https://dash.cloudflare.com/) بروید
   - یک Worker جدید بسازید
   - کد `worker.js` را کپی کنید

3. **تنظیم KV Namespace:**
   - یک KV Namespace با نام `EXAM_KV` بسازید
   - در Worker Settings آن را bind کنید

4. **تنظیم متغیرهای محیطی:**
   - `GROQ_API_KEY`: کلید API Groq

5. **راه‌اندازی محلی (اختیاری):**
```bash
npx wrangler dev
```

---

## 📁 ساختار پروژه

```
panelnader/
├── worker.js       # کد اصلی Worker
├── README.md       # مستندات
└── .gitignore      # فایل‌های نادیده گرفته شده
```

---

## 🔐 امنیت

- رمزهای عبور با SHA-256 هش می‌شوند
- ورودی‌ها sanitize می‌شوند
- کوکی‌ها HttpOnly و SameSite هستند

---

## 📄 لایسنس

این پروژه رایگان برای استفاده آموزشی است.

---

## 📬 ارتباط با ما

- 🔗 [GitHub Repository](https://github.com/naderuser/panelnader)

---

> 💡 **نکته:** برای استفاده از تمام امکانات، حتماً متغیرهای محیطی را تنظیم کنید.

---

🎨 **طراح: نادر اکشیک**