# 🏫 پنل آموزشی هوشمند - Cloudflare Worker

یک پنل آموزشی کامل و حرفه‌ای برای دوره ابتدایی طراحی شده برای اجرا روی **Cloudflare Workers** با **Cloudflare KV** به عنوان دیتابیس.

## ✨ قابلیت‌ها

### 👨‍🏫 پنل معلم
- **آزمون‌ساز حرفه‌ای**
  - ۷ نوع سوال: تشریحی، چهارگزینه‌ای، صحیح/غلط، کوتاه‌پاسخ، جورکردنی، جاخالی، مرتب‌سازی
  - ویرایشگر متنی با علائم ریاضی، کسر، تقسیم چکشی
  - اشکال هندسی با قابلیت Drag & Drop
  - افزودن عکس به سوالات
  - سربرگ آزمون: نام مدرسه، نام آزمون، نام آموزگار، تاریخ
- **تصحیح خودکار** - نمره‌دهی آنی سوالات چهارگزینه‌ای
- **خروجی Word و PDF** - دانلود برگه آزمون با فونت B Nazanin
- **جدول‌ساز** - ساخت جدول دلخواه با سطر و ستون قابل تنظیم
- **برنامه هفتگی** - جدول ۶×۵ (شنبه تا پنجشنبه + زنگ‌ها) با خروجی Word/PDF
- **مدیریت دانش‌آموزان** - ساخت لینک اختصاصی UUID برای هر دانش‌آموز
- **تصحیح و بازخورد** - نمره‌دهی و ارسال بازخورد به دانش‌آموزان

### 👨‍🎓 پنل دانش‌آموز
- مشاهده آزمون‌های اختصاص یافته با لینک اختصاصی
- پاسخ به ۷ نوع سوال (تشریحی، چهارگزینه‌ای، صحیح/غلط، کوتاه‌پاسخ، جورکردنی، جاخالی، مرتب‌سازی)
- مشاهده نتیجه تصحیح خودکار بلافاصله پس از ارسال
- نام آزمون و اطلاعات در بالای صفحه

### 🛠️ ابزارها
- **اسکنر حرفه‌ای** (مشابه CamScanner) - فیلترهای سیاه/سفید، خاکستری، سند، رنگی، وارونه، روشن، تاریک
- **برش و کراپ** - برش دستی با تنظیم نسبت تصویر
- **کاهش حجم** - فشرده‌سازی با تنظیم کیفیت ۱-۱۰۰
- **PDF به عکس** - تبدیل صفحات PDF به تصاویر با تنظیم DPI و فرمت
- **جدول‌ساز** - خروجی Word و Excel با پشتیبانی RTL
- **برنامه هفتگی** - خروجی Word و PDF

## 📦 نصب و راه‌اندازی

### ۱. پیش‌نیازها
- Node.js 18+
- حساب Cloudflare

### ۲. ساخت KV Namespace
```bash
# در داشبورد Cloudflare:
# Workers & Pages > KV > Create a namespace
# نام: EDUCATIONAL_DB
```

### ۳. تنظیم wrangler.toml
```toml
[[kv_namespaces]]
binding = "DB"
id = "YOUR_KV_NAMESPACE_ID"  # ← آیدی کپی شده از Cloudflare
```

### ۴. دیپلوی
```bash
npm install
wrangler login
wrangler deploy
```

### ۵. تنظیم متغیرهای محیطی (اختیاری)
در Cloudflare Dashboard > Workers > your-worker > Settings > Variables:
- `GROQ_API_KEY`: کلید API از [console.groq.com](https://console.groq.com)

## 🚀 استفاده

### پنل معلم
به آدرس `/teacher` بروید. در اولین ورود، رمز عبور تعیین کنید.

### پنل دانش‌آموز
با لینک اختصاصی که معلم ساخته وارد شوید.

## 📁 ساختار فایل‌ها
```
├── educational-panel.js    # کد اصلی Worker
├── wrangler.toml          # تنظیمات Cloudflare Workers
└── README.md              # مستندات
```

## 🔧 API Endpoints

### معلم
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/teacher/state | وضعیت احراز هویت |
| POST | /api/teacher/login | ورود/ثبت رمز اولیه |
| POST | /api/teacher/logout | خروج |
| GET | /api/teacher/students | لیست دانش‌آموزان |
| POST | /api/teacher/students | ثبت دانش‌آموز |
| DELETE | /api/teacher/students/:id | حذف دانش‌آموز |
| GET | /api/teacher/questions | سوالات |
| PUT | /api/teacher/questions | ذخیره سوالات |
| GET | /api/teacher/submissions | پاسخنامه‌ها |
| POST | /api/teacher/submissions/:id/feedback | ارسال بازخورد |
| GET | /api/teacher/word | خروجی Word |
| GET | /api/teacher/meta | دریافت اطلاعات مدرسه |
| PUT | /api/teacher/meta | ذخیره اطلاعات مدرسه |

### دانش‌آموز
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/exam/:id | دریافت آزمون |
| POST | /api/exam/:id/submit | ثبت پاسخ |

### صفحات
| Path | Description |
|------|-------------|
| `/` | صفحه اصلی |
| `/teacher` | پنل معلم |
| `/s/:id` | لینک اختصاصی دانش‌آموز |

## 📝 نکات مهم

- تمام داده‌ها در **Cloudflare KV** (namespace: `EXAM_KV`) ذخیره می‌شوند (رایگان تا 1GB)
- حداکثر حجم فایل آپلود: **5MB**
- فایل‌ها به صورت **Base64** ذخیره می‌شوند
- احراز هویت با **HttpOnly Cookies** و **SHA-256 Hash**
- فونت **B Nazanin** برای خروجی‌های Word و PDF
- **تصحیح خودکار** سوالات چهارگزینه‌ای به صورت آنی
- امنیت: پاک‌سازی HTML برای جلوگیری از XSS

## 🎨 طراحی

- رابط کاربری **ریسپانسیو** و **فارسی**
- فونت **Vazirmatn** و **BNazanin**
- رنگ‌بندی **آبی-بنفش** حرفه‌ای
- پشتیبانی از **RTL**

## 👨‍💻 طراح و توسعه
نادر اکشیک - Cloudflare Workers

## 📜 لایسنس
MIT License
