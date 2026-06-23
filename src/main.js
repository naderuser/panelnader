/**
 * پنل آموزشی هوشمند - نسخه وب/موبایل
 * تبدیل شده از Cloudflare Worker به اپلیکیشن مستقل
 */

// Constants
const APP_TITLE = "پنل آموزشی هوشمند";
const APP_DESIGNER = "طراح: نادر اکشیک";

const QUESTION_TYPES = {
  descriptive: "تشریحی",
  multiple: "چهارگزینه‌ای",
  truefalse: "صحیح / غلط",
  short: "کوتاه‌پاسخ",
};

// Storage helpers (using localStorage)
const Storage = {
  get(key, defaultValue = null) {
    const val = localStorage.getItem(key);
    if (val === null) return defaultValue;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  delete(key) {
    localStorage.removeItem(key);
  },
  getAll(prefix) {
    const result = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const val = localStorage.getItem(key);
        if (val) {
          try {
            result.push(JSON.parse(val));
          } catch {}
        }
      }
    }
    return result;
  }
};

// UUID generator
function uuid() {
  return crypto.randomUUID();
}

// Escape HTML
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Hash password
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// CSS Styles
const SHARED_CSS = `
  :root {
    --primary: #2563eb;
    --primary-dark: #1d4ed8;
    --success: #16a34a;
    --danger: #dc2626;
    --warning: #f59e0b;
    --bg: #f8fafc;
    --card-bg: #ffffff;
    --text: #1e293b;
    --muted: #64748b;
    --line: #e2e8f0;
    --border: #cbd5e1;
    --radius: 12px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Vazirmatn', 'Tahoma', sans-serif; background: var(--bg); color: var(--text); direction: rtl; min-height: 100vh; }
  .wrap { max-width: 600px; margin: 0 auto; padding: 12px; }
  .header { text-align: center; padding: 16px; background: var(--card-bg); border-radius: var(--radius); margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header h1 { font-size: 20px; color: var(--primary); }
  .header h2 { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .card { background: var(--card-bg); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .card h3 { font-size: 16px; margin-bottom: 12px; color: var(--text); }
  .btn { display: inline-block; padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-family: inherit; text-decoration: none; text-align: center; }
  .btn:hover { background: var(--primary-dark); }
  .btn.sec { background: var(--success); }
  .btn.gray { background: var(--muted); }
  .btn.sm { padding: 6px 12px; font-size: 12px; }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  input, textarea, select { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-family: inherit; margin-bottom: 10px; background: white; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: var(--primary); }
  label { display: block; font-size: 13px; margin-bottom: 4px; color: var(--muted); }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .row > * { flex: 1; min-width: 120px; }
  .hidden { display: none !important; }
  .muted { color: var(--muted); font-size: 13px; }
  .success { color: var(--success); }
  .danger { color: var(--danger); }
  .tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; background: var(--card-bg); padding: 8px; border-radius: var(--radius); }
  .tab { padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; background: var(--bg); border: none; font-family: inherit; }
  .tab.active { background: var(--primary); color: white; }
  .tab-content { display: none; }
  .tab-content.active { display: block; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  th, td { border: 1px solid var(--border); padding: 8px; text-align: right; }
  th { background: var(--bg); font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; background: var(--primary); color: white; border-radius: 4px; font-size: 11px; margin-right: 8px; }
  .q-block { background: var(--bg); padding: 12px; border-radius: 8px; margin-bottom: 12px; }
  .q-block textarea { min-height: 80px; }
  .opt-row { padding: 6px 0; }
  .opt-row input { width: auto; margin-left: 8px; }
  .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--text); color: white; padding: 12px 24px; border-radius: 8px; font-size: 14px; z-index: 1000; opacity: 0; transition: opacity 0.3s; }
  .toast.show { opacity: 1; }
  .mark { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  .mark.correct { background: #dcfce7; color: var(--success); }
  .mark.wrong { background: #fee2e2; color: var(--danger); }
  .mark.partial { background: #fef3c7; color: var(--warning); }
  .student-item { display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--bg); border-radius: 8px; margin-bottom: 8px; }
  .student-item .info { flex: 1; }
  .student-item .link-btn { font-size: 12px; padding: 6px 12px; }
  .delete-btn { background: var(--danger); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
  .status-badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; }
  .status-badge.pending { background: #fef3c7; color: var(--warning); }
  .status-badge.submitted { background: #dbeafe; color: var(--primary); }
  .status-badge.graded { background: #dcfce7; color: var(--success); }
  @media (max-width: 480px) {
    .wrap { padding: 8px; }
    .tabs { gap: 4px; }
    .tab { padding: 6px 10px; font-size: 12px; }
    .row { flex-direction: column; }
    .row > * { min-width: 100%; }
  }
`;

