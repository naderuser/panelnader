/**
 * پنل آزمون ساز دوره ابتدایی
 * طراح: نادر اکشیک
 *
 * یک Cloudflare Worker کامل شامل:
 *  - صفحه آزمون دانش‌آموز (سربرگ، فرم اطلاعات، سوال امنیتی، نمایش نتیجه پس از تصحیح)
 *  - پنل معلم (ساخت دانش‌آموز با UUID اختصاصی، طراحی سوال، تصحیح و بازخورد، مشاهده پاسخنامه‌ها)
 *  - سوال تشریحی با امکان درج عکس، اشکال هندسی و علائم ریاضی
 *  - دانلود خروجی Word با سربرگ و جدول‌کشی
 *
 * داده‌ها در Cloudflare KV (binding: EXAM_KV) ذخیره می‌شوند.
 */

const APP_TITLE = "پنل آزمون ساز دوره ابتدایی";
const APP_DESIGNER = "طراح: نادر اکشیک";

const DEFAULT_META = {
  school: "",
};

const QUESTION_TYPES = {
  descriptive: "تشریحی",
  multiple: "چهارگزینه‌ای",
  truefalse: "صحیح / غلط",
  short: "کوتاه‌پاسخ",
};

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

// پاک‌سازی سبک محتوای HTML سوال تشریحی (محتوای معلم) برای جلوگیری از اسکریپت مخرب
function sanitizeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/<\s*\/?\s*(script|iframe|object|embed|link|meta|style)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
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

async function getMeta(env) {
  const raw = await env.EXAM_KV.get("meta");
  return raw ? { ...DEFAULT_META, ...JSON.parse(raw) } : { ...DEFAULT_META };
}

async function getQuestions(env) {
  try {
    const raw = await env.EXAM_KV.get("questions");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Error loading questions:", e);
    return [];
  }
}

async function listStudents(env) {
  const out = [];
  let cursor;
  do {
    const res = await env.EXAM_KV.list({ prefix: "student:", cursor });
    for (const k of res.keys) {
      const v = await env.EXAM_KV.get(k.name);
      if (v) out.push(JSON.parse(v));
    }
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return out;
}

/* ------------------------- روتر اصلی ------------------------- */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (path.startsWith("/api/")) return await handleApi(req, env, url, path);

      if (path.startsWith("/s/")) {
        const id = decodeURIComponent(path.slice(3));
        return await studentPage(env, id);
      }

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
      // اولین ورود: رمز عبور توسط معلم تعریف می‌شود (رمز پیش‌فرض وجود ندارد)
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

  /* --- آزمون دانش‌آموز (عمومی) --- */
  if (path.startsWith("/api/exam/")) {
    const rest = path.slice("/api/exam/".length);
    const parts = rest.split("/");
    const id = decodeURIComponent(parts[0] || "");
    const studentRaw = await env.EXAM_KV.get("student:" + id);
    if (!studentRaw) return json({ ok: false, error: "لینک نامعتبر است" }, 404);

    if (parts[1] === "submit" && method === "POST") {
      const existing = await env.EXAM_KV.get("submission:" + id);
      if (existing) return json({ ok: false, error: "این آزمون قبلاً ثبت شده است" }, 409);
      const body = await req.json().catch(() => ({}));
      const meta = await getMeta(env);
      const questions = await getQuestions(env);
      const submission = {
        uuid: id,
        student: {
          name: String(body.name || "").slice(0, 120),
          fatherName: String(body.fatherName || "").slice(0, 120),
          nationalId: String(body.nationalId || "").slice(0, 30),
          courseName: String(body.courseName || "").slice(0, 120),
          examDate: String(body.examDate || "").slice(0, 40),
        },
        answers: body.answers || {},
        meta,
        questionsSnapshot: questions,
        submittedAt: Date.now(),
        grading: null,
      };
      await env.EXAM_KV.put("submission:" + id, JSON.stringify(submission));
      return json({ ok: true });
    }

    if (method === "GET") {
      const meta = await getMeta(env);
      const subRaw = await env.EXAM_KV.get("submission:" + id);
      const st = JSON.parse(studentRaw);
      if (subRaw) {
        const sub = JSON.parse(subRaw);
        const resultQuestions = (sub.questionsSnapshot || [])
          .filter(Boolean)
          .map(safeQuestion)
          .filter(q => q !== null);
        return json({
          ok: true,
          meta,
          submitted: true,
          result: {
            questions: resultQuestions,
            answers: sub.answers || {},
            student: sub.student || {},
            grading: sub.grading || null,
          },
        });
      }
      const questions = (await getQuestions(env))
        .filter(Boolean)
        .map(safeQuestion)
        .filter(q => q !== null);
      return json({ ok: true, meta, submitted: false, questions, label: st.label || "" });
    }
  }

  /* --- از این به بعد فقط معلم --- */
  if (path.startsWith("/api/teacher/")) {
    if (!(await isTeacher(req, env))) return json({ ok: false, error: "دسترسی غیرمجاز" }, 401);

    // تغییر رمز عبور معلم
    if (path === "/api/teacher/password" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const np = String(body.newPassword || "");
      if (np.length < 4) return json({ ok: false, error: "رمز جدید باید حداقل ۴ کاراکتر باشد" }, 400);
      const hash = await sha256(np);
      await env.EXAM_KV.put("teacher_pass", hash);
      return json({ ok: true }, 200, { "set-cookie": `t_auth=${hash}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400` });
    }

    // دانش‌آموزان
    if (path === "/api/teacher/students" && method === "GET") {
      const students = await listStudents(env);
      const withStatus = [];
      for (const s of students) {
        const subRaw = await env.EXAM_KV.get("submission:" + s.uuid);
        let status = "pending";
        if (subRaw) {
          const sub = JSON.parse(subRaw);
          status = sub.grading && sub.grading.graded ? "graded" : "submitted";
        }
        withStatus.push({ ...s, status });
      }
      return json({ ok: true, students: withStatus });
    }

    if (path === "/api/teacher/students" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = uuid();
      const rec = { uuid: id, label: String(body.label || "").slice(0, 120), createdAt: Date.now() };
      await env.EXAM_KV.put("student:" + id, JSON.stringify(rec));
      return json({ ok: true, student: rec });
    }

    if (path.startsWith("/api/teacher/students/") && method === "DELETE") {
      const id = decodeURIComponent(path.slice("/api/teacher/students/".length));
      await env.EXAM_KV.delete("student:" + id);
      await env.EXAM_KV.delete("submission:" + id);
      return json({ ok: true });
    }

    // سوالات و سربرگ
    if (path === "/api/teacher/questions" && method === "GET") {
      return json({ ok: true, meta: await getMeta(env), questions: await getQuestions(env) });
    }

    if (path === "/api/teacher/questions" && method === "PUT") {
      const body = await req.json().catch(() => ({}));
      const questions = (Array.isArray(body.questions) ? body.questions : []).map((q, i) => {
        const type = QUESTION_TYPES[q.type] ? q.type : "descriptive";
        const rich = type === "descriptive" && Boolean(q.rich);
        return {
          id: q.id || uuid(),
          type,
          rich,
          text: rich ? sanitizeHtml(String(q.text || "")) : String(q.text || ""),
          options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : [],
          correct: q.correct == null ? "" : q.correct,
          image: typeof q.image === "string" ? q.image : "",
          order: i,
        };
      });
      await env.EXAM_KV.put("questions", JSON.stringify(questions));
      if (body.meta) {
        const meta = { ...DEFAULT_META, ...body.meta };
        await env.EXAM_KV.put("meta", JSON.stringify(meta));
      }
      return json({ ok: true });
    }

    // پاسخنامه‌ها
    if (path === "/api/teacher/submissions" && method === "GET") {
      const students = await listStudents(env);
      const out = [];
      for (const s of students) {
        const raw = await env.EXAM_KV.get("submission:" + s.uuid);
        if (raw) {
          const sub = JSON.parse(raw);
          sub.label = s.label || "";
          out.push(sub);
        }
      }
      out.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
      return json({ ok: true, submissions: out });
    }

    // ثبت تصحیح/بازخورد
    if (path === "/api/teacher/grade" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = body.uuid;
      const raw = await env.EXAM_KV.get("submission:" + id);
      if (!raw) return json({ ok: false, error: "پاسخنامه یافت نشد" }, 404);
      const sub = JSON.parse(raw);
      sub.grading = {
        graded: true,
        overall: String(body.overall || ""),
        feedback: body.feedback && typeof body.feedback === "object" ? body.feedback : {},
        marks: body.marks && typeof body.marks === "object" ? body.marks : {},
        gradedAt: Date.now(),
      };
      await env.EXAM_KV.put("submission:" + id, JSON.stringify(sub));
      return json({ ok: true });
    }

    // دانلود Word
    if (path === "/api/teacher/word" && method === "GET") {
      const type = url.searchParams.get("type") || "questions";
      const meta = await getMeta(env);
      if (type === "answers") {
        const id = url.searchParams.get("uuid");
        const raw = await env.EXAM_KV.get("submission:" + id);
        if (!raw) return json({ ok: false, error: "پاسخنامه یافت نشد" }, 404);
        const sub = JSON.parse(raw);
        return wordResponse(answerSheetWord(sub), `پاسخنامه-${sub.student.name || id}.doc`);
      }
      const questions = await getQuestions(env);
      return wordResponse(examWord(meta, questions), "برگه-آزمون.doc");
    }
  }

  return json({ ok: false, error: "مسیر یافت نشد" }, 404);
}

