/**
 * 🏫 پنل آموزشی کامل - مدرسه هوشمند
 * طراحی شده برای Cloudflare Workers
 * 
 * قابلیت‌ها:
 *  - پنل مدیر/معلم (مدیریت کلاس‌ها، دروس، آزمون‌ها، حضور و غیاب، کارنامه)
 *  - پنل دانش‌آموز (داشبورد، منابع، کارنامه، کلاس درس آنلاین)
 *  - سیستم کلاس درس (لینک اختصاصی، فایل‌ها، چت)
 *  - ابزارهای حرفه‌ای (اسکنر، کاهش حجم، جدول‌ساز)
 *  - تقویم آموزشی و اطلاع‌رسانی
 *  - داشبورد و آمار
 */

const APP_TITLE = "🏫 پنل آموزشی هوشمند";
const APP_VERSION = "2.0";

// ============== CONFIGURATION ==============
const CONFIG = {
  maxUploadSize: 5 * 1024 * 1024, // 5MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowedFileTypes: ['application/pdf', 'video/mp4', 'video/webm', 'application/msword', 
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  sessionDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ============== QUESTION TYPES ==============
const QUESTION_TYPES = {
  descriptive: "تشریحی",
  multiple: "چهارگزینه‌ای",
  truefalse: "صحیح / غلط",
  short: "کوتاه‌پاسخ",
};

// ============== DEFAULT DATA ==============
const DEFAULT_META = {
  school: "",
  schoolAddress: "",
  schoolPhone: "",
  principal: "",
};

const DEFAULT_TEACHER = {
  name: "",
  phone: "",
};

// ============== UTILITY FUNCTIONS ==============

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

function now() {
  return Date.now();
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

function cookieFor(name, value, maxAge = 86400) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============== KV DATABASE HELPERS ==============

async function kvGet(env, key) {
  const raw = await env.DB.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function kvPut(env, key, data) {
  await env.DB.put(key, JSON.stringify(data));
}

async function kvDel(env, key) {
  await env.DB.delete(key);
}

async function kvList(env, prefix) {
  const out = [];
  let cursor;
  do {
    const res = await env.DB.list({ prefix, cursor });
    for (const k of res.keys) {
      const v = await env.DB.get(k.name);
      if (v) out.push({ key: k.name, data: JSON.parse(v) });
    }
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
  return out;
}

async function kvListKeys(env, prefix) {
  const res = await env.DB.list({ prefix });
  return res.keys.map(k => k.name);
}

// ============== AUTH FUNCTIONS ==============

async function getTeacherHash(env) {
  return await env.DB.get("teacher:password");
}

async function isTeacher(req, env) {
  const stored = await getTeacherHash(env);
  if (!stored) return false;
  const cookies = parseCookies(req);
  return Boolean(cookies.t_auth && cookies.t_auth === stored);
}

async function getStudentByToken(env, token) {
  const raw = await env.DB.get("student:token:" + token);
  if (!raw) return null;
  return JSON.parse(raw);
}

async function isStudent(req, env) {
  const cookies = parseCookies(req);
  if (!cookies.s_auth) return { auth: false, student: null };
  const student = await getStudentByToken(env, cookies.s_auth);
  return { auth: !!student, student };
}

// ============== DATA GETTERS ==============

async function getMeta(env) {
  const raw = await env.DB.get("meta");
  return raw ? { ...DEFAULT_META, ...JSON.parse(raw) } : { ...DEFAULT_META };
}

async function getTeacherProfile(env) {
  const raw = await env.DB.get("teacher:profile");
  return raw ? { ...DEFAULT_TEACHER, ...JSON.parse(raw) } : { ...DEFAULT_TEACHER };
}

async function getQuestions(env) {
  const raw = await env.DB.get("questions");
  return raw ? JSON.parse(raw) : [];
}

async function getClasses(env) {
  const raw = await env.DB.get("classes");
  return raw ? JSON.parse(raw) : [];
}

async function getStudents(env) {
  const list = await kvList(env, "student:id:");
  return list.map(item => item.data).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function getClassrooms(env) {
  const raw = await env.DB.get("classrooms");
  return raw ? JSON.parse(raw) : [];
}

async function getAttendance(env, classId, date) {
  const raw = await env.DB.get(`attendance:${classId}:${date}`);
  return raw ? JSON.parse(raw) : {};
}

async function getGrades(env, studentId) {
  const raw = await env.DB.get(`grades:${studentId}`);
  return raw ? JSON.parse(raw) : [];
}

async function getMessages(env, classroomId) {
  const raw = await env.DB.get(`messages:${classroomId}`);
  return raw ? JSON.parse(raw) : [];
}

async function getResources(env, classroomId) {
  const raw = await env.DB.get(`resources:${classroomId}`);
  return raw ? JSON.parse(raw) : [];
}

async function getCalendar(env) {
  const raw = await env.DB.get("calendar");
  return raw ? JSON.parse(raw) : [];
}

// ============== MAIN ROUTER ==============

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      // API Routes
      if (path.startsWith("/api/")) {
        return await handleApi(req, env, url, path);
      }

      // Student Classroom Access
      if (path.startsWith("/class/")) {
        const id = decodeURIComponent(path.slice(7));
        return await classroomStudentPage(env, id);
      }

      // Teacher Pages
      if (path === "/teacher" || path === "/teacher/") {
        return html(teacherPage());
      }

      if (path === "/student" || path === "/student/") {
        return html(studentPortalPage());
      }

      // Landing Page
      if (path === "/") return html(landingPage());

      return html(notFoundPage(), 404);
    } catch (err) {
      console.error("Error:", err);
      return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};

// ============== API HANDLER ==============

async function handleApi(req, env, url, path) {
  const method = req.method;

  // ============== PUBLIC APIs ==============

  // Teacher Auth
  if (path === "/api/teacher/login" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const pass = String(body.password || "");
    const stored = await getTeacherHash(env);
    
    if (!stored) {
      if (pass.length < 4) return json({ ok: false, error: "رمز باید حداقل ۴ کاراکتر باشد" }, 400);
      const hash = await sha256(pass);
      await env.DB.put("teacher:password", hash);
      await kvPut(env, "teacher:profile", { createdAt: now() });
      return json({ ok: true, created: true }, 200, { 
        "set-cookie": cookieFor("t_auth", hash, CONFIG.sessionDuration) 
      });
    }
    
    const hash = await sha256(pass);
    if (hash === stored) return json({ ok: true }, 200, { 
      "set-cookie": cookieFor("t_auth", hash, CONFIG.sessionDuration) 
    });
    return json({ ok: false, error: "رمز عبور اشتباه است" }, 401);
  }

  if (path === "/api/teacher/logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": "t_auth=; Path=/; Max-Age=0" });
  }

  if (path === "/api/teacher/state" && method === "GET") {
    const stored = await getTeacherHash(env);
    const profile = await getTeacherProfile(env);
    return json({ ok: true, auth: await isTeacher(req, env), configured: Boolean(stored), profile });
  }

  // Student Auth
  if (path === "/api/student/login" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const studentId = String(body.studentId || "").trim();
    const pass = String(body.password || "").trim();
    
    const studentRaw = await env.DB.get("student:id:" + studentId);
    if (!studentRaw) return json({ ok: false, error: "دانش‌آموز یافت نشد" }, 404);
    
    const student = JSON.parse(studentRaw);
    const hash = await sha256(pass);
    
    if (student.password !== hash) {
      return json({ ok: false, error: "رمز عبور اشتباه است" }, 401);
    }
    
    const token = uuid();
    await env.DB.put("student:token:" + token, JSON.stringify({ ...student, password: undefined }));
    
    return json({ ok: true, student: { ...student, password: undefined } }, 200, {
      "set-cookie": cookieFor("s_auth", token, CONFIG.sessionDuration)
    });
  }

  if (path === "/api/student/logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": "s_auth=; Path=/; Max-Age=0" });
  }

  if (path === "/api/student/state" && method === "GET") {
    const cookies = parseCookies(req);
    const token = cookies.s_auth;
    if (!token) return json({ ok: true, auth: false, student: null });
    
    const student = await getStudentByToken(env, token);
    if (!student) return json({ ok: true, auth: false, student: null });
    
    // Remove sensitive data
    const { password, ...safeStudent } = student;
    return json({ ok: true, auth: true, student: safeStudent });
  }

  // ============== AI CHAT (PUBLIC - No Auth Required) ==============

  if (path === "/api/ai/chat" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const messages = body.messages || [];
    const apiKey = env.GROQ_API_KEY;
    if (!apiKey) return json({ error: "کلید GROQ_API_KEY تنظیم نشده. لطفاً در Cloudflare Dashboard متغیر محیطی GROQ_API_KEY را تنظیم کنید." }, 500);
    
    try {
      const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "system", content: "You are a helpful assistant for Iranian teachers and students. Always respond in Persian/Farsi. Be concise and helpful." }, ...messages.slice(-10)],
          max_tokens: 1024
        })
      });
      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error("Groq API Error:", errText);
        return json({ error: "خطای API: " + errText }, aiRes.status);
      }
      const aiData = await aiRes.json();
      return json({ ok: true, content: aiData.choices?.[0]?.message?.content || "" });
    } catch (e) {
      console.error("AI Error:", e);
      return json({ error: "خطا: " + e.message }, 500);
    }
  }

  // ============== TEACHER APIs ==============

  if (path.startsWith("/api/teacher/")) {
    if (!(await isTeacher(req, env))) return json({ ok: false, error: "دسترسی غیرمجاز" }, 401);

    // Profile
    if (path === "/api/teacher/profile" && method === "GET") {
      return json({ ok: true, profile: await getTeacherProfile(env) });
    }

    if (path === "/api/teacher/profile" && method === "PUT") {
      const body = await req.json().catch(() => ({}));
      const profile = {
        name: String(body.name || "").slice(0, 100),
        phone: String(body.phone || "").slice(0, 20),
      };
      await kvPut(env, "teacher:profile", profile);
      return json({ ok: true });
    }

    // Change Password
    if (path === "/api/teacher/password" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const np = String(body.newPassword || "");
      if (np.length < 4) return json({ ok: false, error: "رمز جدید باید حداقل ۴ کاراکتر باشد" }, 400);
      const hash = await sha256(np);
      await env.DB.put("teacher:password", hash);
      return json({ ok: true }, 200, { 
        "set-cookie": cookieFor("t_auth", hash, CONFIG.sessionDuration) 
      });
    }

    // Meta Settings
    if (path === "/api/teacher/meta" && method === "GET") {
      return json({ ok: true, meta: await getMeta(env) });
    }

    if (path === "/api/teacher/meta" && method === "PUT") {
      const body = await req.json().catch(() => ({}));
      const meta = { ...DEFAULT_META, ...body };
      await kvPut(env, "meta", meta);
      return json({ ok: true });
    }

    // ============== STUDENT MANAGEMENT ==============

    if (path === "/api/teacher/students" && method === "GET") {
      const students = await getStudents(env);
      const withStatus = [];
      for (const s of students) {
        const subRaw = await env.DB.get("submission:" + s.id);
        let status = "pending";
        if (subRaw) {
          const sub = JSON.parse(subRaw);
          status = sub.grading && sub.grading.graded ? "graded" : "submitted";
        }
        withStatus.push({ ...s, password: undefined, status });
      }
      return json({ ok: true, students: withStatus });
    }

    if (path === "/api/teacher/students" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = uuid().slice(0, 8);
      const pass = body.password || String(Math.floor(Math.random() * 900000 + 100000));
      const hash = await sha256(pass);
      
      const student = {
        id,
        name: String(body.name || "").slice(0, 120),
        fatherName: String(body.fatherName || "").slice(0, 120),
        nationalId: String(body.nationalId || "").slice(0, 30),
        classId: body.classId || "",
        phone: String(body.phone || "").slice(0, 20),
        createdAt: now(),
      };
      
      await env.DB.put("student:id:" + id, JSON.stringify({ ...student, password: hash }));
      return json({ ok: true, student: { ...student, password: pass } });
    }

    if (path.startsWith("/api/teacher/students/") && method === "DELETE") {
      const id = decodeURIComponent(path.slice("/api/teacher/students/".length));
      await env.DB.delete("student:id:" + id);
      await env.DB.delete("submission:" + id);
      return json({ ok: true });
    }

    // ============== CLASS MANAGEMENT ==============

    if (path === "/api/teacher/classes" && method === "GET") {
      const classes = await getClasses(env);
      return json({ ok: true, classes });
    }

    if (path === "/api/teacher/classes" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = uuid();
      const classData = {
        id,
        name: String(body.name || "").slice(0, 100),
        grade: String(body.grade || "").slice(0, 50),
        description: String(body.description || "").slice(0, 500),
        createdAt: now(),
      };
      
      const classes = await getClasses(env);
      classes.push(classData);
      await kvPut(env, "classes", classes);
      return json({ ok: true, class: classData });
    }

    if (path.startsWith("/api/teacher/classes/") && method === "PUT") {
      const id = decodeURIComponent(path.slice("/api/teacher/classes/".length));
      const body = await req.json().catch(() => ({}));
      const classes = await getClasses(env);
      const idx = classes.findIndex(c => c.id === id);
      if (idx === -1) return json({ ok: false, error: "کلاس یافت نشد" }, 404);
      
      classes[idx] = { ...classes[idx], ...body };
      await kvPut(env, "classes", classes);
      return json({ ok: true });
    }

    if (path.startsWith("/api/teacher/classes/") && method === "DELETE") {
      const id = decodeURIComponent(path.slice("/api/teacher/classes/".length));
      const classes = await getClasses(env);
      const filtered = classes.filter(c => c.id !== id);
      await kvPut(env, "classes", filtered);
      return json({ ok: true });
    }

    // ============== CLASSROOM (Online Class) ==============

    if (path === "/api/teacher/classrooms" && method === "GET") {
      const classrooms = await getClassrooms(env);
      return json({ ok: true, classrooms });
    }

    if (path === "/api/teacher/classrooms" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = uuid();
      const classroom = {
        id,
        name: String(body.name || "").slice(0, 100),
        classId: body.classId || "",
        description: String(body.description || "").slice(0, 500),
        createdAt: now(),
        students: [],
      };
      
      const classrooms = await getClassrooms(env);
      classrooms.push(classroom);
      await kvPut(env, "classrooms", classrooms);
      return json({ ok: true, classroom });
    }

    if (path.startsWith("/api/teacher/classrooms/") && path.endsWith("/students") && method === "POST") {
      const classroomId = decodeURIComponent(path.slice("/api/teacher/classrooms/".length, -9));
      const body = await req.json().catch(() => ({}));
      const studentId = String(body.studentId || "").trim();
      
      const classrooms = await getClassrooms(env);
      const classroom = classrooms.find(c => c.id === classroomId);
      if (!classroom) return json({ ok: false, error: "کلاس یافت نشد" }, 404);
      
      if (!classroom.students) classroom.students = [];
      if (!classroom.students.includes(studentId)) {
        classroom.students.push(studentId);
        await kvPut(env, "classrooms", classrooms);
      }
      return json({ ok: true });
    }

    if (path.startsWith("/api/teacher/classrooms/") && path.endsWith("/students") && method === "DELETE") {
      const classroomId = decodeURIComponent(path.slice("/api/teacher/classrooms/".length, -9));
      const body = await req.json().catch(() => ({}));
      const studentId = String(body.studentId || "").trim();
      
      const classrooms = await getClassrooms(env);
      const classroom = classrooms.find(c => c.id === classroomId);
      if (!classroom) return json({ ok: false, error: "کلاس یافت نشد" }, 404);
      
      if (classroom.students) {
        classroom.students = classroom.students.filter(s => s !== studentId);
        await kvPut(env, "classrooms", classrooms);
      }
      return json({ ok: true });
    }

    if (path.startsWith("/api/teacher/classrooms/") && method === "DELETE") {
      const id = decodeURIComponent(path.slice("/api/teacher/classrooms/".length));
      const classrooms = await getClassrooms(env);
      const filtered = classrooms.filter(c => c.id !== id);
      await kvPut(env, "classrooms", filtered);
      await env.DB.delete("resources:" + id);
      await env.DB.delete("messages:" + id);
      return json({ ok: true });
    }

    // Resources (Files)
    if (path.startsWith("/api/teacher/classrooms/") && path.includes("/resources") && method === "POST") {
      const parts = path.slice("/api/teacher/classrooms/".length).split("/");
      const classroomId = parts[0];
      
      const contentType = req.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return json({ ok: false, error: "نوع محتوای نامعتبر" }, 400);
      }
      
      const formData = await req.formData();
      const file = formData.get("file");
      const title = formData.get("title") || file?.name || "فایل";
      
      if (!file) return json({ ok: false, error: "فایلی انتخاب نشده" }, 400);
      
      const arrayBuffer = await file.arrayBuffer();
      if (arrayBuffer.byteLength > CONFIG.maxUploadSize) {
        return json({ ok: false, error: "حجم فایل بیش از حد مجاز است" }, 400);
      }
      
      const resource = {
        id: uuid(),
        title: String(title).slice(0, 200),
        type: file.type.startsWith("video/") ? "video" : (file.type.startsWith("image/") ? "image" : "file"),
        fileName: file.name,
        mimeType: file.type,
        size: arrayBuffer.byteLength,
        data: btoa(String.fromCharCode(...new Uint8Array(arrayBuffer))),
        uploadedAt: now(),
      };
      
      const resources = await getResources(env, classroomId);
      resources.push(resource);
      await kvPut(env, "resources:" + classroomId, resources);
      
      return json({ ok: true, resource });
    }

    if (path.startsWith("/api/teacher/classrooms/") && path.includes("/resources/") && method === "DELETE") {
      const parts = path.slice("/api/teacher/classrooms/".length).split("/");
      const classroomId = parts[0];
      const resourceId = parts[2];
      
      const resources = await getResources(env, classroomId);
      const filtered = resources.filter(r => r.id !== resourceId);
      await kvPut(env, "resources:" + classroomId, filtered);
      return json({ ok: true });
    }

    if (path.startsWith("/api/teacher/classrooms/") && path.includes("/resources") && method === "GET") {
      const classroomId = decodeURIComponent(path.split("/")[2]);
      const resources = await getResources(env, classroomId);
      return json({ ok: true, resources });
    }

    // Messages (for teacher to view)
    if (path.startsWith("/api/teacher/classrooms/") && path.includes("/messages") && method === "GET") {
      const classroomId = decodeURIComponent(path.split("/")[2]);
      const messages = await getMessages(env, classroomId);
      return json({ ok: true, messages });
    }

    // ============== QUESTIONS & EXAMS ==============

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
          options: Array.isArray(q.options) ? q.options.map(o => String(o)) : [],
          correct: q.correct == null ? "" : q.correct,
          image: typeof q.image === "string" ? q.image : "",
          order: i,
        };
      });
      await kvPut(env, "questions", questions);
      if (body.meta) {
        const meta = { ...DEFAULT_META, ...body.meta };
        await kvPut(env, "meta", meta);
      }
      return json({ ok: true });
    }

    // ============== SUBMISSIONS ==============

    if (path === "/api/teacher/submissions" && method === "GET") {
      const students = await getStudents(env);
      const out = [];
      for (const s of students) {
        const raw = await env.DB.get("submission:" + s.id);
        if (raw) {
          const sub = JSON.parse(raw);
          sub.studentName = s.name;
          out.push(sub);
        }
      }
      out.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
      return json({ ok: true, submissions: out });
    }

    if (path === "/api/teacher/grade" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = body.uuid;
      const raw = await env.DB.get("submission:" + id);
      if (!raw) return json({ ok: false, error: "پاسخنامه یافت نشد" }, 404);
      
      const sub = JSON.parse(raw);
      sub.grading = {
        graded: true,
        overall: String(body.overall || ""),
        feedback: body.feedback && typeof body.feedback === "object" ? body.feedback : {},
        marks: body.marks && typeof body.marks === "object" ? body.marks : {},
        gradedAt: now(),
      };
      await kvPut(env, "submission:" + id, sub);
      return json({ ok: true });
    }

    // ============== ATTENDANCE ==============

    if (path === "/api/teacher/attendance" && method === "GET") {
      const classId = url.searchParams.get("classId");
      const date = url.searchParams.get("date");
      if (!classId || !date) return json({ ok: false, error: "پارامترها نامعتبر" }, 400);
      
      const attendance = await getAttendance(env, classId, date);
      return json({ ok: true, attendance });
    }

    if (path === "/api/teacher/attendance" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { classId, date, records } = body;
      if (!classId || !date) return json({ ok: false, error: "پارامترها نامعتبر" }, 400);
      
      await kvPut(env, `attendance:${classId}:${date}`, records || {});
      return json({ ok: true });
    }

    // ============== GRADES ==============

    if (path === "/api/teacher/grades" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { studentId, subject, score, description, date } = body;
      if (!studentId) return json({ ok: false, error: "شناسه دانش‌آموز الزامی است" }, 400);
      
      const grades = await getGrades(env, studentId);
      grades.push({
        id: uuid(),
        subject: String(subject || "").slice(0, 100),
        score: Number(score) || 0,
        description: String(description || "").slice(0, 500),
        date: date || new Date().toISOString().slice(0, 10),
        createdAt: now(),
      });
      await kvPut(env, `grades:${studentId}`, grades);
      return json({ ok: true });
    }

    if (path.startsWith("/api/teacher/grades/") && method === "GET") {
      const studentId = decodeURIComponent(path.slice("/api/teacher/grades/".length));
      const grades = await getGrades(env, studentId);
      return json({ ok: true, grades });
    }

    // ============== CALENDAR ==============

    if (path === "/api/teacher/calendar" && method === "GET") {
      return json({ ok: true, events: await getCalendar(env) });
    }

    if (path === "/api/teacher/calendar" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const events = await getCalendar(env);
      events.push({
        id: uuid(),
        title: String(body.title || "").slice(0, 200),
        date: body.date,
        type: body.type || "event",
        description: String(body.description || "").slice(0, 500),
        createdAt: now(),
      });
      await kvPut(env, "calendar", events);
      return json({ ok: true });
    }

    if (path.startsWith("/api/teacher/calendar/") && method === "DELETE") {
      const id = decodeURIComponent(path.slice("/api/teacher/calendar/".length));
      const events = await getCalendar(env);
      const filtered = events.filter(e => e.id !== id);
      await kvPut(env, "calendar", filtered);
      return json({ ok: true });
    }

    // ============== WORD EXPORT ==============

    if (path === "/api/teacher/word" && method === "GET") {
      const type = url.searchParams.get("type") || "questions";
      const meta = await getMeta(env);
      
      if (type === "answers") {
        const id = url.searchParams.get("uuid");
        const raw = await env.DB.get("submission:" + id);
        if (!raw) return json({ ok: false, error: "پاسخنامه یافت نشد" }, 404);
        const sub = JSON.parse(raw);
        return wordResponse(answerSheetWord(sub), `پاسخنامه-${sub.student.name || id}.doc`);
      }
      
      const questions = await getQuestions(env);
      return wordResponse(examWord(meta, questions), "برگه-آزمون.doc");
    }

    // ============== DASHBOARD STATS ==============

    if (path === "/api/teacher/stats" && method === "GET") {
      const students = await getStudents(env);
      const classes = await getClasses(env);
      const classrooms = await getClassrooms(env);
      
      let submittedCount = 0;
      let gradedCount = 0;
      for (const s of students) {
        const raw = await env.DB.get("submission:" + s.id);
        if (raw) {
          submittedCount++;
          const sub = JSON.parse(raw);
          if (sub.grading && sub.grading.graded) gradedCount++;
        }
      }
      
      return json({
        ok: true,
        stats: {
          totalStudents: students.length,
          totalClasses: classes.length,
          totalClassrooms: classrooms.length,
          submittedExams: submittedCount,
          gradedExams: gradedCount,
        }
      });
    }
  }

  // ============== STUDENT APIs ==============

  if (path.startsWith("/api/student/")) {
    const cookies = parseCookies(req);
    const token = cookies.s_auth;
    const student = token ? await getStudentByToken(env, token) : null;
    
    if (!student) return json({ ok: false, error: "لطفاً وارد شوید" }, 401);

    // My Profile
    if (path === "/api/student/profile" && method === "GET") {
      const { password, ...safeStudent } = student;
      return json({ ok: true, student: safeStudent });
    }

    // My Classrooms
    if (path === "/api/student/classrooms" && method === "GET") {
      const classrooms = await getClassrooms(env);
      const myClassrooms = classrooms.filter(c => 
        c.students && c.students.includes(student.id)
      );
      return json({ ok: true, classrooms: myClassrooms });
    }

    // Classroom Resources
    if (path.startsWith("/api/student/classrooms/") && path.includes("/resources") && method === "GET") {
      const classroomId = decodeURIComponent(path.split("/")[3]);
      const resources = await getResources(env, classroomId);
      return json({ ok: true, resources });
    }

    // Classroom Messages
    if (path.startsWith("/api/student/classrooms/") && path.includes("/messages") && method === "GET") {
      const classroomId = decodeURIComponent(path.split("/")[3]);
      const messages = await getMessages(env, classroomId);
      return json({ ok: true, messages });
    }

    if (path.startsWith("/api/student/classrooms/") && path.includes("/messages") && method === "POST") {
      const classroomId = decodeURIComponent(path.split("/")[3]);
      const body = await req.json().catch(() => ({}));
      const text = String(body.text || "").trim().slice(0, 1000);
      if (!text) return json({ ok: false, error: "متن پیام نمی‌تواند خالی باشد" }, 400);
      
      const messages = await getMessages(env, classroomId);
      messages.push({
        id: uuid(),
        studentId: student.id,
        studentName: student.name,
        text,
        sentAt: now(),
      });
      await kvPut(env, "messages:" + classroomId, messages);
      return json({ ok: true });
    }

    // My Grades
    if (path === "/api/student/grades" && method === "GET") {
      const grades = await getGrades(env, student.id);
      return json({ ok: true, grades });
    }

    // My Attendance
    if (path === "/api/student/attendance" && method === "GET") {
      const classId = url.searchParams.get("classId");
      if (!classId) return json({ ok: false, error: "شناسه کلاس الزامی است" }, 400);
      
      // Get all attendance records for this student in this class
      const attendance = {};
      // For simplicity, just return empty for now - can be expanded
      return json({ ok: true, attendance });
    }

    // Calendar
    if (path === "/api/student/calendar" && method === "GET") {
      return json({ ok: true, events: await getCalendar(env) });
    }

    // My Submissions
    if (path === "/api/student/submissions" && method === "GET") {
      const raw = await env.DB.get("submission:" + student.id);
      if (!raw) return json({ ok: true, submissions: [] });
      
      const sub = JSON.parse(raw);
      return json({ ok: true, submissions: [sub] });
    }
  }

  // ============== PUBLIC CLASSROOM ACCESS ==============

  if (path.startsWith("/api/class/")) {
    const classroomId = decodeURIComponent(path.slice(9));
    const classrooms = await getClassrooms(env);
    const classroom = classrooms.find(c => c.id === classroomId);
    
    if (!classroom) return json({ ok: false, error: "کلاس یافت نشد" }, 404);
    
    // Check if student is enrolled
    const cookies = parseCookies(req);
    const token = cookies.s_auth;
    const student = token ? await getStudentByToken(env, token) : null;
    
    if (!student) {
      return json({ ok: false, error: "لطفاً با حساب دانش‌آموزی وارد شوید" }, 401);
    }
    
    if (!classroom.students.includes(student.id)) {
      return json({ ok: false, error: "شما در این کلاس ثبت‌نام نکرده‌اید" }, 403);
    }
    
    if (method === "GET") {
      const resources = await getResources(env, classroomId);
      const messages = await getMessages(env, classroomId);
      return json({ ok: true, classroom, resources, messages });
    }
  }

  // ============== EXAM FOR STUDENT ==============

  if (path.startsWith("/api/exam/")) {
    const rest = path.slice("/api/exam/".length);
    const parts = rest.split("/");
    const id = decodeURIComponent(parts[0] || "");
    const studentRaw = await env.DB.get("student:id:" + id);
    
    if (!studentRaw) return json({ ok: false, error: "لینک نامعتبر است" }, 404);

    if (parts[1] === "submit" && method === "POST") {
      const existing = await env.DB.get("submission:" + id);
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
        submittedAt: now(),
        grading: null,
      };
      await kvPut(env, "submission:" + id, submission);
      return json({ ok: true });
    }

    if (method === "GET") {
      const meta = await getMeta(env);
      const subRaw = await env.DB.get("submission:" + id);
      const st = JSON.parse(studentRaw);
      
      if (subRaw) {
        const sub = JSON.parse(subRaw);
        const resultQuestions = (sub.questionsSnapshot || []).map(safeQuestion);
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
      
      const questions = (await getQuestions(env)).map(safeQuestion);
      return json({ ok: true, meta, submitted: false, questions, label: st.name || "" });
    }
  }

  return json({ ok: false, error: "مسیر یافت نشد" }, 404);
}