// Font link
const FONT_LINK = '<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap" rel="stylesheet">';

// Toast notification
function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// Page Router
class Router {
  constructor() {
    this.routes = {};
    this.currentPath = window.location.pathname;
    window.addEventListener('popstate', () => this.render());
  }

  add(path, handler) {
    this.routes[path] = handler;
  }

  navigate(path) {
    window.history.pushState({}, '', path);
    this.currentPath = path;
    this.render();
  }

  render() {
    const path = window.location.pathname;
    const handler = this.routes[path] || this.routes['/'];
    if (handler) {
      document.getElementById('app').innerHTML = handler();
      if (typeof initApp === 'function') initApp();
    }
  }

  start() {
    this.render();
  }
}

const router = new Router();

// ========== PAGES ==========

// Landing Page
router.add('/', () => `
  <div class="header">
    <h1>${esc(APP_TITLE)}</h1>
    <h2>${esc(APP_DESIGNER)}</h2>
  </div>
  <div class="card">
    <p>دانش‌آموز گرامی، برای شرکت در آزمون از <b>لینک اختصاصی</b> که معلم برای شما ارسال کرده استفاده کنید.</p>
    <p class="muted" style="margin-top: 8px;">هر دانش‌آموز یک لینک منحصربه‌فرد دارد.</p>
    <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
    <a class="btn" href="/teacher">ورود معلم</a>
  </div>
`);

// Teacher Login Page
router.add('/teacher', () => {
  const hasPassword = Storage.get('teacher_pass');
  return `
    <div class="header">
      <h1>${esc(APP_TITLE)}</h1>
      <h2>پنل معلم</h2>
    </div>
    <div class="card" id="login-card">
      <h3>ورود معلم</h3>
      <p class="muted" id="login-hint">${hasPassword ? 'رمز عبور خود را وارد کنید' : 'اولین ورود: لطفاً رمز عبور جدید تعیین کنید'}</p>
      <input type="password" id="password-input" placeholder="رمز عبور" autocomplete="current-password">
      <p class="muted danger" id="login-error"></p>
      <button class="btn" id="login-btn">ورود</button>
    </div>
    <div class="card hidden" id="dashboard-card">
      <div class="tabs" id="main-tabs">
        <button class="tab active" data-tab="students">👨‍🎓 دانش‌آموزان</button>
        <button class="tab" data-tab="questions">📝 سوالات</button>
        <button class="tab" data-tab="answers">✅ تصحیح</button>
        <button class="tab" data-tab="settings">⚙️ تنظیمات</button>
      </div>
      
      <!-- Students Tab -->
      <div class="tab-content active" id="tab-students">
        <h3>ساخت دانش‌آموز جدید</h3>
        <div class="row">
          <input id="new-label" placeholder="نام دانش‌آموز (اختیاری)">
          <button class="btn" id="btn-add-student">+ ساخت لینک</button>
        </div>
        <p class="muted">هر دانش‌آموز یک لینک منحصربه‌فرد دارد.</p>
        <div id="students-list"></div>
      </div>
      
      <!-- Questions Tab -->
      <div class="tab-content" id="tab-questions">
        <h3>سربرگ آزمون</h3>
        <input id="m-school" placeholder="نام مدرسه">
        <input id="m-exam-name" placeholder="نام آزمون">
        <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
        <h3>سوالات</h3>
        <div id="q-list"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn gray sm" data-add="descriptive">+ تشریحی</button>
          <button class="btn gray sm" data-add="multiple">+ چهارگزینه‌ای</button>
          <button class="btn gray sm" data-add="truefalse">+ صحیح/غلط</button>
          <button class="btn gray sm" data-add="short">+ کوتاه‌پاسخ</button>
        </div>
        <div style="margin-top:16px">
          <button class="btn" id="btn-save-q">ذخیره سوالات</button>
        </div>
      </div>
      
      <!-- Answers Tab -->
      <div class="tab-content" id="tab-answers">
        <h3>پاسخنامه‌ها و تصحیح</h3>
        <button class="btn gray sm" id="btn-refresh-ans">به‌روزرسانی</button>
        <div id="answers-list"></div>
      </div>
      
      <!-- Settings Tab -->
      <div class="tab-content" id="tab-settings">
        <h3>تنظیمات</h3>
        <button class="btn" id="btn-logout" style="background: var(--danger);">🚪 خروج از پنل معلم</button>
      </div>
    </div>
  `;
});

