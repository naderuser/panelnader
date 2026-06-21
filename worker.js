/**
 * پنل ارزشیابی توصیفی - آزمون ساز
 * طراح: نادر اکشیک
 * 
 * یک Cloudflare Worker کامل شامل:
 *  - تولید گزارش توصیف عملکرد (پایه اول تا ششم)
 *  - هوش مصنوعی Groq (فقط متن)
 *  - پنل معلم با ورود امن
 * 
 * داده‌ها در Cloudflare KV (binding: EXAM_KV) ذخیره می‌شوند.
 */

const APP_TITLE = "آزمون ساز اکشیک";
const APP_DESIGNER = "طراح: نادر اکشیک";

/* ------------------------- داده‌های توصیف عملکرد ------------------------- */

// توصیف‌های عملکرد برای هر پایه و درس
const PERFORMANCE_DESCRIPTIONS = {
  // پایه اول
  1: {
    فارسی: {
      "خیلی خوب": "دانش‌آموز در درس فارسی پایه اول با علاقه و دقت فراوان participates in reading activities و مهارت‌های پایه‌ای خواندن و نوشتن را به خوبی فرا گرفته است.",
      "خوب": "دانش‌آموز در درس فارسی پایه اول پیشرفت قابل قبولی داشته و مهارت‌های اولیه خواندن و نوشتن را یاد گرفته است.",
      "قابل قبول": "دانش‌آموز در درس فارسی پایه اول در حال یادگیری مهارت‌های پایه‌ای خواندن و نوشتن می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس فارسی پایه اول نیاز به تمرین و توجه بیشتر برای یادگیری مهارت‌های پایه‌ای دارد."
    },
    ریاضی: {
      "خیلی خوب": "دانش‌آموز در درس ریاضی پایه اول با اشتیاق مفاهیم پایه‌ای اعداد، شمارش و عملیات ساده را به خوبی فرا گرفته است.",
      "خوب": "دانش‌آموز در درس ریاضی پایه اول مفاهیم پایه‌ای را یاد گرفته و توانایی انجام تمرینات ساده را دارد.",
      "قابل قبول": "دانش‌آموز در درس ریاضی پایه اول در حال آشنایی با مفاهیم پایه‌ای اعداد و شمارش می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس ریاضی پایه اول نیاز به تمرین بیشتر برای درک مفاهیم پایه‌ای دارد."
    },
    علوم: {
      "خیلی خوب": "دانش‌آموز در درس علوم پایه اول با کنجکاوی و علاقه مفاهیم پایه‌ای محیط زیست و زندگی را فرا گرفته است.",
      "خوب": "دانش‌آموز در درس علوم پایه اول مفاهیم پایه‌ای را به خوبی درک کرده است.",
      "قابل قبول": "دانش‌آموز در درس علوم پایه اول در حال یادگیری مفاهیم پایه‌ای می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس علوم پایه اول نیاز به توجه بیشتر به محتوای درسی دارد."
    },
    قرآن: {
      "خیلی خوب": "دانش‌آموز در درس قرآن پایه اول با دقت و تمرکز آیات و اذکار را فرا گرفته و قرائت صحیح را رعایت می‌کند.",
      "خوب": "دانش‌آموز در درس قرآن پایه اول آیات و اذکار پایه‌ای را به خوبی یاد گرفته است.",
      "قابل قبول": "دانش‌آموز در درس قرآن پایه اول در حال یادگیری قرائت صحیح می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس قرآن پایه اول نیاز به تمرین بیشتر در حفظ و قرائت دارد."
    },
    اجتماعی: {
      "خیلی خوب": "دانش‌آموز در درس اجتماعی پایه اول با علاقه مفاهیم مربوط به خانواده و محیط اطراف را فرا گرفته است.",
      "خوب": "دانش‌آموز در درس اجتماعی پایه اول اطلاعات پایه‌ای را یاد گرفته است.",
      "قابل قبول": "دانش‌آموز در درس اجتماعی پایه اول در حال آشنایی با مفاهیم اولیه می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس اجتماعی پایه اول نیاز به توجه بیشتر دارد."
    }
  },
  // پایه دوم
  2: {
    فارسی: {
      "خیلی خوب": "دانش‌آموز در درس فارسی پایه دوم مهارت‌های خواندن و نوشتن را با دقت و خلاقیت انجام می‌دهد و پیشرفت چشمگیری داشته است.",
      "خوب": "دانش‌آموز در درس فارسی پایه دوم مهارت‌های خواندن و نوشتن را به خوبی فرا گرفته و در تمرینات فعال است.",
      "قابل قبول": "دانش‌آموز در درس فارسی پایه دوم در حال پیشرفت در مهارت‌های پایه‌ای خواندن و نوشتن می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس فارسی پایه دوم نیاز به تمرین و تقویت مهارت‌های پایه‌ای دارد."
    },
    ریاضی: {
      "خیلی خوب": "دانش‌آموز در درس ریاضی پایه دوم با درک عمیق مفاهیم اعداد و عملیات، توانایی حل مسائل را به خوبی دارد.",
      "خوب": "دانش‌آموز در درس ریاضی پایه دوم مفاهیم ریاضی را به خوبی درک کرده و تمرینات را حل می‌کند.",
      "قابل قبول": "دانش‌آموز در درس ریاضی پایه دوم در حال یادگیری مفاهیم جدید ریاضی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس ریاضی پایه دوم نیاز به تمرین بیشتر برای درک مفاهیم دارد."
    },
    علوم: {
      "خیلی خوب": "دانش‌آموز در درس علوم پایه دوم با کنجکاوی علمی مفاهیم را فرا گرفته و به سوالات با دقت پاسخ می‌دهد.",
      "خوب": "دانش‌آموز در درس علوم پایه دوم مفاهیم علمی را به خوبی درک و یادگیری کرده است.",
      "قابل قبول": "دانش‌آموز در درس علوم پایه دوم در حال یادگیری مفاهیم پایه‌ای علمی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس علوم پایه دوم نیاز به توجه و مطالعه بیشتر دارد."
    },
    قرآن: {
      "خیلی خوب": "دانش‌آموز در درس قرآن پایه دوم با دقت و تمرکز بالا قرائت می‌کند و آیات را به خوبی حفظ کرده است.",
      "خوب": "دانش‌آموز در درس قرآن پایه دوم قرائت و حفظ آیات را به خوبی انجام می‌دهد.",
      "قابل قبول": "دانش‌آموز در درس قرآن پایه دوم در حال پیشرفت در قرائت و حفظ می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس قرآن پایه دوم نیاز به تمرین بیشتر در قرائت دارد."
    },
    اجتماعی: {
      "خیلی خوب": "دانش‌آموز در درس اجتماعی پایه دوم با علاقه مفاهیم مربوط به محیط زندگی و جامعه را فرا گرفته است.",
      "خوب": "دانش‌آموز در درس اجتماعی پایه دوم اطلاعات مربوطه را به خوبی یاد گرفته است.",
      "قابل قبول": "دانش‌آموز در درس اجتماعی پایه دوم در حال یادگیری مفاهیم اجتماعی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس اجتماعی پایه دوم نیاز به توجه بیشتر دارد."
    }
  },
  // پایه سوم
  3: {
    فارسی: {
      "خیلی خوب": "دانش‌آموز در درس فارسی پایه سوم مهارت‌های خواندن، نوشتن و درک مطلب را با کیفیت بالا انجام می‌دهد.",
      "خوب": "دانش‌آموز در درس فارسی پایه سوم مهارت‌های زبانی را به خوبی فرا گرفته و در فعالیت‌های کلاسی فعال است.",
      "قابل قبول": "دانش‌آموز در درس فارسی پایه سوم در حال پیشرفت در مهارت‌های زبانی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس فارسی پایه سوم نیاز به تقویت مهارت‌های زبانی دارد."
    },
    ریاضی: {
      "خیلی خوب": "دانش‌آموز در درس ریاضی پایه سوم با درک عمیق مفاهیم، توانایی حل مسائل پیچیده‌تر را دارد.",
      "خوب": "دانش‌آموز در درس ریاضی پایه سوم مفاهیم ریاضی را به خوبی درک کرده و مسائل را حل می‌کند.",
      "قابل قبول": "دانش‌آموز در درس ریاضی پایه سوم در حال یادگیری مفاهیم جدید می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس ریاضی پایه سوم نیاز به تمرین بیشتر دارد."
    },
    علوم: {
      "خیلی خوب": "دانش‌آموز در درس علوم پایه سوم با علاقه و تحقیق مفاهیم علمی را فرا گرفته و به خوبی تحلیل می‌کند.",
      "خوب": "دانش‌آموز در درس علوم پایه سوم مفاهیم علمی را به خوبی فرا گرفته است.",
      "قابل قبول": "دانش‌آموز در درس علوم پایه سوم در حال یادگیری مفاهیم علمی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس علوم پایه سوم نیاز به توجه بیشتر دارد."
    },
    قرآن: {
      "خیلی خوب": "دانش‌آموز در درس قرآن پایه سوم با دقت و زیبایی قرائت می‌کند و مفاهیم آیات را درک می‌کند.",
      "خوب": "دانش‌آموز در درس قرآن پایه سوم قرائت و حفظ را به خوبی انجام می‌دهد.",
      "قابل قبول": "دانش‌آموز در درس قرآن پایه سوم در حال پیشرفت می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس قرآن پایه سوم نیاز به تمرین بیشتر دارد."
    },
    اجتماعی: {
      "خیلی خوب": "دانش‌آموز در درس اجتماعی پایه سوم با علاقه مفاهیم تاریخی و جغرافیایی را فرا گرفته است.",
      "خوب": "دانش‌آموز در درس اجتماعی پایه سوم اطلاعات را به خوبی یاد گرفته و تحلیل می‌کند.",
      "قابل قبول": "دانش‌آموز در درس اجتماعی پایه سوم در حال یادگیری می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس اجتماعی پایه سوم نیاز به توجه بیشتر دارد."
    }
  },
  // پایه چهارم
  4: {
    فارسی: {
      "خیلی خوب": "دانش‌آموز در درس فارسی پایه چهارم مهارت‌های خواندن، نوشتن، درک مطلب و واژه‌آموزی را با کیفیت عالی انجام می‌دهد.",
      "خوب": "دانش‌آموز در درس فارسی پایه چهارم مهارت‌های زبانی را به خوبی فرا گرفته و از آنها استفاده می‌کند.",
      "قابل قبول": "دانش‌آموز در درس فارسی پایه چهارم در حال پیشرفت در مهارت‌های زبانی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس فارسی پایه چهارم نیاز به تقویت بیشتر مهارت‌ها دارد."
    },
    ریاضی: {
      "خیلی خوب": "دانش‌آموز در درس ریاضی پایه چهارم با درک عمیق مفاهیم، توانایی حل مسائل ریاضی را به خوبی دارد.",
      "خوب": "دانش‌آموز در درس ریاضی پایه چهارم مفاهیم ریاضی را به خوبی فرا گرفته و مسائل را حل می‌کند.",
      "قابل قبول": "دانش‌آموز در درس ریاضی پایه چهارم در حال یادگیری مفاهیم جدید می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس ریاضی پایه چهارم نیاز به تمرین بیشتر دارد."
    },
    علوم: {
      "خیلی خوب": "دانش‌آموز در درس علوم پایه چهارم با علاقه و تحقیق مفاهیم علمی را فرا گرفته و تحلیل‌های خوبی ارائه می‌دهد.",
      "خوب": "دانش‌آموز در درس علوم پایه چهارم مفاهیم علمی را به خوبی فرا گرفته و درک می‌کند.",
      "قابل قبول": "دانش‌آموز در درس علوم پایه چهارم در حال یادگیری مفاهیم می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس علوم پایه چهارم نیاز به توجه بیشتر دارد."
    },
    قرآن: {
      "خیلی خوب": "دانش‌آموز در درس قرآن پایه چهارم با دقت و زیبایی قرائت می‌کند و مفاهیم را به خوبی درک می‌کند.",
      "خوب": "دانش‌آموز در درس قرآن پایه چهارم قرائت و حفظ را به خوبی انجام می‌دهد.",
      "قابل قبول": "دانش‌آموز در درس قرآن پایه چهارم در حال پیشرفت می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس قرآن پایه چهارم نیاز به تمرین بیشتر دارد."
    },
    اجتماعی: {
      "خیلی خوب": "دانش‌آموز در درس اجتماعی پایه چهارم با علاقه مفاهیم تاریخی، جغرافیایی و مدنی را فرا گرفته است.",
      "خوب": "دانش‌آموز در درس اجتماعی پایه چهارم اطلاعات را به خوبی فرا گرفته و تحلیل می‌کند.",
      "قابل قبول": "دانش‌آموز در درس اجتماعی پایه چهارم در حال یادگیری می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس اجتماعی پایه چهارم نیاز به توجه بیشتر دارد."
    }
  },
  // پایه پنجم
  5: {
    فارسی: {
      "خیلی خوب": "دانش‌آموز در درس فارسی پایه پنجم مهارت‌های خواندن، نوشتن خلاقانه و درک عمیق متون را به طور عالی انجام می‌دهد.",
      "خوب": "دانش‌آموز در درس فارسی پایه پنجم مهارت‌های زبانی پیشرفته را به خوبی فرا گرفته و استفاده می‌کند.",
      "قابل قبول": "دانش‌آموز در درس فارسی پایه پنجم در حال پیشرفت در مهارت‌های زبانی پیشرفته می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس فارسی پایه پنجم نیاز به تقویت بیشتر مهارت‌ها دارد."
    },
    ریاضی: {
      "خیلی خوب": "دانش‌آموز در درس ریاضی پایه پنجم با درک عمیق مفاهیم، توانایی حل مسائل پیچیده را به خوبی دارد.",
      "خوب": "دانش‌آموز در درس ریاضی پایه پنجم مفاهیم پیشرفته ریاضی را به خوبی فرا گرفته و مسائل را حل می‌کند.",
      "قابل قبول": "دانش‌آموز در درس ریاضی پایه پنجم در حال یادگیری مفاهیم جدید می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس ریاضی پایه پنجم نیاز به تمرین بیشتر دارد."
    },
    علوم: {
      "خیلی خوب": "دانش‌آموز در درس علوم پایه پنجم با روحیه تحقیق و کاوش مفاهیم علمی را عمیقاً فرا گرفته است.",
      "خوب": "دانش‌آموز در درس علوم پایه پنجم مفاهیم علمی پیشرفته را به خوبی فرا گرفته و درک می‌کند.",
      "قابل قبول": "دانش‌آموز در درس علوم پایه پنجم در حال یادگیری مفاهیم علمی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس علوم پایه پنجم نیاز به توجه بیشتر دارد."
    },
    قرآن: {
      "خیلی خوب": "دانش‌آموز در درس قرآن پایه پنجم با دقت، زیبایی و درک مفهومی قرائت می‌کند.",
      "خوب": "دانش‌آموز در درس قرآن پایه پنجم قرائت و حفظ پیشرفته را به خوبی انجام می‌دهد.",
      "قابل قبول": "دانش‌آموز در درس قرآن پایه پنجم در حال پیشرفت می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس قرآن پایه پنجم نیاز به تمرین بیشتر دارد."
    },
    اجتماعی: {
      "خیلی خوب": "دانش‌آموز در درس اجتماعی پایه پنجم با علاقه مفاهیم تاریخی، جغرافیایی و مدنی را عمیقاً فرا گرفته است.",
      "خوب": "دانش‌آموز در درس اجتماعی پایه پنجم اطلاعات پیشرفته را به خوبی فرا گرفته و تحلیل می‌کند.",
      "قابل قبول": "دانش‌آموز در درس اجتماعی پایه پنجم در حال یادگیری می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس اجتماعی پایه پنجم نیاز به توجه بیشتر دارد."
    }
  },
  // پایه ششم
  6: {
    فارسی: {
      "خیلی خوب": "دانش‌آموز در درس فارسی پایه ششم مهارت‌های پیشرفته خواندن، نوشتن خلاقانه و تحلیل متون را به طور عالی انجام می‌دهد.",
      "خوب": "دانش‌آموز در درس فارسی پایه ششم مهارت‌های زبانی پیشرفته را به خوبی فرا گرفته و به کار می‌برد.",
      "قابل قبول": "دانش‌آموز در درس فارسی پایه ششم در حال تکمیل مهارت‌های زبانی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس فارسی پایه ششم نیاز به تقویت بیشتر مهارت‌ها دارد."
    },
    ریاضی: {
      "خیلی خوب": "دانش‌آموز در درس ریاضی پایه ششم با درک عمیق مفاهیم، توانایی حل مسائل پیچیده و تفکر منطقی را به خوبی دارد.",
      "خوب": "دانش‌آموز در درس ریاضی پایه ششم مفاهیم ریاضی پیشرفته را به خوبی فرا گرفته و مسائل را حل می‌کند.",
      "قابل قبول": "دانش‌آموز در درس ریاضی پایه ششم در حال یادگیری مفاهیم نهایی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس ریاضی پایه ششم نیاز به تمرین بیشتر دارد."
    },
    علوم: {
      "خیلی خوب": "دانش‌آموز در درس علوم پایه ششم با روحیه علمی و تحقیق، مفاهیم را عمیقاً فرا گرفته و تحلیل‌های دقیق ارائه می‌دهد.",
      "خوب": "دانش‌آموز در درس علوم پایه ششم مفاهیم علمی پیشرفته را به خوبی فرا گرفته و درک می‌کند.",
      "قابل قبول": "دانش‌آموز در درس علوم پایه ششم در حال تکمیل یادگیری مفاهیم علمی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس علوم پایه ششم نیاز به توجه بیشتر دارد."
    },
    قرآن: {
      "خیلی خوب": "دانش‌آموز در درس قرآن پایه ششم با دقت، زیبایی و درک عمیق مفهومی قرائت می‌کند.",
      "خوب": "دانش‌آموز در درس قرآن پایه ششم قرائت و حفظ پیشرفته را به خوبی انجام می‌دهد.",
      "قابل قبول": "دانش‌آموز در درس قرآن پایه ششم در حال تکمیل مهارت‌های قرآنی می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس قرآن پایه ششم نیاز به تمرین بیشتر دارد."
    },
    اجتماعی: {
      "خیلی خوب": "دانش‌آموز در درس اجتماعی پایه ششم با علاقه و درک عمیق مفاهیم تاریخی، جغرافیایی و مدنی را فرا گرفته است.",
      "خوب": "دانش‌آموز در درس اجتماعی پایه ششم اطلاعات پیشرفته را به خوبی فرا گرفته و تحلیل می‌کند.",
      "قابل قبول": "دانش‌آموز در درس اجتماعی پایه ششم در حال تکمیل یادگیری می‌باشد.",
      "نیاز به تلاش بیشتر": "دانش‌آموز در درس اجتماعی پایه ششم نیاز به توجه بیشتر دارد."
    }
  }
};