// ============== QUESTION SAFE FUNCTION ==============

function safeQuestion(q) {
  return { 
    id: q.id, 
    type: q.type, 
    rich: Boolean(q.rich), 
    text: q.text, 
    options: q.options || [], 
    image: q.image || "" 
  };
}

// ============== SHARED CSS STYLES ==============

const SHARED_CSS = `
  :root {
    --bg: #f8fafc;
    --card: #ffffff;
    --primary: #3b82f6;
    --primary-dark: #2563eb;
    --primary-light: #dbeafe;
    --success: #10b981;
    --warning: #f59e0b;
    --danger: #ef4444;
    --accent: #8b5cf6;
    --muted: #64748b;
    --line: #e2e8f0;
    --text: #0f172a;
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
    --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
  }
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'Vazirmatn', Tahoma, system-ui, -apple-system, sans-serif;
    background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #faf5ff 100%);
    color: var(--text);
    direction: rtl;
    min-height: 100vh;
    line-height: 1.6;
  }
  
  .wrap { max-width: 1200px; margin: 0 auto; padding: 20px; }
  
  /* Header */
  .header {
    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #6366f1 100%);
    color: #fff;
    border-radius: 20px;
    padding: 28px;
    text-align: center;
    box-shadow: var(--shadow-lg);
    margin-bottom: 24px;
    position: relative;
    overflow: hidden;
  }
  .header::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 60%);
    animation: pulse 8s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.5; }
    50% { transform: scale(1.1); opacity: 0.3; }
  }
  .header h1 { font-size: 28px; margin: 8px 0; position: relative; text-shadow: 0 2px 4px rgba(0,0,0,0.2); }
  .header h2 { font-size: 16px; font-weight: 500; opacity: 0.9; position: relative; }
  .header-badge {
    display: inline-block;
    background: rgba(255,255,255,0.2);
    padding: 4px 16px;
    border-radius: 20px;
    font-size: 13px;
    margin-top: 8px;
  }
  
  /* Cards */
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: var(--shadow);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
  .card-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
  .card-title .icon { font-size: 24px; }
  
  /* Form Elements */
  label { display: block; font-size: 14px; margin: 12px 0 6px; font-weight: 600; color: var(--text); }
  input, textarea, select {
    width: 100%;
    padding: 12px 14px;
    border: 2px solid var(--line);
    border-radius: 10px;
    font-family: inherit;
    font-size: 15px;
    background: #fff;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }
  textarea { min-height: 100px; resize: vertical; }
  
  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 20px;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.2s;
    text-decoration: none;
  }
  .btn-primary { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: #fff; }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); }
  .btn-secondary { background: var(--line); color: var(--text); }
  .btn-secondary:hover { background: #cbd5e1; }
  .btn-success { background: linear-gradient(135deg, var(--success) 0%, #059669 100%); color: #fff; }
  .btn-success:hover { box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4); }
  .btn-danger { background: linear-gradient(135deg, var(--danger) 0%, #dc2626 100%); color: #fff; }
  .btn-danger:hover { box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4); }
  .btn-warning { background: linear-gradient(135deg, var(--warning) 0%, #d97706 100%); color: #fff; }
  .btn-accent { background: linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%); color: #fff; }
  .btn-sm { padding: 8px 14px; font-size: 13px; }
  .btn-lg { padding: 14px 28px; font-size: 16px; }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none !important; }
  
  /* Grid Layouts */
  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  .row > * { flex: 1; min-width: 250px; }
  .row-3 > * { flex: 1; min-width: 300px; }
  
  /* Utilities */
  .hidden { display: none !important; }
  .muted { color: var(--muted); font-size: 14px; }
  .text-center { text-align: center; }
  .text-success { color: var(--success); }
  .text-danger { color: var(--danger); }
  .text-warning { color: var(--warning); }
  .mt-2 { margin-top: 8px; }
  .mt-4 { margin-top: 16px; }
  .mb-2 { margin-bottom: 8px; }
  .mb-4 { margin-bottom: 16px; }
  
  /* Tabs */
  .tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 20px;
    background: #fff;
    padding: 8px;
    border-radius: 14px;
    box-shadow: var(--shadow);
  }
  .tab {
    padding: 12px 20px;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.2s;
    border: none;
    background: transparent;
    color: var(--muted);
    flex: 1;
    text-align: center;
    white-space: nowrap;
  }
  .tab:hover { background: var(--primary-light); color: var(--primary); }
  .tab.active { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: #fff; }
  .tab-content { display: none; }
  .tab-content.active { display: block; animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  
  /* Tables */
  .table-container { overflow-x: auto; border-radius: 12px; box-shadow: var(--shadow); }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th, td { padding: 14px 16px; text-align: right; border-bottom: 1px solid var(--line); }
  th { background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); font-weight: 700; color: var(--text); }
  tr:hover td { background: #f8fafc; }
  tr:last-child td { border-bottom: none; }
  
  /* Question Block */
  .q-block {
    border: 2px solid var(--line);
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 16px;
    background: linear-gradient(135deg, #f8fafc 0%, #fff 100%);
    transition: border-color 0.2s;
  }
  .q-block:hover { border-color: var(--primary); }
  .q-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
  }
  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }
  .badge-blue { background: var(--primary-light); color: var(--primary); }
  .badge-green { background: #d1fae5; color: #059669; }
  .badge-yellow { background: #fef3c7; color: #d97706; }
  .badge-purple { background: #ede9fe; color: #7c3aed; }
  
  /* Options */
  .opt-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
  .opt-row input[type="radio"], .opt-row input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; }
  
  /* Toolbar */
  .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
  .toolbar button {
    background: var(--primary-light);
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }
  .toolbar button:hover { background: var(--primary); color: #fff; border-color: var(--primary); }
  
  /* Upload Zone */
  .upload-zone {
    border: 2px dashed var(--line);
    border-radius: 16px;
    padding: 40px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s;
    background: #fafbfc;
    margin-bottom: 20px;
  }
  .upload-zone:hover {
    border-color: var(--primary);
    background: var(--primary-light);
  }
  .upload-zone.dragover {
    border-color: var(--primary);
    background: var(--primary-light);
    transform: scale(1.02);
  }
  .upload-icon { font-size: 48px; margin-bottom: 12px; }
  .upload-zone p { margin: 0 0 6px; font-size: 16px; font-weight: 600; color: var(--text); }
  
  /* Pills */
  .pill {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }
  .pill-ok { background: #d1fae5; color: #059669; }
  .pill-pending { background: #fef3c7; color: #d97706; }
  .pill-error { background: #fee2e2; color: #dc2626; }
  
  /* Stats Cards */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .stat-card {
    background: #fff;
    border-radius: 14px;
    padding: 20px;
    text-align: center;
    box-shadow: var(--shadow);
    transition: transform 0.2s;
  }
  .stat-card:hover { transform: translateY(-4px); }
  .stat-icon { font-size: 36px; margin-bottom: 8px; }
  .stat-value { font-size: 32px; font-weight: 700; color: var(--primary); }
  .stat-label { font-size: 14px; color: var(--muted); margin-top: 4px; }
  
  /* Chat */
  .chat-container { height: 400px; overflow-y: auto; border: 1px solid var(--line); border-radius: 12px; padding: 16px; background: #fafafa; margin-bottom: 16px; }
  .chat-message { margin-bottom: 12px; padding: 10px 14px; border-radius: 12px; max-width: 80%; }
  .chat-message.sent { background: var(--primary-light); margin-right: auto; border-bottom-right-radius: 2px; }
  .chat-message.received { background: #fff; margin-left: auto; border-bottom-left-radius: 2px; box-shadow: var(--shadow); }
  .chat-sender { font-size: 12px; font-weight: 600; color: var(--primary); margin-bottom: 4px; }
  .chat-time { font-size: 11px; color: var(--muted); margin-top: 4px; }
  
  /* File List */
  .file-list { display: grid; gap: 12px; }
  .file-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #f8fafc;
    border-radius: 10px;
    border: 1px solid var(--line);
    transition: all 0.2s;
  }
  .file-item:hover { background: var(--primary-light); border-color: var(--primary); }
  .file-icon { font-size: 24px; }
  .file-info { flex: 1; }
  .file-name { font-weight: 600; }
  .file-size { font-size: 12px; color: var(--muted); }
  
  /* Attendance Grid */
  .attendance-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; }
  .attendance-item {
    padding: 10px;
    text-align: center;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .attendance-item.present { background: #d1fae5; color: #059669; }
  .attendance-item.absent { background: #fee2e2; color: #dc2626; }
  .attendance-item.late { background: #fef3c7; color: #d97706; }
  .attendance-item:hover { transform: scale(1.05); }
  
  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-radius: 16px;
    border: 2px dashed var(--line);
  }
  .empty-state .icon { font-size: 64px; margin-bottom: 16px; opacity: 0.5; }
  .empty-state p { color: var(--muted); font-size: 16px; }
  
  /* Toast */
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(100px);
    background: var(--text);
    color: #fff;
    padding: 14px 24px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    z-index: 1000;
    opacity: 0;
    transition: all 0.3s;
    box-shadow: var(--shadow-lg);
  }
  .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
  .toast.success { background: var(--success); }
  .toast.error { background: var(--danger); }
  
  /* Scrollbar */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  
  /* Responsive */
  @media (max-width: 768px) {
    .wrap { padding: 12px; }
    .header h1 { font-size: 22px; }
    .tabs { gap: 4px; }
    .tab { padding: 10px 12px; font-size: 12px; }
    .card { padding: 16px; }
  }
`;