// Student Exam Page
router.add(/^\/exam\/([^\/]+)$/, (id) => {
  return `
    <div class="header">
      <h1>آزمون آنلاین</h1>
    </div>
    <div class="card" id="student-hdr"></div>
    <div class="card hidden" id="step-info">
      <h3>اطلاعات دانش‌آموز</h3>
      <input id="f-name" placeholder="نام و نام خانوادگی *">
      <input id="f-father" placeholder="نام پدر *">
      <input id="f-nid" placeholder="کد ملی *" inputmode="numeric">
      <input id="f-course" placeholder="نام آزمون *">
      <label>سوال امنیتی: <span id="sec-q"></span> *</label>
      <input id="f-sec" inputmode="numeric" placeholder="پاسخ">
      <p class="muted danger" id="info-err"></p>
      <button class="btn" id="btn-enter">ورود به آزمون</button>
    </div>
    <div class="card hidden" id="step-exam">
      <h3>سوالات آزمون</h3>
      <div id="questions"></div>
      <button class="btn sec" id="btn-submit" style="margin-top:16px">ثبت نهایی پاسخنامه</button>
    </div>
    <div class="card hidden" id="step-done"></div>
  `;
});

// ========== INITIALIZATION ==========

function initApp() {
  const path = window.location.pathname;
  
  if (path === '/teacher') {
    initTeacherPage();
  } else if (path.startsWith('/exam/')) {
    const id = path.match(/^\/exam\/([^\/]+)$/)?.[1];
    if (id) initStudentPage(id);
  }
}

async function initTeacherPage() {
  const isLoggedIn = sessionStorage.getItem('teacher_auth') === 'true';
  
  if (!isLoggedIn) {
    initLogin();
  } else {
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('dashboard-card').classList.remove('hidden');
    initDashboard();
  }
}

async function initLogin() {
  const btn = document.getElementById('login-btn');
  const input = document.getElementById('password-input');
  const error = document.getElementById('login-error');
  
  btn.onclick = async () => {
    const pass = input.value.trim();
    if (pass.length < 4) {
      error.textContent = 'رمز باید حداقل ۴ کاراکتر باشد';
      return;
    }
    
    const hash = await sha256(pass);
    const stored = Storage.get('teacher_pass');
    
    if (!stored) {
      Storage.set('teacher_pass', hash);
      sessionStorage.setItem('teacher_auth', 'true');
      router.navigate('/teacher');
      showToast('رمز عبور تنظیم شد ✅');
    } else if (hash === stored) {
      sessionStorage.setItem('teacher_auth', 'true');
      router.navigate('/teacher');
    } else {
      error.textContent = 'رمز عبور اشتباه است';
    }
  };
  
  input.onkeypress = (e) => {
    if (e.key === 'Enter') btn.click();
  };
}

