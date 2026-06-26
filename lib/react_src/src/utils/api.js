// ============================================================
// api.js — اتصال به Cloudflare Worker
// آدرس ورکر را اینجا تنظیم کنید
// ============================================================

export const WORKER_URL = "https://YOUR_WORKER.workers.dev"; // ← آدرس ورکر خود را اینجا بنویسید

// --------- کمک‌کننده‌ها ---------

async function request(path, options = {}, cookie = null) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (cookie) headers["Cookie"] = cookie;

  const res = await fetch(WORKER_URL + path, { ...options, headers });
  const data = await res.json();
  return { status: res.status, data };
}

// --------- احراز هویت معلم ---------

export async function teacherLogin(password) {
  return request("/api/teacher/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function teacherLogout(cookie) {
  return request("/api/teacher/logout", { method: "POST" }, cookie);
}

export async function teacherState(cookie) {
  return request("/api/teacher/state", {}, cookie);
}

export async function changePassword(newPassword, cookie) {
  return request(
    "/api/teacher/password",
    { method: "POST", body: JSON.stringify({ newPassword }) },
    cookie
  );
}

// --------- دانش‌آموزان ---------

export async function getStudents(cookie) {
  return request("/api/teacher/students", {}, cookie);
}

export async function addStudent(label, cookie) {
  return request(
    "/api/teacher/students",
    { method: "POST", body: JSON.stringify({ label }) },
    cookie
  );
}

export async function deleteStudent(uuid, cookie) {
  return request(
    `/api/teacher/students/${encodeURIComponent(uuid)}`,
    { method: "DELETE" },
    cookie
  );
}

// --------- سوالات ---------

export async function getQuestions(cookie) {
  return request("/api/teacher/questions", {}, cookie);
}

export async function saveQuestions(meta, questions, cookie) {
  return request(
    "/api/teacher/questions",
    { method: "PUT", body: JSON.stringify({ meta, questions }) },
    cookie
  );
}

// --------- پاسخنامه‌ها ---------

export async function getSubmissions(cookie) {
  return request("/api/teacher/submissions", {}, cookie);
}

export async function gradeSubmission(payload, cookie) {
  return request(
    "/api/teacher/grade",
    { method: "POST", body: JSON.stringify(payload) },
    cookie
  );
}

// --------- آزمون دانش‌آموز ---------

export async function getExam(studentUuid) {
  return request(`/api/exam/${encodeURIComponent(studentUuid)}`);
}

export async function submitExam(studentUuid, studentInfo, answers) {
  return request(`/api/exam/${encodeURIComponent(studentUuid)}/submit`, {
    method: "POST",
    body: JSON.stringify({ ...studentInfo, answers }),
  });
}

// --------- AI چت ---------

export async function aiChat(messages, cookie) {
  return request(
    "/api/teacher/ai/chat",
    { method: "POST", body: JSON.stringify({ messages }) },
    cookie
  );
}