const LESSONS = ["فارسی", "ریاضی", "علوم", "قرآن", "اجتماعی"];
const FEEDBACKS = ["خیلی خوب", "خوب", "قابل قبول", "نیاز به تلاش بیشتر"];
const GRADES = [1, 2, 3, 4, 5, 6];
const TERMS = ["نوبت اول", "نوبت دوم"];

/* ------------------------- ابزارهای کمکی ------------------------- */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function uuid() {
  return crypto.randomUUID();
}

function parseCookies(req) {
  const out = {};
  const c = req.headers.get("cookie") || "";
  c.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getTeacherHash(env) {
  return await env.EXAM_KV.get("teacher_pass");
}

async function isTeacher(req, env) {
  const stored = await getTeacherHash(env);
  if (!stored) return false;
  const cookies = parseCookies(req);
  return Boolean(cookies.t_auth && cookies.t_auth === stored);
}

/* ------------------------- روتر اصلی ------------------------- */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (path.startsWith("/api/")) return await handleApi(req, env, url, path);
      if (path === "/teacher" || path === "/teacher/") return html(teacherPage());
      if (path === "/") return html(landingPage());
      return html(notFoundPage(), 404);
    } catch (err) {
      return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};

/* ------------------------- API ------------------------- */

async function handleApi(req, env, url, path) {
  const method = req.method;

  /* --- معلم: ورود/خروج --- */
  if (path === "/api/teacher/login" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const pass = String(body.password || "");
    const stored = await getTeacherHash(env);
    const cookieFor = (h) => `t_auth=${h}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
    if (!stored) {
      if (pass.length < 4) return json({ ok: false, error: "رمز باید حداقل ۴ کاراکتر باشد" }, 400);
      const hash = await sha256(pass);
      await env.EXAM_KV.put("teacher_pass", hash);
      return json({ ok: true, created: true }, 200, { "set-cookie": cookieFor(hash) });
    }
    const hash = await sha256(pass);
    if (hash === stored) return json({ ok: true }, 200, { "set-cookie": cookieFor(hash) });
    return json({ ok: false, error: "رمز عبور اشتباه است" }, 401);
  }

  if (path === "/api/teacher/logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": "t_auth=; Path=/; Max-Age=0" });
  }

  if (path === "/api/teacher/state" && method === "GET") {
    const stored = await getTeacherHash(env);
    return json({ ok: true, auth: await isTeacher(req, env), configured: Boolean(stored) });
  }

  /* --- ذخیره/خواندن API Key --- */
  if (path === "/api/ai/settings" && method === "GET") {
    if (!(await isTeacher(req, env))) return json({ error: "دسترسی غیرمجاز" }, 401);
    const apiKey = await env.EXAM_KV.get("groq_api_key");
    return json({ ok: true, apiKey: apiKey || "" });
  }

  if (path === "/api/ai/settings" && method === "POST") {
    if (!(await isTeacher(req, env))) return json({ error: "دسترسی غیرمجاز" }, 401);
    const body = await req.json().catch(() => ({}));
    const apiKey = String(body.apiKey || "").trim();
    if (apiKey) {
      await env.EXAM_KV.put("groq_api_key", apiKey);
    } else {
      await env.EXAM_KV.delete("groq_api_key");
    }
    return json({ ok: true });
  }

  /* --- هوش مصنوعی Groq --- */
  if (path === "/api/ai/chat" && method === "POST") {
    if (!(await isTeacher(req, env))) return json({ error: "دسترسی غیرمجاز" }, 401);
    const body = await req.json().catch(() => ({}));
    const messages = body.messages || [];
    const apiKey = await env.EXAM_KV.get("groq_api_key");
    if (!apiKey) return json({ error: "ابتدا API Key را در تنظیمات وارد کنید" }, 400);
    try {
      const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You are a helpful assistant for Iranian teachers. Always respond in Persian/Farsi language with RTL text." },
            ...messages.slice(-10)
          ],
          max_tokens: 1024
        })
      });
      if (!aiRes.ok) {
        const errText = await aiRes.text();
        return json({ error: "Groq: " + errText }, aiRes.status);
      }
      const aiData = await aiRes.json();
      return json({ ok: true, content: aiData.choices?.[0]?.message?.content || "" });
    } catch (e) {
      return json({ error: "Error: " + e.message }, 500);
    }
  }

  /* --- ذخیره/خواندن گزارش توصیف عملکرد --- */
  if (path === "/api/reports" && method === "GET") {
    if (!(await isTeacher(req, env))) return json({ error: "دسترسی غیرمجاز" }, 401);
    const raw = await env.EXAM_KV.get("reports");
    return json({ ok: true, reports: raw ? JSON.parse(raw) : [] });
  }

  if (path === "/api/reports" && method === "POST") {
    if (!(await isTeacher(req, env))) return json({ error: "دسترسی غیرمجاز" }, 401);
    const body = await req.json().catch(() => ({}));
    const reports = Array.isArray(body.reports) ? body.reports : [];
    await env.EXAM_KV.put("reports", JSON.stringify(reports));
    return json({ ok: true });
  }

  return json({ ok: false, error: "مسیر یافت نشد" }, 404);
}

/* ------------------------- استایل مشترک ------------------------- */

const SHARED_CSS = `
  :root{--bg:#f8fafc;--card:#ffffff;--primary:#1d4ed8;--primary-2:#2563eb;--accent:#0d9488;--muted:#64748b;--line:#e2e8f0;--danger:#dc2626;--success:#16a34a;}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Vazirmatn',Tahoma,system-ui,sans-serif;background:linear-gradient(180deg,#eef2ff,#f8fafc);color:#0f172a;direction:rtl;}
  .wrap{max-width:1000px;margin:0 auto;padding:18px;}
  .header{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;border-radius:18px;padding:22px;text-align:center;box-shadow:0 10px 30px rgba(37,99,235,.25);}
  .header h1{margin:4px 0;font-size:22px}
  .header h2{margin:4px 0;font-size:15px;font-weight:500;opacity:.95}
  .header h3{margin:4px 0;font-size:13px;font-weight:400;opacity:.9}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:16px;box-shadow:0 4px 16px rgba(15,23,42,.06)}
  label{display:block;font-size:14px;margin:10px 0 6px;font-weight:600}
  input,textarea,select{width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-family:inherit;font-size:15px;background:#fff}
  input:focus,textarea:focus,select:focus{outline:none;border-color:var(--primary-2);box-shadow:0 0 0 3px rgba(37,99,235,.15)}
  textarea{min-height:80px;resize:vertical}
  .btn{display:inline-block;background:var(--primary);color:#fff;border:none;padding:11px 18px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none}
  .btn:hover{background:var(--primary-2)}
  .btn.sec{background:#0d9488}.btn.sec:hover{background:#0f766e}
  .btn.gray{background:#475569}.btn.gray:hover{background:#334155}
  .btn.danger{background:var(--danger)}
  .btn.sm{padding:6px 12px;font-size:13px}
  .btn.success{background:var(--success)}
  .btn.success:hover{background:#15803d}
  .row{display:flex;gap:10px;flex-wrap:wrap}
  .row>*{flex:1;min-width:160px}
  .muted{color:var(--muted);font-size:13px}
  .tabs{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
  .tab{padding:9px 16px;border-radius:10px;background:#e2e8f0;cursor:pointer;font-weight:600;font-size:14px}
  .tab.active{background:var(--primary);color:#fff}
  .hidden{display:none}
  .toast{position:fixed;bottom:18px;right:18px;background:#0f172a;color:#fff;padding:12px 18px;border-radius:10px;opacity:0;transition:.3s;z-index:50}
  .toast.show{opacity:1}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{border:1px solid var(--line);padding:10px;text-align:right;font-size:14px;vertical-align:top}
  th{background:#f1f5f9;text-align:center}
  tr:hover td{background:#f8fafc}
  .select-grade{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
  .grade-btn{padding:10px 20px;border:2px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;font-size:14px;font-weight:600;transition:all .2s}
  .grade-btn:hover{border-color:var(--primary-2);background:#f0f4ff}
  .grade-btn.active{background:var(--primary);color:#fff;border-color:var(--primary)}
  .feedback-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:16px}
  .feedback-card{border:1px solid var(--line);border-radius:12px;padding:16px;background:#fafbfc}
  .feedback-card h4{font-size:15px;margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid var(--line)}
  .feedback-item{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px dashed var(--line)}
  .feedback-item:last-child{border-bottom:none}
  .feedback-label{font-weight:600;font-size:13px;min-width:120px;color:#374151}
  .feedback-text{font-size:13px;color:#6b7288;line-height:1.6;flex:1}
  .copy-btn{background:#e0e7ff;color:#3730a3;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap}
  .copy-btn:hover{background:#c7d2fe}
  .term-tabs{display:flex;gap:8px;margin-bottom:16px}
  .term-tab{padding:8px 16px;border:2px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;font-weight:600}
  .term-tab:hover{border-color:var(--primary-2)}
  .term-tab.active{background:var(--accent);color:#fff;border-color:var(--accent)}
  
  /* ---- چت AI ---- */
  .chat-container{max-height:400px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;padding:16px;background:#fafbfc;margin-bottom:12px}
  .chat-message{margin-bottom:12px;padding:10px 14px;border-radius:12px;max-width:85%}
  .chat-message.user{background:#e0e7ff;color:#1e1b4b;margin-right:auto}
  .chat-message.ai{background:#fff;border:1px solid var(--line);margin-left:auto}
  .chat-message .sender{font-size:11px;font-weight:600;margin-bottom:4px;opacity:.7}
  .chat-input-wrap{display:flex;gap:10px}
  .chat-input-wrap textarea{flex:1;min-height:60px}
  .typing-indicator{display:inline-flex;gap:4px}
  .typing-indicator span{width:8px;height:8px;background:#64748b;border-radius:50%;animation:typing 1.4s infinite}
  .typing-indicator span:nth-child(2){animation-delay:.2s}
  .typing-indicator span:nth-child(3){animation-delay:.4s}
  @keyframes typing{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
`;

const FONT_LINK = `<link rel="preconnect" href="https://cdn.jsdelivr.net"><link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">`;

function pageHeader() {
  return `<div class="header"><h1>${esc(APP_TITLE)}</h1><h2>${esc(APP_DESIGNER)}</h2></div>`;
}

/* ------------------------- صفحه اصلی ------------------------- */

function landingPage() {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(APP_TITLE)}</title>
  ${FONT_LINK}<style>${SHARED_CSS}</style></head><body><div class="wrap">
  ${pageHeader()}
  <div class="card">
    <h2 style="margin-top:0">به پنل ارزشیابی توصیفی خوش آمدید</h2>
    <p>این پنل شامل امکانات زیر است:</p>
    <ul>
      <li>تولید گزارش توصیف عملکرد برای پایه‌های اول تا ششم</li>
      <li>هوش مصنوعی Groq برای کمک به نوشتن توصیف‌ها</li>
      <li>نوبت اول و نوبت دوم</li>
    </ul>
    <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
    <a class="btn" href="/teacher">ورود معلم</a>
  </div></div></body></html>`;
}

function notFoundPage() {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
  ${FONT_LINK}<style>${SHARED_CSS}</style></head><body><div class="wrap">
  ${pageHeader()}<div class="card"><h2>صفحه یافت نشد</h2><a class="btn" href="/">بازگشت</a></div></div></body></html>`;
}

/* ------------------------- پنل معلم ------------------------- */

function teacherPage() {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(APP_TITLE)}</title>${FONT_LINK}<style>${SHARED_CSS}</style></head>
  <body><div class="wrap">
    ${pageHeader()}

    <!-- ورود -->
    <div class="card" id="login">
      <h3 id="login-head">ورود معلم</h3>
      <p class="muted" id="login-hint"></p>
      <label>رمز عبور</label><input id="pass" type="password" autocomplete="current-password">
      <p class="muted" id="login-err" style="color:var(--danger)"></p>
      <button class="btn" id="btn-login">ورود</button>
    </div>

    <!-- داشبورد -->
    <div id="dash" class="hidden">
      <div class="tabs">
        <div class="tab active" data-tab="performance">📊 تولید عملکرد</div>
        <div class="tab" data-tab="ai">🤖 هوش مصنوعی</div>
        <div class="tab" data-tab="settings">⚙️ تنظیمات</div>
      </div>

      <!-- تولید عملکرد -->
      <div id="tab-performance" class="card">
        <h3 style="margin-top:0">تولید گزارش توصیف عملکرد</h3>
        
        <div class="row">
          <div>
            <label>نام و نام خانوادگی دانش‌آموز</label>
            <input id="student-name" placeholder="نام دانش‌آموز">
          </div>
          <div>
            <label>نام کلاس</label>
            <input id="class-name" placeholder="مثال: ششم ۱">
          </div>
        </div>

        <label>نوبت تحصیلی</label>
        <div class="term-tabs">
          <button class="term-tab active" data-term="نوبت اول">نوبت اول</button>
          <button class="term-tab" data-term="نوبت دوم">نوبت دوم</button>
        </div>

        <label>پایه تحصیلی</label>
        <div class="select-grade" id="grade-buttons">
          <button class="grade-btn active" data-grade="1">پایه اول</button>
          <button class="grade-btn" data-grade="2">پایه دوم</button>
          <button class="grade-btn" data-grade="3">پایه سوم</button>
          <button class="grade-btn" data-grade="4">پایه چهارم</button>
          <button class="grade-btn" data-grade="5">پایه پنجم</button>
          <button class="grade-btn" data-grade="6">پایه ششم</button>
        </div>

        <div id="feedback-section">
          <h4 id="feedback-title">توصیف عملکرد - پایه اول</h4>
          <div class="feedback-grid" id="feedback-grid"></div>
        </div>

        <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn success" id="btn-save-report">💾 ذخیره گزارش</button>
          <button class="btn sec" id="btn-new-report">🆕 گزارش جدید</button>
          <button class="btn" id="btn-copy-all">📋 کپی همه توصیف‌ها</button>
        </div>
      </div>

      <!-- هوش مصنوعی -->
      <div id="tab-ai" class="card hidden">
        <h3 style="margin-top:0">🤖 هوش مصنوعی (Groq)</h3>
        <p class="muted">در این بخش می‌توانید با هوش مصنوعی چت کنید. فقط قابلیت متنی.</p>
        
        <div class="chat-container" id="chat-container">
          <div class="chat-message ai">
            <div class="sender">هوش مصنوعی</div>
            <div>سلام! چطور می‌توانم کمکتان کنم؟ می‌توانید در مورد نوشتن توصیف عملکرد، سوالات آموزشی یا هر موضوع دیگری بپرسید.</div>
          </div>
        </div>

        <div class="chat-input-wrap">
          <textarea id="chat-input" placeholder="پیام خود را بنویسید..."></textarea>
          <button class="btn" id="btn-send">ارسال</button>
        </div>
        <p class="muted" style="margin-top:8px;font-size:12px">💡 برای دریافت کمک در نوشتن توصیف عملکرد، موضوع را مشخص کنید.</p>
      </div>

      <!-- تنظیمات -->
      <div id="tab-settings" class="card hidden">
        <h3 style="margin-top:0">⚙️ تنظیمات</h3>
        
        <div class="card" style="background:#f8fafc">
          <h4 style="margin-top:0">🤖 تنظیمات هوش مصنوعی Groq</h4>
          <label>API Key</label>
          <input id="api-key" type="password" placeholder="sk-..." autocomplete="off">
          <p class="muted">API Key را از سایت <a href="https://console.groq.com" target="_blank">console.groq.com</a> دریافت کنید.</p>
          <button class="btn" id="btn-save-key">💾 ذخیره API Key</button>
        </div>

        <div class="card" style="background:#fef2f2;margin-top:16px">
          <h4 style="margin-top:0;color:var(--danger)">خروج از سیستم</h4>
          <button class="btn danger" id="btn-logout">🚪 خروج از پنل معلم</button>
        </div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const LESSONS = ${JSON.stringify(LESSONS)};
    const FEEDBACKS = ${JSON.stringify(FEEDBACKS)};
    const GRADES = ${JSON.stringify(GRADES)};
    const TERMS = ${JSON.stringify(TERMS)};
    const DESCRIPTIONS = ${JSON.stringify(PERFORMANCE_DESCRIPTIONS)};

    let currentGrade = 1;
    let currentTerm = "نوبت اول";
    let chatHistory = [];
    let isTyping = false;

    function toast(m) {
      const t = document.getElementById('toast');
      t.textContent = m;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s == null ? '' : s;
      return d.innerHTML;
    }

    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        toast('کپی شد ✅');
      }).catch(() => {
        toast('خطا در کپی');
      });
    }

    // احراز هویت
    async function checkAuth() {
      const r = await fetch('/api/teacher/state');
      const d = await r.json();
      if (d.auth) {
        document.getElementById('login').classList.add('hidden');
        document.getElementById('dash').classList.remove('hidden');
        loadApiKey();
        renderFeedbacks();
      } else {
        document.getElementById('login-hint').textContent = d.configured ? '' : 'اولین ورود: رمز جدید تنظیم شود';
      }
    }

    document.getElementById('btn-login').onclick = async () => {
      const pass = document.getElementById('pass').value;
      const r = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });
      const d = await r.json();
      if (d.ok) {
        document.getElementById('login').classList.add('hidden');
        document.getElementById('dash').classList.remove('hidden');
        loadApiKey();
        renderFeedbacks();
      } else {
        document.getElementById('login-err').textContent = d.error;
      }
    };

    document.getElementById('btn-logout').onclick = async () => {
      await fetch('/api/teacher/logout', { method: 'POST' });
      location.reload();
    };

    // تب‌ها
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('[id^="tab-"]').forEach(p => p.classList.add('hidden'));
        document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
      };
    });

    // پایه‌ها
    document.querySelectorAll('.grade-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentGrade = parseInt(btn.dataset.grade);
        renderFeedbacks();
      };
    });

    // نوبت تحصیلی
    document.querySelectorAll('.term-tab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.term-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTerm = btn.dataset.term;
        renderFeedbacks();
      };
    });

    // رندر توصیف‌های عملکرد
    function renderFeedbacks() {
      const studentName = document.getElementById('student-name').value.trim();
      const className = document.getElementById('class-name').value.trim();
      const gradeName = 'پایه ' + toPersianNum(currentGrade);
      
      document.getElementById('feedback-title').textContent = 
        'توصیف عملکرد ' + currentTerm + ' - ' + gradeName +
        (studentName ? ' - ' + studentName : '');

      const grid = document.getElementById('feedback-grid');
      const descriptions = DESCRIPTIONS[currentGrade] || {};
      const lessons = Object.keys(descriptions);

      if (lessons.length === 0) {
        grid.innerHTML = '<p class="muted">داده‌ای موجود نیست</p>';
        return;
      }

      grid.innerHTML = lessons.map(lesson => {
        const feedbacks = descriptions[lesson] || {};
        return \`
          <div class="feedback-card">
            <h4>📚 ${esc(lesson)}</h4>
            \${FEEDBACKS.map(fb => \`
              <div class="feedback-item">
                <span class="feedback-label">${esc(fb)}:</span>
                <span class="feedback-text" id="desc-\${lesson}-\${fb}">\${esc(feedbacks[fb] || '—')}</span>
                <button class="copy-btn" onclick="copyToClipboard(document.getElementById('desc-\${lesson}-\${fb}').textContent)">کپی</button>
              </div>
            \`).join('')}
          </div>
        \`;
      }).join('');
    }

    // به‌روزرسانی با تایپ
    document.getElementById('student-name').oninput = renderFeedbacks;
    document.getElementById('class-name').oninput = renderFeedbacks;

    // کپی همه
    document.getElementById('btn-copy-all').onclick = () => {
      const studentName = document.getElementById('student-name').value.trim();
      const className = document.getElementById('class-name').value.trim();
      const gradeName = 'پایه ' + toPersianNum(currentGrade);
      
      let text = gradeName + ' - ' + currentTerm;
      if (studentName) text += ' - ' + studentName;
      if (className) text += ' (کلاس: ' + className + ')';
      text += '\\n\\n';

      const descriptions = DESCRIPTIONS[currentGrade] || {};
      for (const lesson of Object.keys(descriptions)) {
        text += '📚 ' + lesson + ':\\n';
        for (const fb of FEEDBACKS) {
          text += '• ' + fb + ': ' + (descriptions[lesson][fb] || '—') + '\\n';
        }
        text += '\\n';
      }

      copyToClipboard(text);
    };

    // ذخیره گزارش
    document.getElementById('btn-save-report').onclick = async () => {
      const studentName = document.getElementById('student-name').value.trim();
      if (!studentName) {
        toast('لطفاً نام دانش‌آموز را وارد کنید');
        return;
      }

      const report = {
        studentName,
        className: document.getElementById('class-name').value.trim(),
        grade: currentGrade,
        term: currentTerm,
        descriptions: DESCRIPTIONS[currentGrade],
        createdAt: Date.now()
      };

      const r = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reports: [report] })
      });
      const d = await r.json();
      if (d.ok) toast('گزارش ذخیره شد ✅');
      else toast('خطا در ذخیره');
    };

    // گزارش جدید
    document.getElementById('btn-new-report').onclick = () => {
      document.getElementById('student-name').value = '';
      document.getElementById('class-name').value = '';
      renderFeedbacks();
    };

    // API Key
    async function loadApiKey() {
      const r = await fetch('/api/ai/settings');
      const d = await r.json();
      if (d.ok && d.apiKey) {
        document.getElementById('api-key').value = d.apiKey;
      }
    }

    document.getElementById('btn-save-key').onclick = async () => {
      const apiKey = document.getElementById('api-key').value.trim();
      const r = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });
      const d = await r.json();
      if (d.ok) toast('API Key ذخیره شد ✅');
      else toast('خطا در ذخیره');
    };

    // چت AI
    function addChatMessage(role, content) {
      const container = document.getElementById('chat-container');
      const div = document.createElement('div');
      div.className = 'chat-message ' + role;
      div.innerHTML = \`
        <div class="sender">\${role === 'user' ? 'شما' : 'هوش مصنوعی'}</div>
        <div>\${esc(content)}</div>
      \`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    function showTyping() {
      const container = document.getElementById('chat-container');
      const div = document.createElement('div');
      div.className = 'chat-message ai';
      div.id = 'typing-msg';
      div.innerHTML = \`
        <div class="sender">هوش مصنوعی</div>
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      \`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    function hideTyping() {
      const typing = document.getElementById('typing-msg');
      if (typing) typing.remove();
    }

    async function sendMessage() {
      if (isTyping) return;
      const input = document.getElementById('chat-input');
      const msg = input.value.trim();
      if (!msg) return;

      addChatMessage('user', msg);
      chatHistory.push({ role: 'user', content: msg });
      input.value = '';
      isTyping = true;
      showTyping();

      try {
        const r = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: chatHistory })
        });
        const d = await r.json();
        hideTyping();
        isTyping = false;

        if (d.error) {
          addChatMessage('ai', 'خطا: ' + d.error);
        } else {
          addChatMessage('ai', d.content);
          chatHistory.push({ role: 'assistant', content: d.content });
        }
      } catch (e) {
        hideTyping();
        isTyping = false;
        addChatMessage('ai', 'خطا در اتصال');
      }
    }

    document.getElementById('btn-send').onclick = sendMessage;
    document.getElementById('chat-input').onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };

    // تبدیل اعداد به فارسی
    function toPersianNum(num) {
      const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
      return String(num).replace(/[0-9]/g, d => persianDigits[d]);
    }

    checkAuth();
  </script>
  </body></html>`;
}