function initDashboard() {
  // Tab switching
  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    };
  });
  
  // Load data
  loadStudents();
  loadQuestions();
  loadAnswers();
  
  // Event listeners
  initStudentsTab();
  initQuestionsTab();
  initAnswersTab();
  initSettingsTab();
}

function initStudentsTab() {
  const btn = document.getElementById('btn-add-student');
  const labelInput = document.getElementById('new-label');
  
  btn.onclick = () => {
    const label = labelInput.value.trim();
    const id = uuid();
    const student = { uuid: id, label, createdAt: Date.now() };
    Storage.set('student:' + id, student);
    labelInput.value = '';
    loadStudents();
    showToast('لینک ساخته شد ✅');
  };
}

function loadStudents() {
  const students = Storage.getAll('student:');
  students.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  
  const list = document.getElementById('students-list');
  if (!students.length) {
    list.innerHTML = '<p class="muted">هنوز دانش‌آموزی ساخته نشده است.</p>';
    return;
  }
  
  list.innerHTML = students.map(s => {
    const subKey = 'submission:' + s.uuid;
    const hasSubmission = Storage.get(subKey);
    const status = hasSubmission ? 
      (hasSubmission.grading?.graded ? '<span class="status-badge graded">تصحیح شده</span>' : '<span class="status-badge submitted">ثبت شده</span>') 
      : '<span class="status-badge pending">در انتظار</span>';
    
    const link = `${window.location.origin}/exam/${s.uuid}`;
    
    return `
      <div class="student-item">
        <div class="info">
          <strong>${esc(s.label || 'دانش‌آموز')}</strong>
          <br><small class="muted">${status}</small>
        </div>
        <button class="btn link-btn" onclick="copyLink('${link}')">📋 کپی لینک</button>
        <button class="delete-btn" onclick="deleteStudent('${s.uuid}')">حذف</button>
      </div>
    `;
  }).join('');
}

window.copyLink = (link) => {
  navigator.clipboard.writeText(link);
  showToast('لینک کپی شد ✅');
};

window.deleteStudent = (id) => {
  if (confirm('آیا از حذف این دانش‌آموز مطمئن هستید؟')) {
    Storage.delete('student:' + id);
    Storage.delete('submission:' + id);
    loadStudents();
    showToast('حذف شد ✅');
  }
};

function initQuestionsTab() {
  const meta = Storage.get('meta', {});
  document.getElementById('m-school').value = meta.school || '';
  document.getElementById('m-exam-name').value = meta.examName || '';
  
  // Add question buttons
  document.querySelectorAll('[data-add]').forEach(btn => {
    btn.onclick = () => addQuestion(btn.dataset.add);
  });
  
  // Save button
  document.getElementById('btn-save-q').onclick = saveQuestions;
  
  renderQuestions();
}

function loadQuestions() {
  renderQuestions();
}

function renderQuestions() {
  const questions = Storage.get('questions', []);
  const list = document.getElementById('q-list');
  
  if (!questions.length) {
    list.innerHTML = '<p class="muted">هنوز سوالی اضافه نشده است.</p>';
    return;
  }
  
  list.innerHTML = questions.map((q, i) => `
    <div class="q-block" data-index="${i}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>سوال ${i + 1} - ${QUESTION_TYPES[q.type] || q.type}</strong>
        <button class="btn gray sm" onclick="removeQuestion(${i})">حذف</button>
      </div>
      ${q.type === 'multiple' ? `
        <textarea data-field="text" placeholder="متن سوال">${esc(q.text || '')}</textarea>
        ${[0,1,2,3].map(oi => `
          <input type="text" data-option="${oi}" value="${esc(q.options?.[oi] || '')}" placeholder="گزینه ${['الف','ب','ج','د'][oi]}">
        `).join('')}
        <label>پاسخ صحیح:</label>
        <select data-correct>
          <option value="">انتخاب کنید</option>
          <option value="0" ${q.correct === 0 ? 'selected' : ''}>الف</option>
          <option value="1" ${q.correct === 1 ? 'selected' : ''}>ب</option>
          <option value="2" ${q.correct === 2 ? 'selected' : ''}>ج</option>
          <option value="3" ${q.correct === 3 ? 'selected' : ''}>د</option>
        </select>
      ` : q.type === 'truefalse' ? `
        <textarea data-field="text" placeholder="متن سوال">${esc(q.text || '')}</textarea>
        <label>پاسخ صحیح:</label>
        <select data-correct>
          <option value="">انتخاب کنید</option>
          <option value="true" ${q.correct === 'true' ? 'selected' : ''}>صحیح</option>
          <option value="false" ${q.correct === 'false' ? 'selected' : ''}>غلط</option>
        </select>
      ` : `
        <textarea data-field="text" placeholder="متن سوال">${esc(q.text || '')}</textarea>
        ${q.type === 'short' ? '<input type="text" data-correct placeholder="پاسخ کوتاه (برای تصحیح خودکار)">' : ''}
      `}
    </div>
  `).join('');
}