// ============== FONT & SCRIPTS ==============

const FONT_LINK = `<link rel="preconnect" href="https://cdn.jsdelivr.net"><link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">`;
const PDF_SCRIPT = `<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>`;

// ============== PAGE HEADER ==============

function pageHeader(title = APP_TITLE) {
  return `<div class="header">
    <h1>${esc(title)}</h1>
    <h2>${APP_VERSION} - ${APP_TITLE}</h2>
    <div class="header-badge">☁️ Cloudflare Worker</div>
  </div>`;
}

// ============== LANDING PAGE ==============

function landingPage() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_TITLE}</title>
  ${FONT_LINK}
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="wrap">
    ${pageHeader()}
    
    <div class="card">
      <h2 class="card-title"><span class="icon">🏫</span> به پنل آموزشی هوشمند خوش آمدید</h2>
      <p class="muted mb-4">سامانه جامع مدیریت آموزشی برای معلمان و دانش‌آموزان</p>
      
      <div class="row">
        <div class="card" style="flex:1">
          <div style="text-align:center">
            <div style="font-size:64px;margin-bottom:16px">👨‍🏫</div>
            <h3>پنل معلم</h3>
            <p class="muted mb-4">مدیریت کلاس‌ها، دروس، آزمون‌ها و کارنامه</p>
            <a class="btn btn-primary" href="/teacher">ورود به پنل معلم</a>
          </div>
        </div>
        
        <div class="card" style="flex:1">
          <div style="text-align:center">
            <div style="font-size:64px;margin-bottom:16px">👨‍🎓</div>
            <h3>پنل دانش‌آموز</h3>
            <p class="muted mb-4">مشاهده کارنامه، منابع آموزشی و کلاس درس</p>
            <a class="btn btn-success" href="/student">ورود به پنل دانش‌آموز</a>
          </div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h3 class="card-title"><span class="icon">✨</span> قابلیت‌های کلیدی</h3>
      <div class="row">
        <div style="flex:1">
          <div class="q-block">
            <h4>📚 مدیریت کلاس‌ها</h4>
            <p class="muted">ایجاد و مدیریت کلاس‌های درسی</p>
          </div>
          <div class="q-block">
            <h4>📝 آزمون‌ساز</h4>
            <p class="muted">طراحی سوالات متنوع و تصحیح خودکار</p>
          </div>
        </div>
        <div style="flex:1">
          <div class="q-block">
            <h4>🎥 کلاس درس آنلاین</h4>
            <p class="muted">اشتراک‌گذاری ویدیو و فایل با دانش‌آموزان</p>
          </div>
          <div class="q-block">
            <h4>💬 ارتباط مؤثر</h4>
            <p class="muted">چت و پیام‌رسانی بین معلم و دانش‌آموز</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ============== NOT FOUND PAGE ==============

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - صفحه یافت نشد</title>
  ${FONT_LINK}
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="wrap">
    ${pageHeader()}
    <div class="card text-center">
      <div style="font-size:100px;margin-bottom:20px">🔍</div>
      <h2>صفحه مورد نظر یافت نشد</h2>
      <p class="muted mb-4">صفحه‌ای که به دنبال آن هستید وجود ندارد</p>
      <a class="btn btn-primary" href="/">بازگشت به صفحه اصلی</a>
    </div>
  </div>