function safeQuestion(q) {
  // پاسخ صحیح را به دانش‌آموز ارسال نمی‌کنیم
  if (!q || typeof q !== 'object') return null;
  return {
    id: q.id || String(Math.random()),
    type: q.type || 'descriptive',
    rich: Boolean(q.rich),
    text: q.text || '',
    options: Array.isArray(q.options) ? q.options : [],
    image: typeof q.image === 'string' ? q.image : ''
  };
}

/* ------------------------- خروجی Word ------------------------- */

function wordResponse(bodyHtml, filename) {
  const doc =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8">` +
    `<style>
      @page { size: A4; margin: 2cm; }
      body { font-family: 'B Nazanin','Tahoma',sans-serif; direction: rtl; font-size: 13pt; }
      .hdr { text-align:center; border-bottom: 2px solid #000; padding-bottom:8px; margin-bottom:14px; }
      .hdr h1 { font-size: 15pt; margin: 2px 0; }
      .hdr h2 { font-size: 12pt; margin: 2px 0; font-weight: normal; }
      .hdr h3 { font-size: 12pt; margin: 2px 0; font-weight: normal; }
      .meta-table { width:100%; border-collapse: collapse; margin-bottom: 14px; }
      .meta-table td { border: 1px solid #000; padding: 6px 8px; }
      table.q { width:100%; border-collapse: collapse; margin-bottom: 10px; }
      table.q td, table.q th { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
      .qnum { width: 36px; text-align:center; font-weight:bold; }
      .opt { padding: 2px 18px; }
      .ans { min-height: 40px; }
      img { max-width: 320px; }
      .frac{display:inline-block;text-align:center;vertical-align:middle;margin:0 3px}
      .frac .fn{display:block;border-bottom:1.5px solid #000;padding:0 4px}
      .frac .fd{display:block;padding:0 4px}
      .shape{display:inline-block;vertical-align:middle;line-height:1;margin:0 2px}
      .ldiv{display:inline-block;border-collapse:collapse;margin:6px 2px;vertical-align:top}
      .ldiv td{padding:2px 8px;vertical-align:top}
      .ldiv .divisor{border-right:1.5px solid #000}
      .ldiv .quotient{border-top:1.5px solid #000;border-right:1.5px solid #000}
    </style></head><body dir="rtl">` +
    bodyHtml +
    `</body></html>`;
  return new Response(doc, {
    headers: {
      "content-type": "application/msword; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

function wordHeader(meta, extra = "") {
  // سربرگ برگه‌ی آزمون فقط نام مدرسه‌ی خود معلم را نشان می‌دهد
  return (
    `<div class="hdr">` +
    `<h1>${esc(meta.school || "")}</h1>` +
    `</div>` +
    extra
  );
}

function questionBodyWord(q) {
  let inner = `<div><b>${q.rich ? q.text : esc(q.text)}</b></div>`;
  if (q.image) inner += `<div><img src="${esc(q.image)}"></div>`;
  if (q.type === "multiple") {
    (q.options || []).forEach((o, oi) => {
      inner += `<div class="opt">${["الف", "ب", "ج", "د"][oi] || oi + 1}) ${esc(o)}</div>`;
    });
  } else if (q.type === "truefalse") {
    inner += `<div class="opt">صحیح ☐&nbsp;&nbsp;&nbsp; غلط ☐</div>`;
  } else if (q.type === "short") {
    inner += `<div class="ans">پاسخ: ...........................................................</div>`;
  } else {
    inner += `<div class="ans">پاسخ:<br><br><br></div>`;
  }
  return inner;
}

function examWord(meta, questions) {
  let body = wordHeader(meta);
  body +=
    `<table class="meta-table">` +
    `<tr><td>نام و نام خانوادگی: ...................</td><td>نام پدر: ...................</td><td>کد ملی: ...................</td></tr>` +
    `<tr><td>نام درس: ...................</td><td>تاریخ آزمون: ...................</td><td>کلاس: ...................</td></tr>` +
    `</table>`;

  questions.forEach((q, i) => {
    body +=
      `<table class="q"><tr>` +
      `<td class="qnum">${i + 1}</td>` +
      `<td>${questionBodyWord(q)}</td>` +
      `</tr></table>`;
  });
  return body;
}

function answerLabel(q, ans) {
  if (q.type === "multiple") {
    const idx = Number(ans);
    if (!isNaN(idx) && q.options && q.options[idx] != null) {
      return `${["الف", "ب", "ج", "د"][idx] || idx + 1}) ${esc(q.options[idx])}`;
    }
    return esc(ans);
  }
  if (q.type === "truefalse") {
    if (ans === "true" || ans === true) return "صحیح";
    if (ans === "false" || ans === false) return "غلط";
    return esc(ans);
  }
  return esc(ans);
}

const MARK_LABEL = { correct: "صحیح", wrong: "غلط", partial: "نیمه‌درست" };

function answerSheetWord(sub) {
  const meta = sub.meta || DEFAULT_META;
  const questions = sub.questionsSnapshot || [];
  const g = sub.grading || {};
  const st = sub.student || {};
  let body = wordHeader(meta);
  body +=
    `<table class="meta-table">` +
    `<tr><td>نام و نام خانوادگی: ${esc(st.name)}</td><td>نام پدر: ${esc(st.fatherName)}</td><td>کد ملی: ${esc(st.nationalId)}</td></tr>` +
    `<tr><td>نام درس: ${esc(st.courseName)}</td><td>تاریخ آزمون: ${esc(st.examDate)}</td><td>تاریخ ثبت: ${esc(new Date(sub.submittedAt).toLocaleString("fa-IR"))}</td></tr>` +
    `</table>`;

  body += `<table class="q"><tr><th class="qnum">ردیف</th><th>سوال</th><th>پاسخ دانش‌آموز</th><th>وضعیت</th><th>بازخورد معلم</th></tr>`;
  questions.forEach((q, i) => {
    const ans = sub.answers ? sub.answers[q.id] : "";
    const mark = g.marks ? g.marks[q.id] : "";
    const fb = g.feedback ? g.feedback[q.id] : "";
    let qcell = q.rich ? q.text : esc(q.text);
    if (q.image) qcell += `<div><img src="${esc(q.image)}"></div>`;
    body +=
      `<tr><td class="qnum">${i + 1}</td>` +
      `<td>${qcell} <small>(${esc(QUESTION_TYPES[q.type] || q.type)})</small></td>` +
      `<td>${ans == null || ans === "" ? "<i>بدون پاسخ</i>" : answerLabel(q, ans)}</td>` +
      `<td>${esc(MARK_LABEL[mark] || "")}</td>` +
      `<td>${esc(fb || "")}</td></tr>`;
  });
  body += `</table>`;
  if (g.overall) body += `<p><b>نتیجه/بازخورد کلی:</b> ${esc(g.overall)}</p>`;
  return body;
}

/* ------------------------- استایل مشترک صفحات ------------------------- */

const SHARED_CSS = `
  :root{--bg:#0f172a;--card:#ffffff;--primary:#1d4ed8;--primary-2:#2563eb;--accent:#0d9488;--muted:#64748b;--line:#e2e8f0;--danger:#dc2626;}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Vazirmatn',Tahoma,system-ui,sans-serif;background:linear-gradient(180deg,#eef2ff,#f8fafc);color:#0f172a;direction:rtl;}
  .wrap{max-width:920px;margin:0 auto;padding:18px;}
  .header{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;border-radius:18px;padding:22px;text-align:center;box-shadow:0 10px 30px rgba(37,99,235,.25);}
  .header h1{margin:4px 0;font-size:22px}
  .header h2{margin:4px 0;font-size:15px;font-weight:500;opacity:.95}
  .header h3{margin:4px 0;font-size:13px;font-weight:400;opacity:.9}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:16px;box-shadow:0 4px 16px rgba(15,23,42,.06)}
  label{display:block;font-size:14px;margin:10px 0 6px;font-weight:600}
  input,textarea,select{width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-family:inherit;font-size:15px;background:#fff}
  input:focus,textarea:focus,select:focus{outline:none;border-color:var(--primary-2);box-shadow:0 0 0 3px rgba(37,99,235,.15)}
  textarea{min-height:90px;resize:vertical}
  .btn{display:inline-block;background:var(--primary);color:#fff;border:none;padding:11px 18px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none}
  .btn:hover{background:var(--primary-2)}
  .btn.sec{background:#0d9488}.btn.sec:hover{background:#0f766e}
  .btn.gray{background:#475569}.btn.gray:hover{background:#334155}
  .btn.danger{background:var(--danger)}
  .btn.sm{padding:6px 12px;font-size:13px}
  .row{display:flex;gap:10px;flex-wrap:wrap}
  .row>*{flex:1;min-width:160px}
  .muted{color:var(--muted);font-size:13px}
  .q-block{border:1px solid var(--line);border-radius:12px;padding:14px;margin-top:12px;background:#fbfdff}
  .q-block .qhead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
  .badge{background:#e0e7ff;color:#3730a3;border-radius:999px;padding:2px 10px;font-size:12px}
  .opt-row{display:flex;gap:8px;align-items:center;margin-top:6px}
  .opt-row input[type=text]{flex:1}
  .toolbar{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
  .toolbar button{background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:4px 9px;cursor:pointer;font-size:15px;min-width:32px}
  .toolbar button:hover{background:#c7d2fe}
  .toolbar .grp-label{font-size:12px;color:var(--muted);align-self:center;margin-left:6px}
  .imgprev{max-width:220px;max-height:160px;border:1px solid var(--line);border-radius:8px;margin-top:6px;display:block}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{border:1px solid var(--line);padding:8px;text-align:right;font-size:14px;vertical-align:top}
  th{background:#f1f5f9}
  .tabs{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
  .tab{padding:9px 16px;border-radius:10px;background:#e2e8f0;cursor:pointer;font-weight:600;font-size:14px}
  .tab.active{background:var(--primary);color:#fff}
  .hidden{display:none}
  .toast{position:fixed;bottom:18px;right:18px;background:#0f172a;color:#fff;padding:12px 18px;border-radius:10px;opacity:0;transition:.3s;z-index:50}
  .toast.show{opacity:1}
  .link-box{font-family:monospace;direction:ltr;text-align:left;background:#f1f5f9;border-radius:8px;padding:8px;font-size:12px;word-break:break-all}
  .pill{font-size:12px;padding:2px 8px;border-radius:999px}
  .pill.ok{background:#dcfce7;color:#166534}.pill.no{background:#fee2e2;color:#991b1b}.pill.gr{background:#dbeafe;color:#1e40af}
  .mark.correct{color:#166534;font-weight:700}.mark.wrong{color:#991b1b;font-weight:700}.mark.partial{color:#92400e;font-weight:700}
  a{color:var(--primary)}
  .rich{min-height:90px;border:1px solid #cbd5e1;border-radius:10px;padding:11px 12px;background:#fff;font-size:15px;line-height:1.9}
  .rich:focus{outline:none;border-color:var(--primary-2);box-shadow:0 0 0 3px rgba(37,99,235,.15)}
  .frac{display:inline-flex;flex-direction:column;text-align:center;vertical-align:middle;margin:0 3px;line-height:1.05}
  .frac .fn{display:block;border-bottom:2px solid currentColor;padding:0 5px}
  .frac .fd{display:block;padding:0 5px}
  .shape{display:inline-block;vertical-align:middle;line-height:1;margin:0 2px}
  .shape svg{display:block}
  .ldiv{display:inline-block;border-collapse:collapse;margin:6px 2px;vertical-align:top}
  .ldiv td{border:none;padding:2px 8px;font-size:15px;vertical-align:top}
  .ldiv .divisor{border-right:2px solid currentColor}
  .ldiv .quotient{border-top:2px solid currentColor;border-right:2px solid currentColor}
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
    <p>دانش‌آموز گرامی، برای شرکت در آزمون از <b>لینک اختصاصی</b> که معلم برای شما ارسال کرده استفاده کنید.</p>
    <p class="muted">هر دانش‌آموز یک لینک منحصربه‌فرد دارد.</p>
    <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
    <a class="btn" href="/teacher">ورود معلم</a>
  </div></div></body></html>`;
}

function notFoundPage() {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
  ${FONT_LINK}<style>${SHARED_CSS}</style></head><body><div class="wrap">
  ${pageHeader()}<div class="card"><h2>صفحه یافت نشد</h2><a class="btn" href="/">بازگشت</a></div></div></body></html>`;
}

/* ------------------------- صفحه دانش‌آموز ------------------------- */

async function studentPage(env, id) {
  const student = await env.EXAM_KV.get("student:" + id);
  if (!student) {
    return html(
      `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">${FONT_LINK}<style>${SHARED_CSS}</style></head>
      <body><div class="wrap">${pageHeader()}<div class="card"><h2>لینک نامعتبر است</h2>
      <p class="muted">این لینک معتبر نیست یا حذف شده است. لطفاً با معلم خود تماس بگیرید.</p></div></div></body></html>`,
      404
    );
  }

  return html(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>آزمون</title>${FONT_LINK}<style>${SHARED_CSS}</style></head>
  <body><div class="wrap">
    ${pageHeader()}
    <div class="card" id="hdr2"></div>

    <!-- مرحله ۱: اطلاعات و سوال امنیتی -->
    <div class="card hidden" id="step-info">
      <h3>اطلاعات دانش‌آموز</h3>
      <div class="row">
        <div><label>نام و نام خانوادگی *</label><input id="f-name" autocomplete="off"></div>
        <div><label>نام پدر *</label><input id="f-father" autocomplete="off"></div>
      </div>
      <div class="row">
        <div><label>کد ملی *</label><input id="f-nid" inputmode="numeric" autocomplete="off"></div>
        <div><label>نام درس *</label><input id="f-course" autocomplete="off"></div>
        <div><label>تاریخ آزمون *</label><input id="f-date" autocomplete="off"></div>
      </div>
      <label>سوال امنیتی: <span id="sec-q"></span> *</label><input id="f-sec" inputmode="numeric" autocomplete="off">
      <p class="muted" id="info-err" style="color:var(--danger)"></p>
      <button class="btn" id="btn-enter">ورود به آزمون</button>
    </div>

    <!-- مرحله ۲: سوالات -->
    <div class="card hidden" id="step-exam">
      <h3>سوالات آزمون</h3>
      <div id="questions"></div>
      <button class="btn sec" id="btn-submit" style="margin-top:16px">ثبت نهایی پاسخنامه</button>
    </div>

    <!-- مرحله ۳: نتیجه -->
    <div class="card hidden" id="step-done"></div>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    const ID = ${JSON.stringify(id)};
    let DATA = null;
    const a = Math.floor(Math.random()*8)+2, b = Math.floor(Math.random()*8)+2;

    function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}
    function esc(s){const d=document.createElement('div');d.textContent=s==null?'':s;return d.innerHTML;}
    function typeLabel(t){return {descriptive:'تشریحی',multiple:'چهارگزینه‌ای',truefalse:'صحیح/غلط',short:'کوتاه‌پاسخ'}[t]||t;}
    function qHtml(q){return q.rich?(q.text||''):esc(q.text);}
    function ansText(q,ans){
      if(q.type==='multiple'){const idx=parseInt(ans,10);return isNaN(idx)?'':(['الف','ب','ج','د'][idx]+') '+esc((q.options&&q.options[idx])||''));}
      if(q.type==='truefalse'){return ans==='true'?'صحیح':(ans==='false'?'غلط':'');}
      return esc(ans);
    }

    async function load(){
      try {
        document.getElementById('hdr2').innerHTML='<div style="padding:20px;text-align:center"><p>⏳ در حال بارگذاری...</p></div>';
        const r = await fetch('/api/exam/'+encodeURIComponent(ID));
        
        if(!r.ok){
          document.body.innerHTML='<div class="wrap"><div class="card"><h2>❌ خطا در بارگذاری</h2><p>کد خطا: '+r.status+'</p></div></div>';
          return;
        }
        
        let d;
        try {
          d = await r.json();
        } catch(e) {
          document.body.innerHTML='<div class="wrap"><div class="card"><h2>❌ خطا در پاسخ سرور</h2><p>داده‌های نامعتبر دریافت شد.</p></div></div>';
          return;
        }
        
        if(!d.ok){
          document.body.innerHTML='<div class="wrap"><div class="card"><h2>❌ '+esc(d.error||'خطا')+'</h2></div></div>';
          return;
        }
        
        // بررسی وجود سوالات
        if(!d.submitted && (!d.questions || !Array.isArray(d.questions))){
          document.body.innerHTML='<div class="wrap"><div class="card"><h2>❌ خطا در بارگذاری سوالات</h2><p>سوالات آزمون یافت نشد. با معلم تماس بگیرید.</p></div></div>';
          return;
        }
        
        DATA = d;
        document.getElementById('hdr2').innerHTML='<h3 style="margin:0">'+esc(d.meta.school||'')+'</h3>';
        if(d.submitted){ renderResult(d.result); }
        else { document.getElementById('step-info').classList.remove('hidden'); }
      } catch(err) {
        console.error('load error:', err);
        document.body.innerHTML='<div class="wrap"><div class="card"><h2>❌ خطا در اتصال</h2><p>لطفاً اتصال اینترنت را بررسی کنید.</p><p style="font-size:12px;color:#666">'+esc(err.message||'')+'</p></div></div>';
      }
    }

    function renderResult(res){
      const done=document.getElementById('step-done');
      done.classList.remove('hidden');
      if(!res.grading || !res.grading.graded){
        done.innerHTML='<h2>پاسخنامه شما ثبت شد ✅</h2><p class="muted">پاسخ‌های شما برای معلم ارسال شد. نتیجه پس از تصحیح معلم همین‌جا نمایش داده می‌شود.</p>';
        return;
      }
      const g=res.grading;
      let rows=res.questions.map((q,i)=>{
        const ans=res.answers[q.id];
        const mark=g.marks[q.id]||'';
        const fb=g.feedback[q.id]||'';
        const mlabel={correct:'صحیح',wrong:'غلط',partial:'نیمه‌درست'}[mark]||'';
        return '<tr><td>'+(i+1)+'</td><td>'+qHtml(q)+(q.image?'<br><img src="'+q.image+'" class="imgprev">':'')+'</td>'+
          '<td>'+(ansText(q,ans)||'<i>بدون پاسخ</i>')+'</td>'+
          '<td><span class="mark '+mark+'">'+mlabel+'</span></td>'+
          '<td>'+esc(fb)+'</td></tr>';
      }).join('');
      done.innerHTML='<h2>نتیجه آزمون</h2>'+
        '<p class="muted">نام: '+esc(res.student.name)+' | نام درس: '+esc(res.student.courseName||'')+' | تاریخ: '+esc(res.student.examDate||'')+'</p>'+
        '<table><tr><th>#</th><th>سوال</th><th>پاسخ شما</th><th>وضعیت</th><th>بازخورد معلم</th></tr>'+rows+'</table>'+
        (g.overall?'<p style="margin-top:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px"><b>بازخورد کلی معلم:</b> '+esc(g.overall)+'</p>':'');
    }

    function renderQuestions(){
      document.getElementById('sec-q'); // noop
      const box=document.getElementById('questions');
      // اعتبارسنجی DATA.questions
      if(!DATA || !DATA.questions || !Array.isArray(DATA.questions)){
        box.innerHTML='<p style="color:var(--danger)">⚠️ خطا در بارگذاری سوالات. با معلم تماس بگیرید.</p>';
        return;
      }
      if(!DATA.questions.length){
        box.innerHTML='<p class="muted">هنوز سوالی توسط معلم طراحی نشده است.</p>';
        return;
      }
      box.innerHTML = DATA.questions.map((q,i)=>{
        let body='';
        if(q.type==='multiple'){
          body=(q.options||[]).map((o,oi)=>'<div class="opt-row"><label style="font-weight:400;margin:0"><input type="radio" name="q_'+q.id+'" value="'+oi+'" style="width:auto;margin-left:6px"> '+['الف','ب','ج','د'][oi]+') '+esc(o)+'</label></div>').join('');
        }else if(q.type==='truefalse'){
          body='<div class="opt-row"><label style="font-weight:400;margin:0"><input type="radio" name="q_'+q.id+'" value="true" style="width:auto;margin-left:6px"> صحیح</label>&nbsp;&nbsp;<label style="font-weight:400;margin:0"><input type="radio" name="q_'+q.id+'" value="false" style="width:auto;margin-left:6px"> غلط</label></div>';
        }else if(q.type==='short'){
          body='<input type="text" data-q="'+q.id+'" autocomplete="off">';
        }else{
          body='<textarea data-q="'+q.id+'"></textarea>';
        }
        const img=q.image?'<img src="'+q.image+'" class="imgprev">':'';
        return '<div class="q-block"><div class="qhead"><b>'+(i+1)+'. '+qHtml(q)+'</b><span class="badge">'+typeLabel(q.type)+'</span></div>'+img+body+'</div>';
      }).join('');
    }

    document.getElementById('btn-enter').onclick=()=>{
      const name=document.getElementById('f-name').value.trim();
      const father=document.getElementById('f-father').value.trim();
      const nid=document.getElementById('f-nid').value.trim();
      const course=document.getElementById('f-course').value.trim();
      const date=document.getElementById('f-date').value.trim();
      const sec=document.getElementById('f-sec').value.trim();
      const err=document.getElementById('info-err');
      if(!name||!father||!nid||!course||!date){err.textContent='لطفاً همه فیلدها را پر کنید.';return;}
      if(parseInt(sec,10)!==a+b){err.textContent='پاسخ سوال امنیتی اشتباه است.';return;}
      err.textContent='';
      window._student={name,fatherName:father,nationalId:nid,courseName:course,examDate:date};
      document.getElementById('step-info').classList.add('hidden');
      document.getElementById('step-exam').classList.remove('hidden');
      renderQuestions();
    };

    document.getElementById('btn-submit').onclick=async()=>{
      const answers={};
      DATA.questions.forEach(q=>{
        if(q.type==='multiple'||q.type==='truefalse'){
          const sel=document.querySelector('input[name="q_'+q.id+'"]:checked');
          answers[q.id]=sel?sel.value:'';
        }else{
          const el=document.querySelector('[data-q="'+q.id+'"]');
          answers[q.id]=el?el.value:'';
        }
      });
      const btn=document.getElementById('btn-submit');btn.disabled=true;btn.textContent='در حال ثبت...';
      const r=await fetch('/api/exam/'+encodeURIComponent(ID)+'/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...window._student,answers})});
      const d=await r.json();
      if(d.ok){
        document.getElementById('step-exam').classList.add('hidden');
        renderResult({grading:null});
      }else{toast(d.error||'خطا در ثبت');btn.disabled=false;btn.textContent='ثبت نهایی پاسخنامه';}
    };

    // مقداردهی اولیه سوال امنیتی و تاریخ
    document.getElementById('sec-q').textContent = a + ' + ' + b + ' = ؟';
    try{ document.getElementById('f-date').value = new Date().toLocaleDateString('fa-IR'); }catch(e){}
    load();
  </script></body></html>`);
}

/* ------------------------- پنل معلم ------------------------- */

function teacherPage() {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(APP_TITLE)}</title>${FONT_LINK}<style>${SHARED_CSS}</style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script></head>
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
        <div class="tab active" data-tab="students">دانش‌آموزان و لینک‌ها</div>
        <div class="tab" data-tab="questions">طراحی سوالات</div>
        <div class="tab" data-tab="answers">تصحیح و پاسخنامه‌ها</div>
        <div class="tab" data-tab="tables">جدول / اکسل</div>
        <div class="tab" data-tab="scan">اسکنر</div>
        <div class="tab" data-tab="settings">تنظیمات</div>
        <div style="flex:1"></div>
        <div class="tab" id="btn-logout" style="background:#fee2e2;color:#991b1b">خروج</div>
      </div>

      <!-- دانش‌آموزان -->
      <div class="card tab-content" id="tab-students">
        <h3>ساخت دانش‌آموز جدید</h3>
        <div class="row">
          <input id="new-label" placeholder="نام دانش‌آموز (اختیاری)">
          <button class="btn" id="btn-add-student" style="flex:0 0 auto">+ ساخت لینک اختصاصی</button>
        </div>
        <p class="muted">برای هر دانش‌آموز یک UUID و لینک جداگانه ساخته می‌شود.</p>
        <div id="students-list"></div>
      </div>

      <!-- سوالات -->
      <div class="card tab-content hidden" id="tab-questions">
        <h3>سربرگ آزمون</h3>
        <label>نام مدرسه</label><input id="m-school">
        <p class="muted">نام مدرسه را خودتان وارد کنید؛ همین نام در بالای برگه‌ی آزمون (خروجی Word) نمایش داده می‌شود.<br>
        دانش‌آموز هنگام آزمون این موارد را پر می‌کند: نام و نام خانوادگی، نام پدر، کد ملی، نام درس، تاریخ آزمون.</p>
        <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
        <h3>سوالات</h3>
        <div id="q-list"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn gray sm" data-add="descriptive" style="flex:0 0 auto">+ تشریحی</button>
          <button class="btn gray sm" data-add="multiple" style="flex:0 0 auto">+ چهارگزینه‌ای</button>
          <button class="btn gray sm" data-add="truefalse" style="flex:0 0 auto">+ صحیح/غلط</button>
          <button class="btn gray sm" data-add="short" style="flex:0 0 auto">+ کوتاه‌پاسخ</button>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" id="btn-save-q">ذخیره سوالات</button>
          <a class="btn sec" id="btn-word-exam" href="/api/teacher/word?type=questions">دانلود برگه آزمون (Word)</a>
        </div>
      </div>

      <!-- پاسخنامه‌ها / تصحیح -->
      <div class="card tab-content hidden" id="tab-answers">
        <h3>تصحیح و پاسخنامه‌ها</h3>
        <button class="btn gray sm" id="btn-refresh-ans">به‌روزرسانی</button>
        <div id="answers-list"></div>
      </div>

      <!-- جدول / اکسل -->
      <div class="card tab-content hidden" id="tab-tables">
        <h3>جدول‌ساز و خروجی اکسل</h3>
        <p class="muted">هر جدول را با تعداد سطر و ستون دلخواه بسازید، موضوع بالای هر جدول را بنویسید و خانه‌ها را پر کنید، سپس خروجی اکسل بگیرید.</p>
        <div class="row" style="margin-top:8px">
          <button class="btn" id="btn-add-table" style="flex:0 0 auto">+ افزودن جدول</button>
          <button class="btn sec" id="btn-dl-excel" style="flex:0 0 auto">دانلود اکسل (xls)</button>
        </div>
        <div id="tables-list"></div>
      </div>

      <!-- اسکنر عکس -->
      <div class="card tab-content hidden" id="tab-scan">
        <h3>اسکنر عکس (تبدیل به سند اسکن‌شده)</h3>
        <label>انتخاب عکس</label>
        <input type="file" accept="image/*" id="scan-file">
        <div id="scan-controls" class="hidden">
          <div class="row" style="margin-top:10px">
            <div><label>روشنایی</label><input type="range" id="scan-bright" min="-80" max="80" value="10"></div>
            <div><label>کنتراست</label><input type="range" id="scan-contrast" min="0" max="160" value="60"></div>
          </div>
          <label style="font-weight:400"><input type="checkbox" id="scan-bw" style="width:auto;margin-left:6px"> سیاه و سفید (آستانه‌ای)</label>
          <div style="overflow:auto;border:1px solid var(--line);border-radius:10px;margin-top:10px;padding:8px;background:#f8fafc;text-align:center">
            <canvas id="scan-canvas" style="max-width:100%"></canvas>
          </div>
          <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn" id="btn-dl-img">دانلود عکس (PNG)</button>
            <button class="btn sec" id="btn-dl-pdf">دانلود PDF</button>
          </div>
        </div>
      </div>

      <!-- تنظیمات -->
      <div class="card tab-content hidden" id="tab-settings">
        <h3>تغییر رمز عبور</h3>
        <label>رمز عبور جدید</label><input id="new-pass" type="password" autocomplete="new-password">
        <p class="muted" id="pass-msg"></p>
        <button class="btn" id="btn-change-pass">ذخیره رمز جدید</button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  <script>${teacherScript()}</script>
  </body></html>`;
}

function teacherScript() {
  return `
  const TYPES={descriptive:'تشریحی',multiple:'چهارگزینه‌ای',truefalse:'صحیح/غلط',short:'کوتاه‌پاسخ'};
  const MATH=['+','\u2212','\u00d7','\u00f7','=','\u2260','\u00b1','<','>','\u2264','\u2265','\u221a','\u221b','%','\u03c0','\u00b0','\u00bd','\u00bc','\u00be','\u2153','\u2154','\u215b','\u00b2','\u00b3','( )','[ ]','\u2211','\u220f','\u221e','\u2220','\u22a5','\u2225','\u2234','\u2235','\u2248','\u221d','\u222b','\u2192','\u2190'];
  const SHAPES=['\u25b3','\u25bd','\u25c1','\u25b7','\u25c0','\u25b6','\u25b2','\u25bc','\u25a1','\u25ad','\u25ac','\u25b1','\u25b0','\u25c7','\u25c6','\u2b20','\u2b1f','\u2b21','\u2b22','\u25cb','\u25ef','\u25cf','\u2b24','\u2b2d','\u2605','\u2606','\u23e2','\u22bf','\u25e2','\u25e3','\u25e4','\u25e5','\u2194','\u2191','\u2193','\u2220','\u22a5','\u2225','\u2312','\u2299','\u2014'];
  const SVG_SHAPES=[
    {name:'مکعب', svg:'<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><rect x="20" y="35" width="45" height="45"/><path d="M20 35 L40 15 L85 15 L65 35"/><path d="M65 35 L65 80 L85 60 L85 15"/></svg>'},
    {name:'استوانه', svg:'<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><ellipse cx="50" cy="22" rx="30" ry="12"/><path d="M20 22 L20 78"/><path d="M80 22 L80 78"/><path d="M20 78 A30 12 0 0 0 80 78"/></svg>'},
    {name:'مخروط', svg:'<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><path d="M50 12 L20 78"/><path d="M50 12 L80 78"/><ellipse cx="50" cy="78" rx="30" ry="11"/></svg>'},
    {name:'کره', svg:'<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><circle cx="50" cy="50" r="36"/><ellipse cx="50" cy="50" rx="36" ry="13"/></svg>'},
    {name:'هرم', svg:'<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><path d="M50 12 L18 75 L70 86 Z"/><path d="M50 12 L70 86 L86 64 Z"/><path d="M18 75 L70 86"/></svg>'},
    {name:'مستطیل‌مکعب', svg:'<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><rect x="14" y="40" width="60" height="38"/><path d="M14 40 L30 22 L90 22 L74 40"/><path d="M74 40 L74 78 L90 60 L90 22"/></svg>'},
    {name:'زاویه', svg:'<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 80 L85 80"/><path d="M20 80 L78 30"/><path d="M44 80 A24 24 0 0 0 38 64"/></svg>'},
    {name:'پاره‌خط', svg:'<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><path d="M14 50 L86 50"/><circle cx="14" cy="50" r="4" fill="currentColor"/><circle cx="86" cy="50" r="4" fill="currentColor"/></svg>'}
  ];
  let QUESTIONS=[], META={}, SUBS=[];
  function esc(s){const d=document.createElement('div');d.textContent=s==null?'':s;return d.innerHTML;}
  function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}
  function uid(){return 'q-'+Math.random().toString(36).slice(2,10);}
  async function api(path,opts){const r=await fetch(path,opts);return r.json();}

  // ---- ورود ----
  async function checkAuth(){
    const d=await api('/api/teacher/state');
    if(d.auth){showDash();return;}
    if(!d.configured){
      document.getElementById('login-head').textContent='تعریف رمز عبور (اولین ورود)';
      document.getElementById('login-hint').textContent='این اولین ورود است؛ یک رمز دلخواه (حداقل ۴ کاراکتر) وارد کنید تا به‌عنوان رمز معلم ثبت شود.';
      document.getElementById('btn-login').textContent='ثبت رمز و ورود';
    }
  }
  document.getElementById('btn-login').onclick=async()=>{
    const p=document.getElementById('pass').value;
    const d=await api('/api/teacher/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:p})});
    if(d.ok){if(d.created)toast('رمز عبور شما ثبت شد');showDash();}else document.getElementById('login-err').textContent=d.error||'خطا';
  };
  document.getElementById('pass').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('btn-login').click();});
  document.getElementById('btn-logout').onclick=async()=>{await api('/api/teacher/logout',{method:'POST'});location.reload();};
  function showDash(){
    document.getElementById('login').classList.add('hidden');
    document.getElementById('dash').classList.remove('hidden');
    loadStudents();loadQuestions();
  }

  // ---- تب‌ها ----
  document.querySelectorAll('.tab[data-tab]').forEach(t=>t.onclick=()=>{
    document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.add('hidden'));
    document.getElementById('tab-'+t.dataset.tab).classList.remove('hidden');
    if(t.dataset.tab==='answers')loadAnswers();
    if(t.dataset.tab==='tables')renderTables();
  });

  // ---- دانش‌آموزان ----
  async function loadStudents(){
    const d=await api('/api/teacher/students');
    const box=document.getElementById('students-list');
    if(!d.students.length){box.innerHTML='<p class="muted">هنوز دانش‌آموزی ساخته نشده است.</p>';return;}
    box.innerHTML='<table><tr><th>#</th><th>نام</th><th>لینک اختصاصی</th><th>وضعیت</th><th></th></tr>'+
      d.students.map((s,i)=>{
        const link=location.origin+'/s/'+s.uuid;
        let st='<span class="pill no">در انتظار</span>';
        if(s.status==='submitted')st='<span class="pill gr">ثبت‌شده (تصحیح‌نشده)</span>';
        if(s.status==='graded')st='<span class="pill ok">تصحیح‌شده</span>';
        return '<tr><td>'+(i+1)+'</td><td>'+esc(s.label||'-')+'</td>'+
          '<td><div class="link-box">'+link+'</div></td>'+
          '<td>'+st+'</td>'+
          '<td><button class="btn sm" onclick="copyLink(\\''+link+'\\')">کپی</button> '+
          '<button class="btn sm danger" onclick="delStudent(\\''+s.uuid+'\\')">حذف</button></td></tr>';
      }).join('')+'</table>';
  }
  window.copyLink=(l)=>{navigator.clipboard.writeText(l).then(()=>toast('لینک کپی شد'));};
  window.delStudent=async(id)=>{if(!confirm('حذف این دانش‌آموز و پاسخنامه‌اش؟'))return;await api('/api/teacher/students/'+id,{method:'DELETE'});loadStudents();};
  document.getElementById('btn-add-student').onclick=async()=>{
    const label=document.getElementById('new-label').value.trim();
    await api('/api/teacher/students',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({label})});
    document.getElementById('new-label').value='';loadStudents();toast('دانش‌آموز ساخته شد');
  };

  // ---- سوالات ----
  async function loadQuestions(){
    const d=await api('/api/teacher/questions');
    META=d.meta||{};QUESTIONS=d.questions||[];
    document.getElementById('m-school').value=META.school||'';
    renderQ();
  }
  function renderQ(){
    const box=document.getElementById('q-list');
    box.innerHTML=QUESTIONS.map((q,i)=>qBlock(q,i)).join('')||'<p class="muted">سوالی اضافه نشده است.</p>';
  }
  function escA(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function qHtml(q){return q.rich?(q.text||''):esc(q.text);}
  function symBar(i){
    const mk=(arr,fn)=>arr.map(s=>'<button type="button" onmousedown="event.preventDefault()" onclick="'+fn+'('+i+',\\''+escA(s)+'\\')">'+escA(s)+'</button>').join('');
    let h='<div class="toolbar"><span class="grp-label">علائم ریاضی:</span>'+mk(MATH,'insSym')+
      '<button type="button" onmousedown="event.preventDefault()" onclick="insFrac('+i+')">کسر a/b</button>'+
      '<button type="button" onmousedown="event.preventDefault()" onclick="insDiv('+i+')">تقسیم چكشی</button></div>';
    h+='<div class="toolbar"><span class="grp-label">اشکال هندسی:</span>'+
      '<span class="grp-label">اندازه:</span><input type="range" min="14" max="140" value="40" id="ssz-'+i+'" style="width:110px;vertical-align:middle" oninput="resizeSel('+i+')"> '+
      mk(SHAPES,'insShape')+
      SVG_SHAPES.map((s,si)=>'<button type="button" title="'+escA(s.name)+'" onmousedown="event.preventDefault()" onclick="insSvg('+i+','+si+')">'+escA(s.name)+'</button>').join('')+'</div>'+
      '<p class="muted" style="margin:2px 0 0">برای تغییر اندازه‌ی یک شکل، ابتدا روی آن کلیک کنید سپس نوار «اندازه» را بکشید.</p>';
    return h;
  }
  function qBlock(q,i){
    let body;
    if(q.type==='descriptive'){
      body='<label>متن سوال</label>'+symBar(i)+
        '<div class="rich" data-qd="'+i+'" contenteditable="true" oninput="updHtml('+i+')">'+qHtml(q)+'</div>';
      body+='<label>عکس / شکل (اختیاری)</label>';
      if(q.image){body+='<img src="'+q.image+'" class="imgprev"><div><button class="btn sm danger" type="button" onclick="rmImg('+i+')">حذف عکس</button></div>';}
      else{body+='<input type="file" accept="image/*" onchange="loadImg('+i+',this)">';}
    }else{
      body='<label>متن سوال</label><textarea data-qd="'+i+'" oninput="upd('+i+',\\'text\\',this.value)">'+esc(q.text)+'</textarea>';
      if(q.type==='multiple'){
        body+='<label>گزینه صحیح</label><select onchange="upd('+i+',\\'correct\\',this.value)">'+
          [0,1,2,3].map(n=>'<option value="'+n+'" '+(String(q.correct)===String(n)?'selected':'')+'>'+['الف','ب','ج','د'][n]+'</option>').join('')+'</select>';
        body+='<label>گزینه‌ها</label>';
        for(let oi=0;oi<4;oi++){
          body+='<div class="opt-row"><span>'+['الف','ب','ج','د'][oi]+')</span><input type="text" value="'+esc((q.options&&q.options[oi])||'')+'" oninput="updOpt('+i+','+oi+',this.value)"></div>';
        }
      }else if(q.type==='truefalse'){
        body+='<label>پاسخ صحیح</label><select onchange="upd('+i+',\\'correct\\',this.value)">'+
          '<option value="true" '+(String(q.correct)==='true'?'selected':'')+'>صحیح</option>'+
          '<option value="false" '+(String(q.correct)==='false'?'selected':'')+'>غلط</option></select>';
      }else if(q.type==='short'){
        body+='<label>پاسخ نمونه (اختیاری)</label><input type="text" value="'+esc(q.correct||'')+'" oninput="upd('+i+',\\'correct\\',this.value)">';
      }
    }
    return '<div class="q-block"><div class="qhead"><b>سوال '+(i+1)+'</b>'+
      '<span><span class="badge">'+TYPES[q.type]+'</span> '+
      '<button class="btn sm gray" onclick="moveQ('+i+',-1)">▲</button> '+
      '<button class="btn sm gray" onclick="moveQ('+i+',1)">▼</button> '+
      '<button class="btn sm danger" onclick="delQ('+i+')">حذف</button></span></div>'+body+'</div>';
  }
  window.upd=(i,k,v)=>{QUESTIONS[i][k]=v;};
  window.updOpt=(i,oi,v)=>{QUESTIONS[i].options=QUESTIONS[i].options||['','','',''];QUESTIONS[i].options[oi]=v;};
  window.delQ=(i)=>{QUESTIONS.splice(i,1);renderQ();};
  window.moveQ=(i,dir)=>{const j=i+dir;if(j<0||j>=QUESTIONS.length)return;const t=QUESTIONS[i];QUESTIONS[i]=QUESTIONS[j];QUESTIONS[j]=t;renderQ();};

  // ---- ویرایشگر متنی سوال تشریحی (علائم ریاضی، کسر، تقسیم، اشکال هندسی) ----
  function richEl(i){return document.querySelector('.rich[data-qd="'+i+'"]');}
  function ssize(i){const r=document.getElementById('ssz-'+i);return r?parseInt(r.value,10):40;}
  function insHtmlAt(i,h){
    const el=richEl(i);if(!el)return;
    el.focus();
    const sel=document.getSelection();
    if(!sel.rangeCount||!el.contains(sel.anchorNode)){const r=document.createRange();r.selectNodeContents(el);r.collapse(false);sel.removeAllRanges();sel.addRange(r);}
    document.execCommand('insertHTML',false,h);
    updHtml(i);
  }
  window.insSym=(i,s)=>insHtmlAt(i,escA(s));
  window.insShape=(i,s)=>insHtmlAt(i,'<span class="shape" contenteditable="false" style="font-size:'+ssize(i)+'px">'+escA(s)+'</span>&#8203;');
  window.insSvg=(i,si)=>{const s=SVG_SHAPES[si];if(!s)return;const z=ssize(i);const svg=s.svg.replace('<svg','<svg width="'+z+'" height="'+z+'"');insHtmlAt(i,'<span class="shape" contenteditable="false">'+svg+'</span>&#8203;');};
  window.insFrac=(i)=>{const n=prompt('صورت کسر:');if(n===null)return;const d=prompt('مخرج کسر:');if(d===null)return;insHtmlAt(i,'<span class="frac" contenteditable="false"><span class="fn">'+escA(n)+'</span><span class="fd">'+escA(d)+'</span></span>&#8203;');};
  window.insDiv=(i)=>{const dd=prompt('مقسوم:','')||'مقسوم';const dv=prompt('مقسوم‌علیه:','')||'مقسوم‌علیه';insHtmlAt(i,'<table class="ldiv"><tr><td class="dividend">'+escA(dd)+'</td><td class="divisor">'+escA(dv)+'</td></tr><tr><td class="work"><br></td><td class="quotient">خارج‌قسمت</td></tr></table>&#8203;');};
  window.updHtml=(i)=>{const el=richEl(i);if(!el)return;const c=el.cloneNode(true);c.querySelectorAll('.shape').forEach(s=>{s.style.outline='';});QUESTIONS[i].text=c.innerHTML;QUESTIONS[i].rich=true;};
  let SELSHAPE=null;
  document.addEventListener('click',function(e){
    const sh=e.target&&e.target.closest?e.target.closest('.shape'):null;
    if(sh&&sh.closest('.rich')){
      if(SELSHAPE)SELSHAPE.style.outline='';
      SELSHAPE=sh;sh.style.outline='2px solid #2563eb';
      const i=sh.closest('.rich').getAttribute('data-qd');const r=document.getElementById('ssz-'+i);
      if(r){const svg=sh.querySelector('svg');const cur=svg?parseInt(svg.getAttribute('width'),10):parseInt((sh.style.fontSize||'40'),10);if(cur)r.value=cur;}
    }else if(SELSHAPE){SELSHAPE.style.outline='';SELSHAPE=null;}
  });
  window.resizeSel=(i)=>{
    const r=document.getElementById('ssz-'+i);if(!r)return;
    if(SELSHAPE&&SELSHAPE.closest('.rich')&&SELSHAPE.closest('.rich').getAttribute('data-qd')==String(i)){
      const z=parseInt(r.value,10);const svg=SELSHAPE.querySelector('svg');
      if(svg){svg.setAttribute('width',z);svg.setAttribute('height',z);}else{SELSHAPE.style.fontSize=z+'px';}
      updHtml(i);
    }
  };
  window.loadImg=(i,input)=>{
    const f=input.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=ev=>{
      const img=new Image();
      img.onload=()=>{
        const c=document.createElement('canvas');const mw=800;let w=img.width,h=img.height;
        if(w>mw){h=Math.round(h*mw/w);w=mw;}
        c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
        QUESTIONS[i].image=c.toDataURL('image/jpeg',0.85);renderQ();
      };img.src=ev.target.result;
    };rd.readAsDataURL(f);
  };
  window.rmImg=(i)=>{QUESTIONS[i].image='';renderQ();};
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
    const t=b.dataset.add;
    QUESTIONS.push({id:uid(),type:t,rich:t==='descriptive',text:'',options:t==='multiple'?['','','','']:[],correct:t==='multiple'?'0':(t==='truefalse'?'true':''),image:''});
    renderQ();
  });
  document.getElementById('btn-save-q').onclick=async()=>{
    META={school:document.getElementById('m-school').value};
    const d=await api('/api/teacher/questions',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({questions:QUESTIONS,meta:META})});
    if(d.ok)toast('ذخیره شد');else toast(d.error||'خطا');
  };

  // ---- تصحیح و پاسخنامه‌ها ----
  function ansText(q,ans){
    if(q.type==='multiple'){const idx=parseInt(ans,10);return isNaN(idx)?'':(['الف','ب','ج','د'][idx]+') '+esc((q.options&&q.options[idx])||''));}
    if(q.type==='truefalse'){return ans==='true'?'صحیح':(ans==='false'?'غلط':'');}
    return esc(ans);
  }
  async function loadAnswers(){
    const d=await api('/api/teacher/submissions');
    SUBS=d.submissions||[];
    const box=document.getElementById('answers-list');
    if(!SUBS.length){box.innerHTML='<p class="muted">هنوز پاسخنامه‌ای ثبت نشده است.</p>';return;}
    box.innerHTML=SUBS.map((s,si)=>{
      const g=s.grading||{graded:false,feedback:{},marks:{},overall:''};
      const rows=(s.questionsSnapshot||[]).map((q,i)=>{
        const ans=s.answers?s.answers[q.id]:'';
        const fb=(g.feedback&&g.feedback[q.id])||'';
        const mk=(g.marks&&g.marks[q.id])||'';
        const opt=(v,t)=>'<option value="'+v+'" '+(mk===v?'selected':'')+'>'+t+'</option>';
        return '<tr><td>'+(i+1)+'</td><td>'+qHtml(q)+(q.image?'<br><img src="'+q.image+'" class="imgprev">':'')+'</td>'+
          '<td>'+(ansText(q,ans)||'<i>بدون پاسخ</i>')+'</td>'+
          '<td><select id="mk_'+s.uuid+'_'+q.id+'"><option value="">—</option>'+opt('correct','صحیح')+opt('wrong','غلط')+opt('partial','نیمه‌درست')+'</select></td>'+
          '<td><input type="text" id="fb_'+s.uuid+'_'+q.id+'" value="'+esc(fb)+'" placeholder="بازخورد"></td></tr>';
      }).join('');
      const badge=g.graded?'<span class="pill ok">تصحیح‌شده</span>':'<span class="pill gr">در انتظار تصحیح</span>';
      return '<div class="q-block"><div class="qhead"><b>'+esc(s.student.name)+'</b> '+badge+
        ' <a class="btn sm sec" href="/api/teacher/word?type=answers&uuid='+s.uuid+'">دانلود Word</a></div>'+
        '<p class="muted">نام پدر: '+esc(s.student.fatherName)+' | کد ملی: '+esc(s.student.nationalId)+' | نام درس: '+esc(s.student.courseName||'')+' | تاریخ آزمون: '+esc(s.student.examDate||'')+' | ثبت: '+new Date(s.submittedAt).toLocaleString('fa-IR')+'</p>'+
        '<table><tr><th>#</th><th>سوال</th><th>پاسخ دانش‌آموز</th><th>وضعیت</th><th>بازخورد</th></tr>'+rows+'</table>'+
        '<label>بازخورد کلی</label><textarea id="ov_'+s.uuid+'">'+esc(g.overall||'')+'</textarea>'+
        '<button class="btn" style="margin-top:8px" onclick="saveGrade(\\''+s.uuid+'\\')">ثبت تصحیح</button></div>';
    }).join('');
  }
  window.saveGrade=async(uuid)=>{
    const sub=SUBS.find(x=>x.uuid===uuid);if(!sub)return;
    const feedback={},marks={};
    (sub.questionsSnapshot||[]).forEach(q=>{
      const fb=document.getElementById('fb_'+uuid+'_'+q.id);const mk=document.getElementById('mk_'+uuid+'_'+q.id);
      if(fb)feedback[q.id]=fb.value;
      if(mk&&mk.value)marks[q.id]=mk.value;
    });
    const overall=document.getElementById('ov_'+uuid).value;
    const d=await api('/api/teacher/grade',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uuid,feedback,marks,overall})});
    if(d.ok){toast('تصحیح ثبت شد');loadAnswers();}else toast(d.error||'خطا');
  };
  document.getElementById('btn-refresh-ans').onclick=loadAnswers;

  // ---- تغییر رمز عبور ----
  document.getElementById('btn-change-pass').onclick=async()=>{
    const np=document.getElementById('new-pass').value;
    const msg=document.getElementById('pass-msg');
    const d=await api('/api/teacher/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({newPassword:np})});
    if(d.ok){msg.style.color='#166534';msg.textContent='رمز عبور با موفقیت تغییر کرد.';document.getElementById('new-pass').value='';}
    else{msg.style.color='var(--danger)';msg.textContent=d.error||'خطا';}
  };

  // ---- جدول‌ساز / خروجی اکسل ----
  let TABLES=[];
  function blankRows(rows,cols,old){
    const data=[];
    for(let r=0;r<rows;r++){const row=[];for(let c=0;c<cols;c++){row.push((old&&old[r]&&old[r][c]!=null)?old[r][c]:'');}data.push(row);}
    return data;
  }
  window.renderTables=function(){
    const box=document.getElementById('tables-list');
    if(!TABLES.length){box.innerHTML='<p class="muted">هنوز جدولی ساخته نشده است. روی «افزودن جدول» بزنید.</p>';return;}
    box.innerHTML=TABLES.map((t,ti)=>{
      let h='<div class="q-block"><div class="qhead"><b>جدول '+(ti+1)+'</b><button class="btn sm danger" onclick="delTable('+ti+')">حذف جدول</button></div>';
      h+='<label>موضوع جدول</label><input value="'+esc(t.title)+'" oninput="updTableTitle('+ti+',this.value)">';
      h+='<div class="row" style="margin-top:8px"><div><label>تعداد سطر</label><input type="number" min="1" max="60" value="'+t.rows+'" onchange="resizeTable('+ti+',\\'rows\\',this.value)"></div><div><label>تعداد ستون</label><input type="number" min="1" max="20" value="'+t.cols+'" onchange="resizeTable('+ti+',\\'cols\\',this.value)"></div></div>';
      h+='<div style="overflow:auto"><table style="margin-top:10px">';
      for(let r=0;r<t.rows;r++){h+='<tr>';for(let c=0;c<t.cols;c++){h+='<td contenteditable="true" oninput="updCell('+ti+','+r+','+c+',this.innerText)">'+esc(t.data[r][c]||'')+'</td>';}h+='</tr>';}
      h+='</table></div></div>';
      return h;
    }).join('');
  };
  window.updTableTitle=(ti,v)=>{TABLES[ti].title=v;};
  window.updCell=(ti,r,c,v)=>{TABLES[ti].data[r][c]=v;};
  window.delTable=(ti)=>{if(!confirm('این جدول حذف شود؟'))return;TABLES.splice(ti,1);renderTables();};
  window.resizeTable=(ti,k,v)=>{const n=Math.max(1,parseInt(v,10)||1);const t=TABLES[ti];if(k==='rows')t.rows=n;else t.cols=n;t.data=blankRows(t.rows,t.cols,t.data);renderTables();};
  document.getElementById('btn-add-table').onclick=()=>{TABLES.push({title:'',rows:3,cols:3,data:blankRows(3,3)});renderTables();};
  document.getElementById('btn-dl-excel').onclick=()=>{
    if(!TABLES.length){toast('ابتدا یک جدول بسازید');return;}
    let html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body dir="rtl">';
    TABLES.forEach(t=>{if(t.title)html+='<h3>'+esc(t.title)+'</h3>';html+='<table border="1" style="border-collapse:collapse">';t.data.forEach(row=>{html+='<tr>'+row.map(c=>'<td style="border:1px solid #000;padding:4px 8px">'+esc(c)+'</td>').join('')+'</tr>';});html+='</table><br>';});
    html+='</body></html>';
    const blob=new Blob(['\\ufeff'+html],{type:'application/vnd.ms-excel'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='جداول.xls';document.body.appendChild(a);a.click();a.remove();
    toast('فایل اکسل ساخته شد');
  };

  // ---- اسکنر عکس ----
  let SCANIMG=null;
  document.getElementById('scan-file').addEventListener('change',function(){
    const f=this.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=ev=>{const img=new Image();img.onload=()=>{SCANIMG=img;document.getElementById('scan-controls').classList.remove('hidden');applyScan();};img.src=ev.target.result;};
    rd.readAsDataURL(f);
  });
  function applyScan(){
    if(!SCANIMG)return;
    const cv=document.getElementById('scan-canvas');const ctx=cv.getContext('2d');
    const mw=1200;let w=SCANIMG.width,h=SCANIMG.height;if(w>mw){h=Math.round(h*mw/w);w=mw;}
    cv.width=w;cv.height=h;ctx.drawImage(SCANIMG,0,0,w,h);
    const bright=parseInt(document.getElementById('scan-bright').value,10);
    const contrast=parseInt(document.getElementById('scan-contrast').value,10);
    const bw=document.getElementById('scan-bw').checked;
    const factor=(259*(contrast+255))/(255*(259-contrast));
    const im=ctx.getImageData(0,0,w,h);const d=im.data;
    for(let p=0;p<d.length;p+=4){
      let g=0.3*d[p]+0.59*d[p+1]+0.11*d[p+2];
      g=factor*(g-128)+128+bright;
      if(bw)g=g>135?255:0;
      g=g<0?0:(g>255?255:g);
      d[p]=d[p+1]=d[p+2]=g;
    }
    ctx.putImageData(im,0,0);
  }
  ['scan-bright','scan-contrast','scan-bw'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('input',applyScan);});
  document.getElementById('btn-dl-img').onclick=()=>{
    if(!SCANIMG){toast('ابتدا عکس را انتخاب کنید');return;}
    const cv=document.getElementById('scan-canvas');
    const a=document.createElement('a');a.href=cv.toDataURL('image/png');a.download='اسکن.png';document.body.appendChild(a);a.click();a.remove();
  };
  document.getElementById('btn-dl-pdf').onclick=()=>{
    if(!SCANIMG){toast('ابتدا عکس را انتخاب کنید');return;}
    if(!window.jspdf){toast('کتابخانه PDF در دسترس نیست');return;}
    const cv=document.getElementById('scan-canvas');
    const img=cv.toDataURL('image/jpeg',0.92);
    const jsPDF=window.jspdf.jsPDF;
    const pdf=new jsPDF({orientation:cv.width>=cv.height?'l':'p',unit:'pt',format:'a4'});
    const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();
    const m=24,aw=pw-2*m,ah=ph-2*m;
    let iw=cv.width,ih=cv.height;const ratio=Math.min(aw/iw,ah/ih);iw*=ratio;ih*=ratio;
    pdf.addImage(img,'JPEG',(pw-iw)/2,(ph-ih)/2,iw,ih);
    pdf.save('اسکن.pdf');
  };

  checkAuth();
  `;
}