function addQuestion(type) {
  const questions = Storage.get('questions', []);
  const newQ = {
    id: uuid(),
    type,
    text: '',
    options: type === 'multiple' ? ['', '', '', ''] : [],
    correct: type === 'multiple' ? '' : (type === 'truefalse' ? 'true' : ''),
    order: questions.length
  };
  questions.push(newQ);
  Storage.set('questions', questions);
  renderQuestions();
}

window.removeQuestion = (index) => {
  const questions = Storage.get('questions', []);
  questions.splice(index, 1);
  Storage.set('questions', questions);
  renderQuestions();
};

function saveQuestions() {
  const blocks = document.querySelectorAll('#q-list .q-block');
  const questions = [];
  
  blocks.forEach(block => {
    const text = block.querySelector('[data-field="text"]')?.value || '';
    const correct = block.querySelector('[data-correct]')?.value || '';
    const options = block.querySelectorAll('[data-option]');
    
    questions.push({
      id: uuid(),
      type: 'descriptive',
      text,
      options: options.length ? Array.from(options).map(o => o.value) : [],
      correct,
      order: questions.length
    });
  });
  
  Storage.set('questions', questions);
  Storage.set('meta', {
    school: document.getElementById('m-school').value,
    examName: document.getElementById('m-exam-name').value
  });
  
  showToast('سوالات ذخیره شد ✅');
}

function initAnswersTab() {
  document.getElementById('btn-refresh-ans').onclick = loadAnswers;
  loadAnswers();
}

function loadAnswers() {
  const submissions = Storage.getAll('submission:');
  submissions.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  
  const list = document.getElementById('answers-list');
  if (!submissions.length) {
    list.innerHTML = '<p class="muted">هنوز پاسخنامه‌ای ثبت نشده است.</p>';
    return;
  }
  
  list.innerHTML = submissions.map(sub => {
    const status = sub.grading?.graded ? 
      '<span class="status-badge graded">تصحیح شده</span>' : 
      '<span class="status-badge submitted">در انتظار تصحیح</span>';
    
    return `
      <div class="q-block">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${esc(sub.student?.name || 'نامشخص')}</strong>
            <br><small>${status} - ${new Date(sub.submittedAt).toLocaleDateString('fa-IR')}</small>
          </div>
          <button class="btn sec sm" onclick="openGradeModal('${sub.uuid}')">تصحیح</button>
        </div>
      </div>
    `;
  }).join('');
}