</body>
</html>`;
}

// ============== STUDENT PORTAL PAGE ==============

function studentPortalPage() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>پنل دانش‌آموز</title>
  ${FONT_LINK}
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="wrap">
    ${pageHeader("پنل دانش‌آموز")}
    
    <!-- Login Card -->
    <div class="card" id="login-card">
      <h2 class="card-title"><span class="icon">🔐</span> ورود به پنل دانش‌آموز</h2>
      <div class="row">
        <div>
          <label>کد دانش‌آموزی</label>
          <input type="text" id="student-id" placeholder="کد دانش‌آموزی خود را وارد کنید" autocomplete="off">
        </div>
        <div>
          <label>رمز عبور</label>
          <input type="password" id="student-pass" placeholder="رمز عبور" autocomplete="current-password">
        </div>
      </div>
      <p class="muted text-danger mt-2" id="login-error"></p>
      <button class="btn btn-success btn-lg mt-4" id="btn-login">ورود</button>
    </div>
    
    <!-- Dashboard -->
    <div id="dashboard" class="hidden">
      <div class="card">
        <div class="row" style="align-items:center">
          <div style="flex:1">
            <h2>سلام، <span id="student-name">---</span> 👋</h2>
            <p class="muted">خوش آمدید!</p>
          </div>
          <button class="btn btn-secondary" id="btn-logout">🚪 خروج</button>
        </div>
      </div>
      
      <div class="tabs">
        <div class="tab active" data-tab="my-classrooms">🏠 کلاس‌های من</div>
        <div class="tab" data-tab="my-grades">📊 کارنامه</div>
        <div class="tab" data-tab="my-attendance">✅ حضور و غیاب</div>
        <div class="tab" data-tab="my-calendar">📅 تقویم</div>
      </div>
      
      <!-- Classrooms -->
      <div class="tab-content active" id="tab-my-classrooms">
        <div id="classrooms-list"></div>
      </div>
      
      <!-- Grades -->
      <div class="tab-content" id="tab-my-grades">
        <div class="card">
          <h3 class="card-title"><span class="icon">📊</span> کارنامه و نمرات</h3>
          <div id="grades-list"></div>
        </div>
      </div>
      
      <!-- Attendance -->
      <div class="tab-content" id="tab-my-attendance">
        <div class="card">
          <h3 class="card-title"><span class="icon">✅</span> حضور و غیاب</h3>
          <p class="muted">سوابق حضور و غیاب شما در کلاس‌ها</p>
          <div id="attendance-list" class="mt-4"></div>
        </div>
      </div>
      
      <!-- Calendar -->
      <div class="tab-content" id="tab-my-calendar">
        <div class="card">
          <h3 class="card-title"><span class="icon">📅</span> تقویم آموزشی</h3>
          <div id="calendar-list"></div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Classroom Modal -->
  <div id="classroom-modal" class="hidden" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px">
    <div class="card" style="max-width:800px;width:100%;max-height:90vh;overflow:auto">
      <div class="row" style="align-items:center;margin-bottom:16px">
        <h2 id="modal-title" style="flex:1">کلاس درس</h2>
        <button class="btn btn-secondary btn-sm" onclick="closeClassroom()">✕ بستن</button>
      </div>
      
      <div class="tabs">
        <div class="tab active" data-tab="modal-resources">📁 منابع</div>
        <div class="tab" data-tab="modal-chat">💬 چت کلاس</div>
      </div>
      
      <!-- Resources Tab -->
      <div class="tab-content active" id="tab-modal-resources">
        <div id="classroom-resources"></div>
      </div>
      
      <!-- Chat Tab -->
      <div class="tab-content" id="tab-modal-chat">
        <div class="chat-container" id="chat-container"></div>
        <div class="row">
          <input type="text" id="chat-input" placeholder="پیام خود را بنویسید...">
          <button class="btn btn-primary" id="btn-send-chat">ارسال</button>
        </div>
      </div>
    </div>
  </div>
  
  <div class="toast" id="toast"></div>
  
  <script>
    let CURRENT_STUDENT = null;
    let CURRENT_CLASSROOM = null;
    let CLASSROOMS = [];
    
    const $ = id => document.getElementById(id);
    
    function toast(msg, type = '') {
      const t = $('toast');
      t.textContent = msg;
      t.className = 'toast show ' + type;
      setTimeout(() => t.classList.remove('show'), 3000);
    }
    
    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s == null ? '' : s;
      return d.innerHTML;
    }
    
    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    function formatDate(timestamp) {
      return new Date(timestamp).toLocaleDateString('fa-IR');
    }
    
    // Tab Navigation
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const content = document.querySelector('#' + tabName.replace('modal-', 'tab-'));
        if (content) content.classList.add('active');
      });
    });
    
    // Check Auth
    async function checkAuth() {
      const res = await fetch('/api/student/state');
      const data = await res.json();
      if (data.auth && data.student) {
        CURRENT_STUDENT = data.student;
        showDashboard();
      }
    }
    
    function showDashboard() {
      $('login-card').classList.add('hidden');
      $('dashboard').classList.remove('hidden');
      $('student-name').textContent = CURRENT_STUDENT.name;
      loadClassrooms();
      loadGrades();
      loadCalendar();
    }
    
    // Login
    $('btn-login').addEventListener('click', async () => {
      const studentId = $('student-id').value.trim();
      const pass = $('student-pass').value.trim();
      if (!studentId || !pass) {
        $('login-error').textContent = 'لطفاً همه فیلدها را پر کنید';
        return;
      }
      
      const res = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, password: pass })
      });
      const data = await res.json();
      
      if (data.ok) {
        CURRENT_STUDENT = data.student;
        showDashboard();
      } else {
        $('login-error').textContent = data.error || 'خطا در ورود';
      }
    });
    
    // Logout
    $('btn-logout').addEventListener('click', async () => {
      await fetch('/api/student/logout', { method: 'POST' });
      CURRENT_STUDENT = null;
      $('dashboard').classList.add('hidden');
      $('login-card').classList.remove('hidden');
      $('student-id').value = '';
      $('student-pass').value = '';
    });
    
    // Load Classrooms
    async function loadClassrooms() {
      const res = await fetch('/api/student/classrooms');
      const data = await res.json();
      CLASSROOMS = data.classrooms || [];
      
      const list = $('classrooms-list');
      if (!CLASSROOMS.length) {
        list.innerHTML = '<div class="empty-state"><div class="icon">📚</div><p>هنوز در کلاسی ثبت‌نام نکرده‌اید</p></div>';
        return;
      }
      
      list.innerHTML = '<div class="row">' + CLASSROOMS.map(c => 
        '<div class="card" onclick="openClassroom(\\'' + c.id + '\\')" style="cursor:pointer;flex:1;min-width:200px">' +
          '<div style="text-align:center">' +
            '<div style="font-size:48px;margin-bottom:12px">🎓</div>' +
            '<h3>' + esc(c.name) + '</h3>' +
            '<p class="muted">' + esc(c.description || 'کلاس درس') + '</p>' +
          '</div>' +
        '</div>'
      ).join('') + '</div>';
    }
    
    // Open Classroom
    async function openClassroom(id) {
      CURRENT_CLASSROOM = CLASSROOMS.find(c => c.id === id);
      if (!CURRENT_CLASSROOM) return;
      
      $('modal-title').textContent = CURRENT_CLASSROOM.name;
      $('classroom-modal').classList.remove('hidden');
      
      // Load resources
      const res = await fetch('/api/student/classrooms/' + id + '/resources');
      const data = await res.json();
      renderResources(data.resources || []);
      
      // Load messages
      loadMessages();
    }
    
    function closeClassroom() {
      $('classroom-modal').classList.add('hidden');
      CURRENT_CLASSROOM = null;
    }
    
    function renderResources(resources) {
      const list = $('classroom-resources');
      if (!resources.length) {
        list.innerHTML = '<div class="empty-state"><div class="icon">📂</div><p>هنوز فایلی در این کلاس قرار نگرفته است</p></div>';
        return;
      }
      
      list.innerHTML = '<div class="file-list">' + resources.map(r => {
        const icon = r.type === 'video' ? '🎬' : r.type === 'image' ? '🖼️' : '📄';
        const fileData = r.type === 'image' ? r.data : null;
        return '<div class="file-item">' +
          '<span class="file-icon">' + icon + '</span>' +
          '<div class="file-info">' +
            '<div class="file-name">' + esc(r.title) + '</div>' +
            '<div class="file-size">' + formatSize(r.size) + '</div>' +
          '</div>' +
          (fileData ? '<img src="data:' + r.mimeType + ';base64,' + fileData + '" style="max-width:100px;max-height:60px;border-radius:8px">' : '') +
          '<a class="btn btn-sm btn-primary" href="data:' + r.mimeType + ';base64,' + r.data + '" download="' + esc(r.fileName) + '">⬇️ دانلود</a>' +
        '</div>';
      }).join('') + '</div>';
    }
    
    // Chat
    async function loadMessages() {
      if (!CURRENT_CLASSROOM) return;
      const res = await fetch('/api/student/classrooms/' + CURRENT_CLASSROOM.id + '/messages');
      const data = await res.json();
      renderMessages(data.messages || []);
    }
    
    function renderMessages(messages) {
      const container = $('chat-container');
      if (!messages.length) {
        container.innerHTML = '<p class="text-center muted" style="padding:40px">هنوز پیامی ارسال نشده است</p>';
        return;
      }
      
      container.innerHTML = messages.map(m => {
        const isMe = m.studentId === CURRENT_STUDENT.id;
        return '<div class="chat-message ' + (isMe ? 'sent' : 'received') + '">' +
          '<div class="chat-sender">' + esc(m.studentName) + '</div>' +
          '<div>' + esc(m.text) + '</div>' +
          '<div class="chat-time">' + formatDate(m.sentAt) + '</div>' +
        '</div>';
      }).join('');
      
      container.scrollTop = container.scrollHeight;
    }
    
    $('btn-send-chat').addEventListener('click', sendMessage);
    $('chat-input').addEventListener('keypress', e => {
      if (e.key === 'Enter') sendMessage();
    });
    
    async function sendMessage() {
      const input = $('chat-input');
      const text = input.value.trim();
      if (!text || !CURRENT_CLASSROOM) return;
      
      const res = await fetch('/api/student/classrooms/' + CURRENT_CLASSROOM.id + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      
      if (res.ok) {
        input.value = '';
        loadMessages();
      }
    }
    
    // Refresh chat periodically
    setInterval(() => {
      if (CURRENT_CLASSROOM) loadMessages();
    }, 10000);
    
    // Load Grades
    async function loadGrades() {
      const res = await fetch('/api/student/grades');
      const data = await res.json();
      const grades = data.grades || [];
      
      const list = $('grades-list');
      if (!grades.length) {
        list.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>هنوز نمره‌ای ثبت نشده است</p></div>';
        return;
      }
      
      list.innerHTML = '<div class="table-container"><table><thead><tr><th>تاریخ</th><th>درس</th><th>نمره</th><th>توضیحات</th></tr></thead><tbody>' +
        grades.map(g => '<tr>' +
          '<td>' + formatDate(g.createdAt) + '</td>' +
          '<td>' + esc(g.subject) + '</td>' +
          '<td><span class="badge ' + (g.score >= 10 ? 'badge-green' : 'badge-yellow') + '">' + g.score + '</span></td>' +
          '<td>' + esc(g.description || '-') + '</td>' +
        '</tr>').join('') + '</tbody></table></div>';
    }
    
    // Load Calendar
    async function loadCalendar() {
      const res = await fetch('/api/student/calendar');
      const data = await res.json();
      const events = data.events || [];
      
      const list = $('calendar-list');
      if (!events.length) {
        list.innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>رویدادی در تقویم ثبت نشده است</p></div>';
        return;
      }
      
      list.innerHTML = '<div class="row">' + events.map(e => {
        const icon = e.type === 'homework' ? '📝' : e.type === 'exam' ? '📋' : '🎉';
        return '<div class="q-block" style="flex:1;min-width:200px">' +
          '<div class="row" style="align-items:center">' +
            '<span style="font-size:24px;margin-left:8px">' + icon + '</span>' +
            '<div><b>' + esc(e.title) + '</b></div>' +
          '</div>' +
          '<div class="muted mt-2">' + formatDate(e.date) + '</div>' +
          '<p class="muted mt-2">' + esc(e.description || '') + '</p>' +
        '</div>';
      }).join('') + '</div>';
    }
    
    checkAuth();
  </script>
</body>
</html>`;
}

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
      .meta-table { width:100%; border-collapse: collapse; margin-bottom: 14px; }
      .meta-table td { border: 1px solid #000; padding: 6px 8px; }
      table.q { width:100%; border-collapse: collapse; margin-bottom: 10px; }
      table.q td, table.q th { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
      .qnum { width: 36px; text-align:center; font-weight:bold; }
      .opt { padding: 2px 18px; }
      .ans { min-height: 40px; }
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

function wordHeader(meta) {
  return `<div class="hdr"><h1>${esc(meta.school || "")}</h1></div>`;
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

function answerSheetWord(sub) {
  const meta = sub.meta || DEFAULT_META;
  const questions = sub.questionsSnapshot || [];
  const g = sub.grading || {};
  const st = sub.student || {};
  
  let body = wordHeader(meta);
  body +=
    `<table class="meta-table">` +
    `<tr><td>نام و نام خانوادگی: ${esc(st.name)}</td><td>نام پدر: ${esc(st.fatherName)}</td><td>کد ملی: ${esc(st.nationalId)}</td></tr>` +
    `<tr><td>نام درس: ${esc(st.courseName)}</td><td>تاریخ آزمون: ${esc(st.examDate)}</td><td>ثبت: ${new Date(sub.submittedAt).toLocaleString("fa-IR")}</td></tr>` +
    `</table>`;

  body += `<table class="q"><tr><th class="qnum">ردیف</th><th>سوال</th><th>پاسخ</th><th>وضعیت</th><th>بازخورد</th></tr>`;
  
  questions.forEach((q, i) => {
    const ans = sub.answers ? sub.answers[q.id] : "";
    const mark = g.marks ? g.marks[q.id] : "";
    const fb = g.feedback ? g.feedback[q.id] : "";
    let qcell = q.rich ? q.text : esc(q.text);
    if (q.image) qcell += `<div><img src="${esc(q.image)}"></div>`;
    
    let ansText = "";
    if (q.type === "multiple") {
      const idx = Number(ans);
      if (!isNaN(idx) && q.options && q.options[idx] != null) {
        ansText = `${["الف", "ب", "ج", "د"][idx] || idx + 1}) ${esc(q.options[idx])}`;
      }
    } else if (q.type === "truefalse") {
      ansText = ans === "true" ? "صحیح" : (ans === "false" ? "غلط" : esc(ans));
    } else {
      ansText = esc(ans);
    }
    
    const mlabel = { correct: "صحیح", wrong: "غلط", partial: "نیمه‌درست" }[mark] || "";
    
    body +=
      `<tr><td class="qnum">${i + 1}</td>` +
      `<td>${qcell} <small>(${esc(QUESTION_TYPES[q.type] || q.type)})</small></td>` +
      `<td>${ansText || "<i>بدون پاسخ</i>"}</td>` +
      `<td>${esc(mlabel)}</td>` +
      `<td>${esc(fb || "")}</td></tr>`;
  });
  body += `</table>`;
  if (g.overall) body += `<p><b>بازخورد کلی:</b> ${esc(g.overall)}</p>`;
  return body;
}

// ============== TEACHER PAGE ==============

function teacherPage() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>پنل معلم - ${APP_TITLE}</title>
  ${FONT_LINK}
  ${PDF_SCRIPT}
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="wrap">
    ${pageHeader("پنل معلم")}
    
    <!-- Login -->
    <div class="card" id="login-panel">
      <h2 class="card-title"><span class="icon">🔐</span> ورود به پنل معلم</h2>
      <p class="muted" id="login-hint"></p>
      <label>رمز عبور</label>
      <input type="password" id="login-pass" placeholder="رمز عبور خود را وارد کنید" autocomplete="current-password">
      <p class="muted text-danger mt-2" id="login-error"></p>
      <button class="btn btn-primary btn-lg mt-4" id="btn-login">ورود</button>
    </div>
    
    <!-- Dashboard -->
    <div id="dashboard" class="hidden">
      <!-- Stats -->
      <div class="stats-grid" id="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">👨‍🎓</div>
          <div class="stat-value" id="stat-students">0</div>
          <div class="stat-label">دانش‌آموز</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📚</div>
          <div class="stat-value" id="stat-classes">0</div>
          <div class="stat-label">کلاس</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🎥</div>
          <div class="stat-value" id="stat-classrooms">0</div>
          <div class="stat-label">کلاس درس</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📋</div>
          <div class="stat-value" id="stat-exams">0</div>
          <div class="stat-label">آزمون ثبت شده</div>
        </div>
      </div>
      
      <!-- Tabs -->
      <div class="tabs">
        <div class="tab active" data-tab="tab-dashboard">📊 داشبورد</div>
        <div class="tab" data-tab="tab-classes">📚 کلاس‌ها</div>
        <div class="tab" data-tab="tab-classrooms">🎥 کلاس درس</div>
        <div class="tab" data-tab="tab-students">👨‍🎓 دانش‌آموزان</div>
        <div class="tab" data-tab="tab-exams">📝 آزمون‌ها</div>
        <div class="tab" data-tab="tab-attendance">✅ حضور و غیاب</div>
        <div class="tab" data-tab="tab-grades">📊 نمرات</div>
        <div class="tab" data-tab="tab-calendar">📅 تقویم</div>
        <div class="tab" data-tab="tab-tools">🛠️ ابزارها</div>
        <div class="tab" data-tab="tab-ai">🤖 هوش مصنوعی</div>
        <div class="tab" data-tab="tab-settings">⚙️ تنظیمات</div>
        <div style="flex:1"></div>
        <div class="tab" id="btn-logout" style="background:#fee2e2;color:#991b1b">🚪 خروج</div>
      </div>
      
      <!-- Dashboard Tab -->
      <div class="tab-content active" id="tab-dashboard">
        <div class="card">
          <h3 class="card-title"><span class="icon">📊</span> خلاصه وضعیت</h3>
          <p class="muted">به پنل مدیریت آموزشی خوش آمدید. از منوی بالا بخش‌های مختلف را مشاهده کنید.</p>
        </div>
      </div>
      
      <!-- Classes Tab -->
      <div class="tab-content" id="tab-classes">
        <div class="card">
          <div class="row" style="align-items:center;margin-bottom:16px">
            <h3 class="card-title" style="margin:0"><span class="icon">📚</span> مدیریت کلاس‌ها</h3>
            <button class="btn btn-primary btn-sm" id="btn-add-class">➕ کلاس جدید</button>
          </div>
          <div id="classes-list"></div>
        </div>
      </div>
      
      <!-- Classrooms Tab (Online Class) -->
      <div class="tab-content" id="tab-classrooms">
        <div class="card">
          <div class="row" style="align-items:center;margin-bottom:16px">
            <h3 class="card-title" style="margin:0"><span class="icon">🎥</span> کلاس درس آنلاین</h3>
            <button class="btn btn-primary btn-sm" id="btn-add-classroom">🎬 کلاس درس جدید</button>
          </div>
          <div id="classrooms-list"></div>
        </div>
      </div>
      
      <!-- Students Tab -->
      <div class="tab-content" id="tab-students">
        <div class="card">
          <h3 class="card-title"><span class="icon">👨‍🎓</span> مدیریت دانش‌آموزان</h3>
          <div class="row mb-4">
            <div><input type="text" id="new-student-name" placeholder="نام دانش‌آموز"></div>
            <div><input type="text" id="new-student-father" placeholder="نام پدر"></div>
            <div><input type="text" id="new-student-code" placeholder="کد ملی"></div>
            <div>
              <select id="new-student-class">
                <option value="">انتخاب کلاس...</option>
              </select>
            </div>
            <button class="btn btn-success" id="btn-add-student">➕ افزودن</button>
          </div>
          <div class="table-container">
            <table id="students-table">
              <thead><tr><th>نام</th><th>نام پدر</th><th>کد ملی</th><th>کلاس</th><th>رمز</th><th>عملیات</th></tr></thead>
              <tbody id="students-body"></tbody>
            </table>
          </div>
        </div>
      </div>
      
      <!-- Exams Tab -->
      <div class="tab-content" id="tab-exams">
        <div class="card">
          <h3 class="card-title"><span class="icon">📝</span> طراحی آزمون</h3>
          <div class="row mb-4">
            <div style="flex:2">
              <label>نام مدرسه</label>
              <input type="text" id="exam-school" placeholder="نام مدرسه">
            </div>
          </div>
          <div id="questions-list"></div>
          <div class="toolbar mb-4">
            <button class="btn btn-secondary" data-qtype="descriptive">➕ تشریحی</button>
            <button class="btn btn-secondary" data-qtype="multiple">➕ چهارگزینه‌ای</button>
            <button class="btn btn-secondary" data-qtype="truefalse">➕ صحیح/غلط</button>
            <button class="btn btn-secondary" data-qtype="short">➕ کوتاه‌پاسخ</button>
          </div>
          <div class="row">
            <button class="btn btn-primary" id="btn-save-exam">💾 ذخیره آزمون</button>
            <a class="btn btn-success" id="btn-download-exam" href="/api/teacher/word?type=questions" target="_blank">📥 دانلود Word</a>
          </div>
        </div>
        
        <div class="card">
          <h3 class="card-title"><span class="icon">✅</span> پاسخنامه‌ها</h3>
          <button class="btn btn-secondary btn-sm mb-4" id="btn-refresh-subs">🔄 به‌روزرسانی</button>
          <div id="submissions-list"></div>
        </div>
      </div>
      
      <!-- Attendance Tab -->
      <div class="tab-content" id="tab-attendance">
        <div class="card">
          <h3 class="card-title"><span class="icon">✅</span> حضور و غیاب</h3>
          <div class="row mb-4">
            <div>
              <label>کلاس</label>
              <select id="att-class">
                <option value="">انتخاب کلاس...</option>
              </select>
            </div>
            <div>
              <label>تاریخ</label>
              <input type="date" id="att-date">
            </div>
            <div style="display:flex;align-items:flex-end">
              <button class="btn btn-primary" id="btn-load-attendance">بارگذاری</button>
            </div>
          </div>
          <div id="attendance-grid"></div>
          <button class="btn btn-success mt-4 hidden" id="btn-save-attendance">💾 ذخیره حضور و غیاب</button>
        </div>
      </div>
      
      <!-- Grades Tab -->
      <div class="tab-content" id="tab-grades">
        <div class="card">
          <h3 class="card-title"><span class="icon">📊</span> ثبت نمرات</h3>
          <div class="row mb-4">
            <div>
              <label>دانش‌آموز</label>
              <select id="grade-student">
                <option value="">انتخاب دانش‌آموز...</option>
              </select>
            </div>
            <div>
              <label>درس</label>
              <input type="text" id="grade-subject" placeholder="نام درس">
            </div>
            <div>
              <label>نمره</label>
              <input type="number" id="grade-score" min="0" max="20" placeholder="نمره">
            </div>
            <div style="display:flex;align-items:flex-end">
              <button class="btn btn-success" id="btn-add-grade">➕ ثبت نمره</button>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>دانش‌آموز</th><th>درس</th><th>نمره</th><th>تاریخ</th></tr></thead>
              <tbody id="grades-body"></tbody>
            </table>
          </div>
        </div>
      </div>
      
      <!-- Calendar Tab -->
      <div class="tab-content" id="tab-calendar">
        <div class="card">
          <h3 class="card-title"><span class="icon">📅</span> تقویم آموزشی</h3>
          <div class="row mb-4">
            <div>
              <label>عنوان</label>
              <input type="text" id="event-title" placeholder="عنوان رویداد">
            </div>
            <div>
              <label>تاریخ</label>
              <input type="date" id="event-date">
            </div>
            <div>
              <label>نوع</label>
              <select id="event-type">
                <option value="event">مناسبت</option>
                <option value="homework">تکلیف</option>
                <option value="exam">امتحان</option>
              </select>
            </div>
            <div style="display:flex;align-items:flex-end">
              <button class="btn btn-primary" id="btn-add-event">➕ افزودن</button>
            </div>
          </div>
          <div id="calendar-events"></div>
        </div>
      </div>
      
      <!-- Tools Tab -->
      <div class="tab-content" id="tab-tools">
        <div class="card">
          <h3 class="card-title"><span class="icon">🛠️</span> ابزارهای کمکی</h3>
          <div class="row">
            <div class="card" style="flex:1;cursor:pointer" onclick="showTool('scan')">
              <div style="text-align:center">
                <div style="font-size:48px">📷</div>
                <h4>اسکنر عکس</h4>
                <p class="muted">بهبود کیفیت عکس</p>
              </div>
            </div>
            <div class="card" style="flex:1;cursor:pointer" onclick="showTool('resize')">
              <div style="text-align:center">
                <div style="font-size:48px">🗜️</div>
                <h4>کاهش حجم</h4>
                <p class="muted">فشرده‌سازی عکس‌ها</p>
              </div>
            </div>
            <div class="card" style="flex:1;cursor:pointer" onclick="showTool('table')">
              <div style="text-align:center">
                <div style="font-size:48px">📊</div>
                <h4>جدول‌ساز</h4>
                <p class="muted">ساخت جدول و خروجی Excel</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Scanner Tool -->
        <div class="card hidden" id="tool-scan">
          <h3 class="card-title"><span class="icon">📷</span> اسکنر عکس</h3>
          <div class="upload-zone" id="scan-drop">
            <input type="file" accept="image/*" id="scan-file" class="hidden">
            <div class="upload-icon">📷</div>
            <p>عکس را اینجا رها کنید یا کلیک کنید</p>
          </div>
          <div id="scan-controls" class="hidden">
            <div class="filter-presets">
              <button class="filter-btn active" data-filter="original">اصلی</button>
              <button class="filter-btn" data-filter="bw">سیاه/سفید</button>
              <button class="filter-btn" data-filter="gray">خاکستری</button>
              <button class="filter-btn" data-filter="document">سند</button>
            </div>
            <div class="scan-preview" style="background:#1e293b;border-radius:12px;padding:16px;margin:16px 0">
              <canvas id="scan-canvas" style="max-width:100%;border-radius:8px"></canvas>
            </div>
            <div class="row">
              <button class="btn btn-primary" id="btn-dl-scan">💾 دانلود PNG</button>
              <button class="btn btn-success" id="btn-dl-pdf">📄 دانلود PDF</button>
              <button class="btn btn-secondary" id="btn-reset-scan">🔄 بازنشانی</button>
            </div>
          </div>
        </div>
        
        <!-- Resize Tool -->
        <div class="card hidden" id="tool-resize">
          <h3 class="card-title"><span class="icon">🗜️</span> کاهش حجم عکس</h3>
          <div class="upload-zone" id="resize-drop">
            <input type="file" accept="image/*" id="resize-file" class="hidden" multiple>
            <div class="upload-icon">🖼️</div>
            <p>عکس‌ها را اینجا رها کنید یا کلیک کنید</p>
          </div>
          <div id="resize-controls" class="hidden mt-4">
            <div class="row">
              <div>
                <label>کیفیت: <span id="quality-val">85</span>%</label>
                <input type="range" id="resize-quality" min="10" max="100" value="85" style="width:200px">
              </div>
              <div>
                <label>فرمت</label>
                <div class="toolbar">
                  <button class="format-btn active" data-format="jpeg">JPEG</button>
                  <button class="format-btn" data-format="webp">WEBP</button>
                </div>
              </div>
            </div>
            <div class="resize-preview" id="resize-preview" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin:16px 0"></div>
            <button class="btn btn-primary" id="btn-resize-all">⚡ فشرده‌سازی همه</button>
          </div>
        </div>
        
        <!-- Table Tool -->
        <div class="card hidden" id="tool-table">
          <h3 class="card-title"><span class="icon">📊</span> جدول‌ساز</h3>
          <div class="toolbar mb-4">
            <button class="btn btn-primary" id="btn-add-table">➕ جدول جدید</button>
            <button class="btn btn-success" id="btn-export-excel">📥 خروجی Excel</button>
          </div>
          <div id="tables-area"></div>
        </div>
      </div>
      
      <!-- AI Tab -->
      <div class="tab-content" id="tab-ai">
        <div class="card">
          <h3 class="card-title"><span class="icon">🤖</span> دستیار هوش مصنوعی</h3>
          <div id="ai-messages" class="chat-container" style="height:300px"></div>
          <div class="row mt-4">
            <input type="text" id="ai-input" placeholder="سوال خود را بنویسید...">
            <button class="btn btn-primary" id="btn-ai-send">ارسال</button>
          </div>
        </div>
      </div>
      
      <!-- Settings Tab -->
      <div class="tab-content" id="tab-settings">
        <div class="card">
          <h3 class="card-title"><span class="icon">⚙️</span> تنظیمات</h3>
          <div class="row">
            <div style="flex:2">
              <label>نام مدرسه</label>
              <input type="text" id="setting-school" placeholder="نام مدرسه">
            </div>
            <div style="flex:1">
              <label>شماره تماس</label>
              <input type="tel" id="setting-phone" placeholder="شماره تماس">
            </div>
          </div>
          <button class="btn btn-primary mt-4" id="btn-save-settings">💾 ذخیره تنظیمات</button>
        </div>
        
        <div class="card">
          <h3 class="card-title"><span class="icon">🔑</span> تغییر رمز عبور</h3>
          <label>رمز عبور جدید</label>
          <input type="password" id="new-password" placeholder="رمز عبور جدید">
          <p class="muted mt-2" id="pass-msg"></p>
          <button class="btn btn-warning mt-4" id="btn-change-pass">تغییر رمز</button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Classroom Detail Modal -->
  <div id="classroom-modal" class="hidden" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100;overflow:auto">
    <div class="card" style="max-width:900px;margin:40px auto;max-height:90vh;overflow:auto">
      <div class="row" style="align-items:center;margin-bottom:16px">
        <h2 id="cr-title" style="flex:1">کلاس درس</h2>
        <button class="btn btn-secondary btn-sm" onclick="closeClassroom()">✕ بستن</button>
      </div>
      <p class="muted mb-4" id="cr-link"></p>
      
      <div class="tabs">
        <div class="tab active" data-tab="cr-students">👥 دانش‌آموزان</div>
        <div class="tab" data-tab="cr-resources">📁 منابع</div>
        <div class="tab" data-tab="cr-chat">💬 پیام‌ها</div>
      </div>
      
      <div class="tab-content active" id="tab-cr-students">
        <div class="row mb-4">
          <select id="add-to-classroom">
            <option value="">انتخاب دانش‌آموز...</option>
          </select>
          <button class="btn btn-success btn-sm" id="btn-add-to-classroom">➕ افزودن</button>
        </div>
        <div id="cr-students-list"></div>
      </div>
      
      <div class="tab-content" id="tab-cr-resources">
        <div class="upload-zone" id="cr-upload-zone">
          <input type="file" id="cr-file-input" class="hidden" accept="image/*,video/*,.pdf,.doc,.docx">
          <div class="upload-icon">📤</div>
          <p>فایل را اینجا رها کنید یا کلیک کنید</p>
          <p class="muted">ویدیو، عکس، PDF یا Word</p>
        </div>
        <div id="cr-resources-list" class="file-list mt-4"></div>
      </div>
      
      <div class="tab-content" id="tab-cr-chat">
        <div class="chat-container" id="cr-chat-container"></div>
      </div>
    </div>
  </div>
  
  <!-- Class Modal -->
  <div id="class-modal" class="hidden" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px">
    <div class="card" style="max-width:400px;width:100%">
      <h3 class="card-title"><span class="icon">📚</span> <span id="class-modal-title">کلاس جدید</span></h3>
      <input type="hidden" id="class-id">
      <label>نام کلاس</label>
      <input type="text" id="class-name" placeholder="نام کلاس">
      <label>پایه/مقطع</label>
      <input type="text" id="class-grade" placeholder="مثال: سوم ابتدایی">
      <label>توضیحات</label>
      <textarea id="class-desc" placeholder="توضیحات (اختیاری)"></textarea>
      <div class="row mt-4">
        <button class="btn btn-primary" id="btn-save-class">💾 ذخیره</button>
        <button class="btn btn-secondary" onclick="closeClassModal()">انصراف</button>
      </div>
    </div>
  </div>
  
  <!-- Classroom Create Modal -->
  <div id="classroom-create-modal" class="hidden" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px">
    <div class="card" style="max-width:400px;width:100%">
      <h3 class="card-title"><span class="icon">🎥</span> کلاس درس جدید</h3>
      <label>نام کلاس درس</label>
      <input type="text" id="cr-name" placeholder="مثال: ریاضی پایه سوم">
      <label>کلاس مرتبط</label>
      <select id="cr-class-select">
        <option value="">انتخاب کلاس...</option>
      </select>
      <label>توضیحات</label>
      <textarea id="cr-desc" placeholder="توضیحات (اختیاری)"></textarea>
      <div class="row mt-4">
        <button class="btn btn-primary" id="btn-create-classroom">🎬 ایجاد کلاس</button>
        <button class="btn btn-secondary" onclick="closeClassroomCreateModal()">انصراف</button>
      </div>
    </div>
  </div>
  
  <div class="toast" id="toast"></div>
  <script>${teacherScript()}</script>
</body>
</html>`;
}

// ============== TEACHER SCRIPT ==============

function teacherScript() {
  return `
  // Global State
  let QUESTIONS = [];
  let CLASSES = [];
  let CLASSROOMS = [];
  let STUDENTS = [];
  let CURRENT_CLASSROOM = null;
  let TABLES = [];
  let SCAN_IMG = null;
  let RESIZE_IMAGES = [];
  
  // Helpers
  const $ = id => document.getElementById(id);
  const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
  const toast = (msg, type = '') => {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    setTimeout(() => t.classList.remove('show'), 3000);
  };
  const api = async (path, opts = {}) => {
    const r = await fetch(path, opts);
    return r.json();
  };
  const formatSize = b => b < 1024 * 1024 ? (b / 1024).toFixed(1) + ' KB' : (b / (1024 * 1024)).toFixed(1) + ' MB';
  const formatDate = ts => new Date(ts).toLocaleDateString('fa-IR');
  
  // Tab Navigation
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      if (!tabName) return;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const content = document.querySelector('#' + tabName);
      if (content) content.classList.add('active');
    });
  });
  
  // Auth Check
  async function checkAuth() {
    const res = await api('/api/teacher/state');
    if (res.auth) {
      $('login-panel').classList.add('hidden');
      $('dashboard').classList.remove('hidden');
      if (res.configured) {
        $('login-hint').textContent = 'برای ورود رمز عبور خود را وارد کنید';
      } else {
        $('login-hint').textContent = 'اولین ورود: رمز عبور جدید تعیین کنید';
      }
      loadAll();
    }
  }
  
  // Login
  $('btn-login').addEventListener('click', async () => {
    const pass = $('login-pass').value;
    const res = await api('/api/teacher/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    if (res.ok) {
      $('login-panel').classList.add('hidden');
      $('dashboard').classList.remove('hidden');
      loadAll();
    } else {
      $('login-error').textContent = res.error || 'خطا در ورود';
    }
  });
  
  // Logout
  $('btn-logout').addEventListener('click', async () => {
    await api('/api/teacher/logout', { method: 'POST' });
    location.reload();
  });
  
  // Load All Data
  async function loadAll() {
    await loadStats();
    await loadClasses();
    await loadClassrooms();
    await loadStudents();
    await loadQuestions();
    await loadSettings();
  }
  
  // Load Stats
  async function loadStats() {
    const res = await api('/api/teacher/stats');
    if (res.stats) {
      $('stat-students').textContent = res.stats.totalStudents;
      $('stat-classes').textContent = res.stats.totalClasses;
      $('stat-classrooms').textContent = res.stats.totalClassrooms;
      $('stat-exams').textContent = res.stats.submittedExams;
    }
  }
  
  // Load Classes
  async function loadClasses() {
    const res = await api('/api/teacher/classes');
    CLASSES = res.classes || [];
    renderClasses();
    updateClassSelects();
  }
  
  function renderClasses() {
    const list = $('classes-list');
    if (!CLASSES.length) {
      list.innerHTML = '<div class="empty-state"><div class="icon">📚</div><p>هنوز کلاسی ساخته نشده است</p></div>';
      return;
    }
    list.innerHTML = '<div class="row">' + CLASSES.map(c =>
      '<div class="card" style="flex:1;min-width:250px">' +
        '<h4>' + esc(c.name) + '</h4>' +
        '<p class="muted">' + esc(c.grade || '') + '</p>' +
        '<p class="muted">' + esc(c.description || '') + '</p>' +
        '<div class="row mt-4">' +
          '<button class="btn btn-secondary btn-sm" onclick="editClass(\\'' + c.id + '\\')">✏️ ویرایش</button>' +
          '<button class="btn btn-danger btn-sm" onclick="deleteClass(\\'' + c.id + '\\')">🗑️ حذف</button>' +
        '</div>' +
      '</div>'
    ).join('') + '</div>';
  }
  
  function updateClassSelects() {
    const opts = '<option value="">انتخاب کلاس...</option>' + CLASSES.map(c => 
      '<option value="' + c.id + '">' + esc(c.name) + '</option>'
    ).join('');
    ['new-student-class', 'att-class', 'cr-class-select'].forEach(id => {
      const el = $(id);
      if (el) el.innerHTML = opts;
    });
  }
  
  // Class CRUD
  $('btn-add-class').addEventListener('click', () => {
    $('class-id').value = '';
    $('class-name').value = '';
    $('class-grade').value = '';
    $('class-desc').value = '';
    $('class-modal-title').textContent = 'کلاس جدید';
    $('class-modal').classList.remove('hidden');
  });
  
  window.editClass = id => {
    const c = CLASSES.find(x => x.id === id);
    if (!c) return;
    $('class-id').value = c.id;
    $('class-name').value = c.name;
    $('class-grade').value = c.grade || '';
    $('class-desc').value = c.description || '';
    $('class-modal-title').textContent = 'ویرایش کلاس';
    $('class-modal').classList.remove('hidden');
  };
  
  window.deleteClass = async id => {
    if (!confirm('آیا از حذف این کلاس مطمئن هستید؟')) return;
    await api('/api/teacher/classes/' + id, { method: 'DELETE' });
    loadClasses();
  };
  
  $('btn-save-class').addEventListener('click', async () => {
    const id = $('class-id').value;
    const data = {
      name: $('class-name').value,
      grade: $('class-grade').value,
      description: $('class-desc').value
    };
    if (!data.name) { toast('نام کلاس الزامی است', 'error'); return; }
    
    if (id) {
      await api('/api/teacher/classes/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    } else {
      await api('/api/teacher/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    }
    $('class-modal').classList.add('hidden');
    loadClasses();
  });
  
  function closeClassModal() { $('class-modal').classList.add('hidden'); }
  
  // Classrooms
  async function loadClassrooms() {
    const res = await api('/api/teacher/classrooms');
    CLASSROOMS = res.classrooms || [];
    renderClassrooms();
  }
  
  function renderClassrooms() {
    const list = $('classrooms-list');
    if (!CLASSROOMS.length) {
      list.innerHTML = '<div class="empty-state"><div class="icon">🎥</div><p>هنوز کلاس درسی ساخته نشده است</p></div>';
      return;
    }
    list.innerHTML = '<div class="row">' + CLASSROOMS.map(c => {
      const cls = CLASSES.find(x => x.id === c.classId);
      return '<div class="card" style="flex:1;min-width:250px;cursor:pointer" onclick="openClassroom(\\'' + c.id + '\\')">' +
        '<div style="text-align:center">' +
          '<div style="font-size:48px;margin-bottom:12px">🎓</div>' +
          '<h4>' + esc(c.name) + '</h4>' +
          '<p class="muted">' + (cls ? esc(cls.name) : '') + '</p>' +
          '<p class="muted">' + (c.students ? c.students.length : 0) + ' دانش‌آموز</p>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }
  
  $('btn-add-classroom').addEventListener('click', () => {
    $('cr-name').value = '';
    $('cr-desc').value = '';
    $('classroom-create-modal').classList.remove('hidden');
  });
  
  $('btn-create-classroom').addEventListener('click', async () => {
    const name = $('cr-name').value.trim();
    const classId = $('cr-class-select').value;
    const desc = $('cr-desc').value;
    if (!name) { toast('نام کلاس درس الزامی است', 'error'); return; }
    
    await api('/api/teacher/classrooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, classId, description: desc })
    });
    $('classroom-create-modal').classList.add('hidden');
    loadClassrooms();
    loadStats();
  });
  
  function closeClassroomCreateModal() { $('classroom-create-modal').classList.add('hidden'); }
  
  // Open Classroom Detail
  window.openClassroom = async id => {
    CURRENT_CLASSROOM = CLASSROOMS.find(c => c.id === id);
    if (!CURRENT_CLASSROOM) return;
    
    $('cr-title').textContent = CURRENT_CLASSROOM.name;
    $('cr-link').innerHTML = 'لینک: <code>/student</code> (دانش‌آموزان با حساب خود وارد شوند)';
    $('classroom-modal').classList.remove('hidden');
    
    // Load students for this classroom
    renderClassroomStudents();
    // Load resources
    loadClassroomResources();
    // Load messages
    loadClassroomMessages();
  };
  
  window.closeClassroom = () => {
    $('classroom-modal').classList.add('hidden');
    CURRENT_CLASSROOM = null;
  };
  
  function renderClassroomStudents() {
    const list = $('cr-students-list');
    if (!CURRENT_CLASSROOM || !CURRENT_CLASSROOM.students || !CURRENT_CLASSROOM.students.length) {
      list.innerHTML = '<p class="muted text-center">دانش‌آموزی به این کلاس اضافه نشده</p>';
      return;
    }
    list.innerHTML = '<div class="row" style="flex-wrap:wrap;gap:8px">' + 
      CURRENT_CLASSROOM.students.map(sid => {
        const st = STUDENTS.find(s => s.id === sid);
        return '<div class="pill pill-ok" style="padding:8px 16px;font-size:14px">' + esc(st ? st.name : sid) + 
          ' <button class="btn btn-danger btn-sm" style="margin-right:8px;padding:2px 8px" onclick="removeFromClassroom(\\'' + sid + '\\')">×</button></div>';
      }).join('') + '</div>';
  }
  
  // Add student to classroom
  $('add-to-classroom').innerHTML = '<option value="">انتخاب دانش‌آموز...</option>' + 
    STUDENTS.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('');
  
  $('btn-add-to-classroom').addEventListener('click', async () => {
    const studentId = $('add-to-classroom').value;
    if (!studentId || !CURRENT_CLASSROOM) return;
    
    await api('/api/teacher/classrooms/' + CURRENT_CLASSROOM.id + '/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId })
    });
    
    if (!CURRENT_CLASSROOM.students) CURRENT_CLASSROOM.students = [];
    if (!CURRENT_CLASSROOM.students.includes(studentId)) {
      CURRENT_CLASSROOM.students.push(studentId);
    }
    renderClassroomStudents();
    toast('دانش‌آموز اضافه شد');
  });
  
  window.removeFromClassroom = async studentId => {
    if (!CURRENT_CLASSROOM) return;
    await api('/api/teacher/classrooms/' + CURRENT_CLASSROOM.id + '/students', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId })
    });
    if (CURRENT_CLASSROOM.students) {
      CURRENT_CLASSROOM.students = CURRENT_CLASSROOM.students.filter(s => s !== studentId);
    }
    renderClassroomStudents();
  };
  
  // Classroom Resources (Upload by Teacher)
  const crUploadZone = $('cr-upload-zone');
  const crFileInput = $('cr-file-input');
  crUploadZone.addEventListener('click', () => crFileInput.click());
  crUploadZone.addEventListener('dragover', e => { e.preventDefault(); crUploadZone.classList.add('dragover'); });
  crUploadZone.addEventListener('dragleave', () => crUploadZone.classList.remove('dragover'));
  crUploadZone.addEventListener('drop', e => {
    e.preventDefault();
    crUploadZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleClassroomFile(e.dataTransfer.files[0]);
  });
  crFileInput.addEventListener('change', () => { if (crFileInput.files[0]) handleClassroomFile(crFileInput.files[0]); });
  
  async function handleClassroomFile(file) {
    if (!CURRENT_CLASSROOM) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name);
    
    const res = await fetch('/api/teacher/classrooms/' + CURRENT_CLASSROOM.id + '/resources', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.ok) {
      toast('فایل آپلود شد');
      loadClassroomResources();
    } else {
      toast(data.error || 'خطا در آپلود', 'error');
    }
  }
  
  async function loadClassroomResources() {
    if (!CURRENT_CLASSROOM) return;
    const res = await api('/api/teacher/classrooms/' + CURRENT_CLASSROOM.id + '/resources');
    renderClassroomResources(res.resources || []);
  }
  
  function renderClassroomResources(resources) {
    const list = $('cr-resources-list');
    if (!resources.length) {
      list.innerHTML = '<p class="muted text-center">هنوز فایلی آپلود نشده</p>';
      return;
    }
    list.innerHTML = resources.map(r => {
      const icon = r.type === 'video' ? '🎬' : r.type === 'image' ? '🖼️' : '📄';
      return '<div class="file-item">' +
        '<span class="file-icon">' + icon + '</span>' +
        '<div class="file-info"><div class="file-name">' + esc(r.title) + '</div><div class="file-size">' + formatSize(r.size) + '</div></div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteResource(\\'' + r.id + '\\')">🗑️</button>' +
      '</div>';
    }).join('');
  }
  
  window.deleteResource = async id => {
    if (!CURRENT_CLASSROOM || !confirm('حذف شود؟')) return;
    await api('/api/teacher/classrooms/' + CURRENT_CLASSROOM.id + '/resources/' + id, { method: 'DELETE' });
    loadClassroomResources();
  };
  
  // Classroom Messages
  async function loadClassroomMessages() {
    if (!CURRENT_CLASSROOM) return;
    const res = await api('/api/teacher/classrooms/' + CURRENT_CLASSROOM.id + '/messages');
    renderClassroomMessages(res.messages || []);
  }
  
  function renderClassroomMessages(messages) {
    const container = $('cr-chat-container');
    if (!messages.length) {
      container.innerHTML = '<p class="muted text-center" style="padding:40px">هنوز پیامی ارسال نشده</p>';
      return;
    }
    container.innerHTML = messages.map(m => {
      const st = STUDENTS.find(s => s.id === m.studentId);
      return '<div class="chat-message received">' +
        '<div class="chat-sender">' + esc(st ? st.name : m.studentName || 'نامشخص') + '</div>' +
        '<div>' + esc(m.text) + '</div>' +
        '<div class="chat-time">' + formatDate(m.sentAt) + '</div>' +
      '</div>';
    }).join('');
    container.scrollTop = container.scrollHeight;
  }
  
  // Refresh messages periodically
  setInterval(() => {
    if (CURRENT_CLASSROOM) loadClassroomMessages();
  }, 10000);
  
  // Students
  async function loadStudents() {
    const res = await api('/api/teacher/students');
    STUDENTS = res.students || [];
    renderStudents();
  }
  
  function renderStudents() {
    const body = $('students-body');
    if (!STUDENTS.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-center muted">هنوز دانش‌آموزی ثبت نشده</td></tr>';
      return;
    }
    body.innerHTML = STUDENTS.map(s => {
      const cls = CLASSES.find(c => c.id === s.classId);
      return '<tr>' +
        '<td>' + esc(s.name) + '</td>' +
        '<td>' + esc(s.fatherName || '') + '</td>' +
        '<td>' + esc(s.nationalId || '') + '</td>' +
        '<td>' + (cls ? esc(cls.name) : '-') + '</td>' +
        '<td><code>' + esc(s.tempPassword || '*****') + '</code></td>' +
        '<td><button class="btn btn-danger btn-sm" onclick="deleteStudent(\\'' + s.id + '\\')">🗑️</button></td>' +
      '</tr>';
    }).join('');
  }
  
  $('btn-add-student').addEventListener('click', async () => {
    const name = $('new-student-name').value.trim();
    const fatherName = $('new-student-father').value.trim();
    const nationalId = $('new-student-code').value.trim();
    const classId = $('new-student-class').value;
    
    if (!name) { toast('نام دانش‌آموز الزامی است', 'error'); return; }
    
    const res = await api('/api/teacher/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, fatherName, nationalId, classId })
    });
    
    if (res.ok && res.student) {
      // Show temporary password
      res.student.tempPassword = res.student.password;
      STUDENTS.unshift(res.student);
      renderStudents();
      toast('دانش‌آموز اضافه شد. رمز: ' + res.student.password);
      $('new-student-name').value = '';
      $('new-student-father').value = '';
      $('new-student-code').value = '';
      loadStats();
    }
  });
  
  window.deleteStudent = async id => {
    if (!confirm('آیا از حذف این دانش‌آموز مطمئن هستید؟')) return;
    await api('/api/teacher/students/' + id, { method: 'DELETE' });
    STUDENTS = STUDENTS.filter(s => s.id !== id);
    renderStudents();
    loadStats();
  };
  
  // Questions
  async function loadQuestions() {
    const res = await api('/api/teacher/questions');
    QUESTIONS = res.questions || [];
    if (res.meta) $('exam-school').value = res.meta.school || '';
    renderQuestions();
  }
  
  function renderQuestions() {
    const list = $('questions-list');
    if (!QUESTIONS.length) {
      list.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>هنوز سوالی طراحی نشده</p></div>';
      return;
    }
    list.innerHTML = QUESTIONS.map((q, i) => {
      const typeLabel = { descriptive: 'تشریحی', multiple: 'چهارگزینه‌ای', truefalse: 'صحیح/غلط', short: 'کوتاه‌پاسخ' }[q.type] || q.type;
      let optionsHtml = '';
      
      if (q.type === 'multiple') {
        optionsHtml = '<div class="row mt-2">' +
          ['الف', 'ب', 'ج', 'د'].map((lbl, oi) =>
            '<input type="text" placeholder="' + lbl + '" value="' + esc(q.options && q.options[oi] || '') + '" onchange="updateOption(' + i + ',' + oi + ',this.value)">'
          ).join('') + '</div>';
      } else if (q.type === 'truefalse') {
        optionsHtml = '<div class="mt-2"><select onchange="updateCorrect(' + i + ',this.value)"><option value="true"' + (q.correct === 'true' ? ' selected' : '') + '>صحیح</option><option value="false"' + (q.correct === 'false' ? ' selected' : '') + '>غلط</option></select></div>';
      }
      
      return '<div class="q-block">' +
        '<div class="q-head">' +
          '<b>سوال ' + (i + 1) + '</b>' +
          '<span><span class="badge badge-blue">' + typeLabel + '</span> ' +
          '<button class="btn btn-secondary btn-sm" onclick="moveQ(' + i + ',-1)">▲</button>' +
          '<button class="btn btn-secondary btn-sm" onclick="moveQ(' + i + ',1)">▼</button>' +
          '<button class="btn btn-danger btn-sm" onclick="deleteQ(' + i + ')">حذف</button></span>' +
        '</div>' +
        '<textarea placeholder="متن سوال..." onchange="updateQuestion(' + i + ',this.value)">' + esc(q.text || '') + '</textarea>' +
        optionsHtml +
      '</div>';
    }).join('');
  }
  
  window.updateQuestion = (i, text) => { QUESTIONS[i].text = text; };
  window.updateOption = (i, oi, val) => { if (!QUESTIONS[i].options) QUESTIONS[i].options = ['','','','']; QUESTIONS[i].options[oi] = val; };
  window.updateCorrect = (i, val) => { QUESTIONS[i].correct = val; };
  window.deleteQ = i => { QUESTIONS.splice(i, 1); renderQuestions(); };
  window.moveQ = (i, dir) => { const j = i + dir; if (j < 0 || j >= QUESTIONS.length) return; [QUESTIONS[i], QUESTIONS[j]] = [QUESTIONS[j], QUESTIONS[i]]; renderQuestions(); };
  
  document.querySelectorAll('[data-qtype]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.qtype;
      QUESTIONS.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        type,
        text: '',
        options: type === 'multiple' ? ['', '', '', ''] : [],
        correct: type === 'multiple' ? '0' : (type === 'truefalse' ? 'true' : '')
      });
      renderQuestions();
    });
  });
  
  $('btn-save-exam').addEventListener('click', async () => {
    const meta = { school: $('exam-school').value };
    await api('/api/teacher/questions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: QUESTIONS, meta })
    });
    toast('سوالات ذخیره شد');
  });
  
  // Submissions
  async function loadSubmissions() {
    const res = await api('/api/teacher/submissions');
    renderSubmissions(res.submissions || []);
  }
  
  function renderSubmissions(subs) {
    const list = $('submissions-list');
    if (!subs.length) {
      list.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>هنوز پاسخنامه‌ای ثبت نشده</p></div>';
      return;
    }
    list.innerHTML = '<div class="row" style="flex-wrap:wrap;gap:12px">' + subs.map(s => {
      const g = s.grading || {};
      const status = g.graded ? 'تصحیح شده' : 'در انتظار';
      const statusClass = g.graded ? 'pill-ok' : 'pill-pending';
      return '<div class="card" style="flex:1;min-width:280px">' +
        '<div class="row" style="align-items:center;margin-bottom:8px">' +
          '<h4 style="flex:1">' + esc(s.student && s.student.name || s.studentName || 'نامشخص') + '</h4>' +
          '<span class="pill ' + statusClass + '">' + status + '</span>' +
        '</div>' +
        '<p class="muted">' + esc(s.student && s.student.courseName || '') + '</p>' +
        '<p class="muted">' + formatDate(s.submittedAt) + '</p>' +
        '<div class="row mt-4">' +
          '<a class="btn btn-primary btn-sm" href="/api/teacher/word?type=answers&uuid=' + s.uuid + '" target="_blank">📥 Word</a>' +
          (!g.graded ? '<button class="btn btn-success btn-sm" onclick="gradeSubmission(\\'' + s.uuid + '\\')">✏️ تصحیح</button>' : '') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }
  
  $('btn-refresh-subs').addEventListener('click', loadSubmissions);
  loadSubmissions();
  
  // Attendance
  $('btn-load-attendance').addEventListener('click', async () => {
    const classId = $('att-class').value;
    const date = $('att-date').value;
    if (!classId || !date) { toast('لطفاً کلاس و تاریخ را انتخاب کنید', 'error'); return; }
    
    const res = await api('/api/teacher/attendance?classId=' + classId + '&date=' + date);
    const attendance = res.attendance || {};
    const studentsInClass = STUDENTS.filter(s => s.classId === classId);
    
    const grid = $('attendance-grid');
    grid.innerHTML = studentsInClass.map(s =>
      '<div class="attendance-item ' + (attendance[s.id] || 'present') + '" onclick="toggleAttendance(this,\\'' + s.id + '\\')" data-student="' + s.id + '">' +
        '<div>' + esc(s.name) + '</div>' +
        '<div style="font-size:12px">' + (attendance[s.id] === 'absent' ? 'غ' : attendance[s.id] === 'late' ? 'ت' : 'ح') + '</div>' +
      '</div>'
    ).join('');
    $('btn-save-attendance').classList.remove('hidden');
  });
  
  window.toggleAttendance = (el, studentId) => {
    el.classList.remove('present', 'absent', 'late');
    if (el.classList.contains('present')) el.classList.add('absent');
    else if (el.classList.contains('absent')) el.classList.add('late');
    else el.classList.add('present');
  };
  
  $('btn-save-attendance').addEventListener('click', async () => {
    const classId = $('att-class').value;
    const date = $('att-date').value;
    const records = {};
    document.querySelectorAll('.attendance-item').forEach(el => {
      const sid = el.dataset.student;
      if (el.classList.contains('present')) records[sid] = 'present';
      else if (el.classList.contains('absent')) records[sid] = 'absent';
      else records[sid] = 'late';
    });
    
    await api('/api/teacher/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, date, records })
    });
    toast('حضور و غیاب ذخیره شد');
  });
  
  // Grades
  $('btn-add-grade').addEventListener('click', async () => {
    const studentId = $('grade-student').value;
    const subject = $('grade-subject').value.trim();
    const score = $('grade-score').value;
    
    if (!studentId || !subject || score === '') { toast('لطفاً همه فیلدها را پر کنید', 'error'); return; }
    
    await api('/api/teacher/grades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, subject, score: parseFloat(score) })
    });
    toast('نمره ثبت شد');
    $('grade-subject').value = '';
    $('grade-score').value = '';
  });
  
  // Calendar
  let CALENDAR_EVENTS = [];
  
  async function loadCalendar() {
    const res = await api('/api/teacher/calendar');
    CALENDAR_EVENTS = res.events || [];
    renderCalendar();
  }
  
  function renderCalendar() {
    const list = $('calendar-events');
    if (!CALENDAR_EVENTS.length) {
      list.innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>رویدادی ثبت نشده</p></div>';
      return;
    }
    list.innerHTML = '<div class="row">' + CALENDAR_EVENTS.map(e => {
      const icon = e.type === 'homework' ? '📝' : e.type === 'exam' ? '📋' : '🎉';
      return '<div class="q-block" style="flex:1;min-width:200px">' +
        '<div class="row" style="align-items:center"><span style="font-size:24px;margin-left:8px">' + icon + '</span><b>' + esc(e.title) + '</b></div>' +
        '<div class="muted mt-2">' + formatDate(e.date) + '</div>' +
        '<p class="muted">' + esc(e.description || '') + '</p>' +
        '<button class="btn btn-danger btn-sm mt-2" onclick="deleteEvent(\\'' + e.id + '\\')">حذف</button>' +
      '</div>';
    }).join('') + '</div>';
  }
  
  $('btn-add-event').addEventListener('click', async () => {
    const title = $('event-title').value.trim();
    const date = $('event-date').value;
    const type = $('event-type').value;
    if (!title || !date) { toast('عنوان و تاریخ الزامی است', 'error'); return; }
    
    await api('/api/teacher/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, date, type })
    });
    toast('رویداد اضافه شد');
    $('event-title').value = '';
    loadCalendar();
  });
  
  window.deleteEvent = async id => {
    await api('/api/teacher/calendar/' + id, { method: 'DELETE' });
    loadCalendar();
  };
  
  // Settings
  async function loadSettings() {
    const res = await api('/api/teacher/meta');
    if (res.meta) {
      $('setting-school').value = res.meta.school || '';
      $('setting-phone').value = res.meta.schoolPhone || '';
    }
  }
  
  $('btn-save-settings').addEventListener('click', async () => {
    await api('/api/teacher/meta', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school: $('setting-school').value, schoolPhone: $('setting-phone').value })
    });
    toast('تنظیمات ذخیره شد');
  });
  
  $('btn-change-pass').addEventListener('click', async () => {
    const newPass = $('new-password').value;
    if (newPass.length < 4) { toast('رمز باید حداقل ۴ کاراکتر باشد', 'error'); return; }
    const res = await api('/api/teacher/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPass })
    });
    if (res.ok) {
      $('pass-msg').textContent = 'رمز با موفقیت تغییر کرد';
      $('pass-msg').style.color = 'var(--success)';
      $('new-password').value = '';
    } else {
      $('pass-msg').textContent = res.error;
      $('pass-msg').style.color = 'var(--danger)';
    }
  });
  
  // AI Chat
  let AI_MESSAGES = [];
  $('btn-ai-send').addEventListener('click', async () => {
    const input = $('ai-input');
    const text = input.value.trim();
    if (!text) return;
    
    AI_MESSAGES.push({ role: 'user', content: text });
    input.value = '';
    
    const messagesEl = $('ai-messages');
    messagesEl.innerHTML += '<div class="chat-message sent"><div>' + esc(text) + '</div></div><div class="chat-message received" id="ai-typing">در حال تایپ...</div>';
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    const res = await api('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: AI_MESSAGES })
    });
    
    const typing = $('ai-typing');
    if (typing) typing.remove();
    
    if (res.content) {
      AI_MESSAGES.push({ role: 'assistant', content: res.content });
      messagesEl.innerHTML += '<div class="chat-message received"><div>' + esc(res.content) + '</div></div>';
    } else {
      messagesEl.innerHTML += '<div class="chat-message received"><div style="color:var(--danger)">' + esc(res.error || 'خطا') + '</div></div>';
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
  
  // Tools - Scanner
  window.showTool = name => {
    ['scan', 'resize', 'table'].forEach(t => {
      $(t === 'scan' ? 'tool-scan' : 'tool-' + t).classList.add('hidden');
    });
    if (name === 'scan') $('tool-scan').classList.remove('hidden');
    else if (name === 'resize') $('tool-resize').classList.remove('hidden');
    else if (name === 'table') $('tool-table').classList.remove('hidden');
  };
  
  // Scanner Functions
  const scanDrop = $('scan-drop');
  const scanFile = $('scan-file');
  scanDrop.addEventListener('click', () => scanFile.click());
  scanDrop.addEventListener('dragover', e => { e.preventDefault(); scanDrop.classList.add('dragover'); });
  scanDrop.addEventListener('dragleave', () => scanDrop.classList.remove('dragover'));
  scanDrop.addEventListener('drop', e => { e.preventDefault(); scanDrop.classList.remove('dragover'); if (e.dataTransfer.files[0]) loadScanImg(e.dataTransfer.files[0]); });
  scanFile.addEventListener('change', () => { if (scanFile.files[0]) loadScanImg(scanFile.files[0]); });
  
  function loadScanImg(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        SCAN_IMG = img;
        $('scan-controls').classList.remove('hidden');
        scanDrop.classList.add('hidden');
        applyFilter('original');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  
  window.applyFilter = type => {
    if (!SCAN_IMG) return;
    const canvas = $('scan-canvas');
    const ctx = canvas.getContext('2d');
    const maxW = 800;
    let w = SCAN_IMG.width, h = SCAN_IMG.height;
    if (w > maxW) { h = h * maxW / w; w = maxW; }
    canvas.width = w; canvas.height = h;
    ctx.drawImage(SCAN_IMG, 0, 0, w, h);
    
    const filters = {
      original: () => {},
      bw: () => {
        const imgData = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < imgData.data.length; i += 4) {
          const gray = 0.299 * imgData.data[i] + 0.587 * imgData.data[i + 1] + 0.114 * imgData.data[i + 2];
          const val = gray > 128 ? 255 : 0;
          imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = val;
        }
        ctx.putImageData(imgData, 0, 0);
      },
      gray: () => {
        const imgData = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < imgData.data.length; i += 4) {
          const gray = 0.299 * imgData.data[i] + 0.587 * imgData.data[i + 1] + 0.114 * imgData.data[i + 2];
          imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = gray;
        }
        ctx.putImageData(imgData, 0, 0);
      },
      document: () => {
        const imgData = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < imgData.data.length; i += 4) {
          let val = 0.299 * imgData.data[i] + 0.587 * imgData.data[i + 1] + 0.114 * imgData.data[i + 2];
          val = Math.min(255, val * 1.5);
          val = val > 180 ? 255 : val * 1.4;
          imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = val;
        }
        ctx.putImageData(imgData, 0, 0);
      }
    };
    if (filters[type]) filters[type]();
  };
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.dataset.filter);
    });
  });
  
  $('btn-dl-scan').addEventListener('click', () => {
    const canvas = $('scan-canvas');
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'scan-' + Date.now() + '.png';
      a.click();
    });
  });
  
  $('btn-dl-pdf').addEventListener('click', () => {
    if (!window.jspdf) { toast('کتابخانه PDF بارگذاری نشده', 'error'); return; }
    const canvas = $('scan-canvas');
    const img = canvas.toDataURL('image/jpeg', 0.92);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'l' : 'p', unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const m = 24, aw = pw - 2 * m, ah = ph - 2 * m;
    let iw = canvas.width, ih = canvas.height;
    const ratio = Math.min(aw / iw, ah / ih);
    iw *= ratio; ih *= ratio;
    pdf.addImage(img, 'JPEG', (pw - iw) / 2, (ph - ih) / 2, iw, ih);
    pdf.save('scan.pdf');
  });
  
  $('btn-reset-scan').addEventListener('click', () => {
    SCAN_IMG = null;
    $('scan-controls').classList.add('hidden');
    scanDrop.classList.remove('hidden');
    $('scan-file').value = '';
    document.querySelector('.filter-btn[data-filter="original"]').click();
  });
  
  // Resize Tool
  const resizeDrop = $('resize-drop');
  const resizeFile = $('resize-file');
  resizeDrop.addEventListener('click', () => resizeFile.click());
  resizeDrop.addEventListener('dragover', e => { e.preventDefault(); resizeDrop.classList.add('dragover'); });
  resizeDrop.addEventListener('dragleave', () => resizeDrop.classList.remove('dragover'));
  resizeDrop.addEventListener('drop', e => { e.preventDefault(); resizeDrop.classList.remove('dragover'); handleResizeFiles(e.dataTransfer.files); });
  resizeFile.addEventListener('change', () => handleResizeFiles(resizeFile.files));
  
  function handleResizeFiles(files) {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          RESIZE_IMAGES.push({ file, img, preview: e.target.result });
          $('resize-controls').classList.remove('hidden');
          renderResizePreview();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  
  function renderResizePreview() {
    const preview = $('resize-preview');
    preview.innerHTML = RESIZE_IMAGES.map((r, i) =>
      '<div style="text-align:center;background:#f8fafc;padding:8px;border-radius:8px;border:1px solid #e2e8f0">' +
        '<img src="' + r.preview + '" style="max-width:100%;max-height:80px;border-radius:4px">' +
        '<div style="font-size:12px;color:#64748b;margin-top:4px">' + (r.file.size / 1024).toFixed(1) + ' KB</div>' +
        '<button class="btn btn-danger btn-sm" style="margin-top:4px" onclick="removeResizeImg(' + i + ')">×</button>' +
      '</div>'
    ).join('');
  }
  
  window.removeResizeImg = i => { RESIZE_IMAGES.splice(i, 1); renderResizePreview(); if (!RESIZE_IMAGES.length) $('resize-controls').classList.add('hidden'); };
  
  $('resize-quality').addEventListener('input', () => { $('quality-val').textContent = $('resize-quality').value; });
  
  document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => { document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); });
  });
  
  $('btn-resize-all').addEventListener('click', () => {
    if (!RESIZE_IMAGES.length) { toast('عکسی انتخاب نشده', 'error'); return; }
    const q = parseInt($('resize-quality').value) / 100;
    const fmt = document.querySelector('.format-btn.active').dataset.format;
    const mime = fmt === 'webp' ? 'image/webp' : 'image/jpeg';
    
    RESIZE_IMAGES.forEach((r, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = r.img.width; canvas.height = r.img.height;
      canvas.getContext('2d').drawImage(r.img, 0, 0);
      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'img-' + (i + 1) + '.' + fmt;
        a.click();
      }, mime, q);
    });
    toast('عکس‌ها فشرده شدند');
  });
  
  // Table Tool
  $('btn-add-table').addEventListener('click', () => {
    TABLES.push({ title: 'جدول جدید', rows: 5, cols: 4, data: Array(5).fill().map(() => Array(4).fill('')) });
    renderTables();
  });
  
  function renderTables() {
    const area = $('tables-area');
    if (!TABLES.length) {
      area.innerHTML = '<div class="empty-state"><div class="icon">📊</div><p>هنوز جدولی ساخته نشده</p></div>';
      return;
    }
    area.innerHTML = TABLES.map((t, ti) => {
      let html = '<div class="card mb-4"><div class="row" style="align-items:center;margin-bottom:12px">' +
        '<input type="text" value="' + esc(t.title) + '" onchange="updateTableTitle(' + ti + ',this.value)" style="flex:1">' +
        '<button class="btn btn-danger btn-sm" onclick="deleteTable(' + ti + ')">🗑️</button></div>' +
        '<div class="table-container"><table>';
      for (let r = 0; r < t.rows; r++) {
        html += '<tr>';
        for (let c = 0; c < t.cols; c++) {
          html += '<td contenteditable="true" oninput="updateTableCell(' + ti + ',' + r + ',' + c + ',this.innerText)">' + esc(t.data[r] && t.data[r][c] || '') + '</td>';
        }
        html += '</tr>';
      }
      html += '</table></div><div class="row mt-4"><input type="number" value="' + t.rows + '" min="1" max="50" onchange="resizeTable(' + ti + ',\\'rows\\',this.value)" style="width:80px"><span>سطر</span>' +
        '<input type="number" value="' + t.cols + '" min="1" max="20" onchange="resizeTable(' + ti + ',\\'cols\\',this.value)" style="width:80px"><span>ستون</span></div></div>';
      return html;
    }).join('');
  }
  
  window.updateTableTitle = (i, v) => { TABLES[i].title = v; };
  window.updateTableCell = (ti, r, c, v) => { if (!TABLES[ti].data[r]) TABLES[ti].data[r] = []; TABLES[ti].data[r][c] = v; };
  window.deleteTable = i => { TABLES.splice(i, 1); renderTables(); };
  window.resizeTable = (i, type, val) => {
    const n = Math.max(1, parseInt(val) || 1);
    const t = TABLES[i];
    if (type === 'rows') {
      while (t.data.length < n) t.data.push(Array(t.cols).fill(''));
      t.rows = n;
    } else {
      t.data.forEach(row => { while (row.length < n) row.push(''); });
      t.cols = n;
    }
    renderTables();
  };
  
  $('btn-export-excel').addEventListener('click', () => {
    if (!TABLES.length) { toast('جدولی وجود ندارد', 'error'); return; }
    let html = '<html><head><meta charset="utf-8"><style>table{direction:rtl;border-collapse:collapse}td,th{border:1px solid #000;padding:8px}</style></head><body>';
    TABLES.forEach(t => {
      html += '<h3>' + esc(t.title) + '</h3><table><tbody>';
      t.data.forEach(row => {
        html += '<tr>';
        row.forEach(cell => { html += '<td>' + esc(cell || '') + '</td>'; });
        html += '</tr>';
      });
      html += '</tbody></table><br>';
    });
    html += '</body></html>';
    const blob = new Blob(['\\ufeff' + html], { type: 'application/vnd.ms-excel' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'جداول.xls';
    a.click();
    toast('فایل Excel ساخته شد');
  });
  
  // Initialize
  checkAuth();
  loadCalendar();
  `;
}