window.openGradeModal = (uuid) => {
  const sub = Storage.get('submission:' + uuid);
  if (!sub) return;
  
  const questions = sub.questionsSnapshot || [];
  const answers = sub.answers || {};
  
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';
  modal.innerHTML = `
    <div class="card" style="max-width:600px;width:100%;max-height:90vh;overflow-y:auto">
      <h3>تصحیح: ${esc(sub.student?.name || '')}</h3>
      ${questions.map((q, i) => `
        <div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:8px">
          <p><strong>${i + 1}. ${esc(q.text || 'سوال')}</strong></p>
          <p class="muted">پاسخ دانش‌آموز: ${esc(answers[q.id] || 'بدون پاسخ')}</p>
          <div style="margin-top:8px">
            <label>امتیاز:</label>
            <select data-grade="${q.id}" style="margin-bottom:8px">
              <option value="">بدون نمره</option>
              <option value="correct">صحیح ✓</option>
              <option value="partial">نیمه‌درست ~</option>
              <option value="wrong">غلط ✗</option>
            </select>
            <textarea data-feedback="${q.id}" placeholder="بازخورد (اختیاری)"></textarea>
          </div>
        </div>
      `).join('')}
      <div style="margin-top:16px">
        <label>بازخورد کلی:</label>
        <textarea id="modal-overall" placeholder="توضیحات کلی...">${esc(sub.grading?.overall || '')}</textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn" onclick="saveGrade('${uuid}')">ذخیره</button>
        <button class="btn gray" onclick="this.closest('.card').parentElement.remove()">بستن</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.saveGrade = (uuid) => {
  const sub = Storage.get('submission:' + uuid);
  if (!sub) return;
  
  const marks = {};
  const feedback = {};
  
  document.querySelectorAll('[data-grade]').forEach(sel => {
    marks[sel.dataset.grade] = sel.value;
  });
  
  document.querySelectorAll('[data-feedback]').forEach(ta => {
    if (ta.value.trim()) {
      feedback[ta.dataset.feedback] = ta.value;
    }
  });
  
  sub.grading = {
    graded: true,
    overall: document.getElementById('modal-overall').value,
    marks,
    feedback,
    gradedAt: Date.now()
  };
  
  Storage.set('submission:' + uuid, sub);
  
  document.querySelector('.card > div[style*="position:fixed"]')?.remove();
  document.querySelector('div[style*="position:fixed"]')?.remove();
  
  loadAnswers();
  showToast('تصحیح ذخیره شد ✅');
};

function initSettingsTab() {
  document.getElementById('btn-logout').onclick = () => {
    if (confirm('آیا می‌خواهید از پنل معلم خارج شوید؟')) {
      sessionStorage.removeItem('teacher_auth');
      router.navigate('/');
    }
  };
}

// ========== STUDENT PAGE ==========

async function initStudentPage(id) {
  const student = Storage.get('student:' + id);
  const hdr = document.getElementById('student-hdr');
  const meta = Storage.get('meta', {});
  
  hdr.innerHTML = `<h3>${esc(meta.school || 'آزمون آنلاین')}</h3>` +
    (meta.examName ? `<p class="muted">${esc(meta.examName)}</p>` : '');
  
  if (!student) {
    document.getElementById('step-info').outerHTML = `
      <div class="card">
        <h2>لینک نامعتبر است</h2>
        <p class="muted">این لینک معتبر نیست یا حذف شده است.</p>
      </div>
    `;
    return;
  }
  
  const submission = Storage.get('submission:' + id);
  if (submission) {
    renderStudentResult(submission);
    return;
  }
  
  document.getElementById('step-info').classList.remove('hidden');
  
  // Security question
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 2;
  document.getElementById('sec-q').textContent = `${a} + ${b} = ?`;
  
  document.getElementById('btn-enter').onclick = () => {
    const name = document.getElementById('f-name').value.trim();
    const father = document.getElementById('f-father').value.trim();
    const nid = document.getElementById('f-nid').value.trim();
    const course = document.getElementById('f-course').value.trim();
    const sec = document.getElementById('f-sec').value.trim();
    const err = document.getElementById('info-err');
    
    if (!name || !father || !nid || !course) {
      err.textContent = 'لطفاً همه فیلدها را پر کنید.';
      return;
    }
    
    if (parseInt(sec, 10) !== a + b) {
      err.textContent = 'پاسخ سوال امنیتی اشتباه است.';
      return;
    }
    
    err.textContent = '';
    window._student = { name, fatherName: father, nationalId: nid, courseName: course };
    document.getElementById('step-info').classList.add('hidden');
    document.getElementById('step-exam').classList.remove('hidden');
    renderExamQuestions();
  };
  
  document.getElementById('btn-submit').onclick = () => {
    const answers = {};
    document.querySelectorAll('[data-q]').forEach(el => {
      answers[el.dataset.q] = el.value;
    });
    
    const submission = {
      uuid: id,
      student: window._student,
      answers,
      meta: Storage.get('meta', {}),
      questionsSnapshot: Storage.get('questions', []),
      submittedAt: Date.now(),
      grading: null
    };
    
    Storage.set('submission:' + id, submission);
    document.getElementById('step-exam').classList.add('hidden');
    renderStudentResult(submission);
  };
}

function renderExamQuestions() {
  const questions = Storage.get('questions', []);
  const box = document.getElementById('questions');
  
  if (!questions.length) {
    box.innerHTML = '<p class="muted">هنوز سوالی تعریف نشده است.</p>';
    return;
  }
  
  box.innerHTML = questions.map((q, i) => {
    let body = '';
    
    if (q.type === 'multiple') {
      body = (q.options || []).map((o, oi) => `
        <div class="opt-row">
          <label style="font-weight:400">
            <input type="radio" name="q_${q.id}" value="${oi}" style="width:auto;margin-left:6px">
            ${['الف','ب','ج','د'][oi]}) ${esc(o)}
          </label>
        </div>
      `).join('');
    } else if (q.type === 'truefalse') {
      body = `
        <div class="opt-row">
          <label style="font-weight:400"><input type="radio" name="q_${q.id}" value="true" style="width:auto;margin-left:6px"> صحیح</label>
          <label style="font-weight:400"><input type="radio" name="q_${q.id}" value="false" style="width:auto;margin-left:6px"> غلط</label>
        </div>
      `;
    } else if (q.type === 'short') {
      body = `<input type="text" data-q="${q.id}" autocomplete="off">`;
    } else {
      body = `<textarea data-q="${q.id}"></textarea>`;
    }
    
    return `
      <div class="q-block">
        <div class="qhead"><b>${i + 1}. ${esc(q.text || 'سوال')}</b></div>
        ${body}
      </div>
    `;
  }).join('');
}

function renderStudentResult(sub) {
  const done = document.getElementById('step-done');
  done.classList.remove('hidden');
  
  if (!sub.grading?.graded) {
    done.innerHTML = `
      <h2>✅ پاسخنامه ثبت شد</h2>
      <p class="muted">پاسخ‌های شما ثبت شد. نتیجه پس از تصحیح معلم نمایش داده می‌شود.</p>
    `;
    return;
  }
  
  const g = sub.grading;
  const questions = sub.questionsSnapshot || [];
  const answers = sub.answers || {};
  
  const rows = questions.map((q, i) => {
    const ans = answers[q.id];
    const mark = g.marks?.[q.id] || '';
    const fb = g.feedback?.[q.id] || '';
    const mlabel = { correct: 'صحیح', wrong: 'غلط', partial: 'نیمه‌درست' }[mark] || '';
    
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(q.text || 'سوال')}</td>
        <td>${esc(ans || 'بدون پاسخ')}</td>
        <td><span class="mark ${mark}">${mlabel}</span></td>
        <td>${esc(fb)}</td>
      </tr>
    `;
  }).join('');
  
  done.innerHTML = `
    <h2>نتیجه آزمون</h2>
    <p class="muted">نام: ${esc(sub.student?.name || '')} | آزمون: ${esc(sub.student?.courseName || '')}</p>
    <table>
      <tr><th>#</th><th>سوال</th><th>پاسخ شما</th><th>وضعیت</th><th>بازخورد</th></tr>
      ${rows}
    </table>
    ${g.overall ? `<p style="margin-top:12px;background:#f0fdf4;padding:10px;border-radius:8px"><b>بازخورد معلم:</b> ${esc(g.overall)}</p>` : ''}
  `;
}

// Start the app
document.addEventListener('DOMContentLoaded', () => {
  // Add font
  document.head.insertAdjacentHTML('beforeend', FONT_LINK);
  
  // Start router
  router.start();
});