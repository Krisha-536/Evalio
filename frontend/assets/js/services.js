/* =========================================================
   Evalio – application services (business logic)
   Grouped by the modules in Exp 7 "Architectural Design".
   The comment above each function names the REST endpoint
   it will call once the backend exists.
   ========================================================= */

/* ---------------- Activity log ---------------- */
const Log = {
  add(user_role, user_id, activity_type, details, exam_id = null) {
    return DB.insert('activity_logs', { user_role, user_id, exam_id, activity_type, details, logged_at: EV.nowIso() });
  }
};

/* ---------------- Notifications ---------------- */
const Notify = {
  // POST /api/notifications
  add(recipient_role, recipient_id, title, message, link = '') {
    return DB.insert('notifications', { recipient_role, recipient_id, title, message, link, is_read: false, created_at: EV.nowIso() });
  },
  toCourse(course_id, title, message, link) {
    DB.where('students', s => s.course_id === course_id && s.status === 'Active')
      .forEach(s => this.add('student', s.student_id, title, message, link));
  },
  // GET /api/notifications
  forUser(session) {
    return DB.where('notifications', n => n.recipient_role === session.role && n.recipient_id === session.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  markRead(id) { DB.update('notifications', id, { is_read: true }); },
  markAllRead(session) { this.forUser(session).forEach(n => !n.is_read && this.markRead(n.notification_id)); }
};

/* ---------------- 1. User Authentication Module ---------------- */
const Auth = (() => {
  const KEY = 'evalio_session';
  const tableFor = role => (role === 'admin' ? 'admins' : 'students');
  const pkFor = role => (role === 'admin' ? 'admin_id' : 'student_id');

  function current() {
    const raw = sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function clear() { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); }

  // POST /api/auth/login
  function login(identifier, password, role, remember) {
    const id = identifier.trim().toLowerCase();
    const user = role === 'admin'
      ? DB.find('admins', a => a.email.toLowerCase() === id)
      : DB.find('students', s => s.email.toLowerCase() === id || s.enrollment_no.toLowerCase() === id);
    // NOTE: the backend compares a bcrypt hash; plain text is only for this offline prototype.
    if (!user || user.password !== password) {
      if (user) Log.add(role, user[pkFor(role)], 'LOGIN_FAILED', 'Invalid password');
      throw new Error('Invalid credentials. Please check your details and try again.');
    }
    if (user.status !== 'Active') throw new Error('Your account is inactive. Please contact the administrator.');

    // Single-device login: a new token invalidates any older session of the same user.
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    DB.update(tableFor(role), user[pkFor(role)], { active_session: token, last_login: EV.nowIso() });
    const session = { role, id: user[pkFor(role)], name: user.name, token };
    clear();
    (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session));
    Log.add(role, session.id, 'LOGIN', 'Signed in');
    return session;
  }

  // POST /api/auth/logout
  function logout() {
    const s = current();
    if (s) {
      Log.add(s.role, s.id, 'LOGOUT', 'Signed out');
      const u = DB.get(tableFor(s.role), s.id);
      if (u && u.active_session === s.token) DB.update(tableFor(s.role), s.id, { active_session: null });
    }
    clear();
    location.href = '../index.html';
  }

  /** Is this browser session still the user's active one? */
  function valid(s) {
    const u = s && DB.get(tableFor(s.role), s.id);
    return !!(u && u.status === 'Active' && u.active_session === s.token);
  }

  /** Role-based access guard used at the top of every protected page. */
  function require(role) {
    const s = current();
    if (!s || s.role !== role) { location.replace('../index.html'); return null; }
    if (!valid(s)) { clear(); location.replace('../index.html?reason=session'); return null; }
    return { ...s, user: DB.get(tableFor(role), s.id) };
  }

  return { current, login, logout, require, valid, clear };
})();

/* ---------------- 2/3. Examination & Question Management ---------------- */
const Exams = {
  schedule(exam_id) { return DB.find('schedules', s => s.exam_id === exam_id); },

  /** Live status derived from the schedule: Draft / Scheduled / Active / Completed. */
  status(exam) {
    if (exam.status === 'Draft') return 'Draft';
    const sc = this.schedule(exam.exam_id);
    if (!sc) return 'Draft';
    const now = Date.now();
    if (now < Date.parse(sc.start_time)) return 'Scheduled';
    if (now <= Date.parse(sc.end_time)) return 'Active';
    return 'Completed';
  },

  // GET /api/exams/{id}/questions
  questions(exam_id) {
    return DB.where('exam_questions', l => l.exam_id === exam_id)
      .sort((a, b) => a.question_order - b.question_order)
      .map(l => DB.get('questions', l.question_id))
      .filter(Boolean);
  },
  questionCount(exam_id) { return DB.count('exam_questions', l => l.exam_id === exam_id); },
  courseName(course_id) { const c = DB.get('courses', course_id); return c ? c.course_name : '—'; },

  /** Replace an exam's question list and recompute total marks. */
  setQuestions(exam_id, questionIds) {
    DB.removeWhere('exam_questions', l => l.exam_id === exam_id);
    questionIds.forEach((qid, i) => DB.insert('exam_questions', { exam_id, question_id: qid, question_order: i + 1 }));
    const total = EV.sum(questionIds.map(id => (DB.get('questions', id) || {}).marks));
    DB.update('examinations', exam_id, { total_marks: total });
  },

  // GET /api/student/exams
  forStudent(student) {
    return DB.where('examinations', e => e.course_id === student.course_id && e.status !== 'Draft').map(exam => ({
      exam,
      status: this.status(exam),
      schedule: this.schedule(exam.exam_id),
      questionCount: this.questionCount(exam.exam_id),
      attempt: Attempts.get(student.student_id, exam.exam_id),
      result: DB.find('results', r => r.exam_id === exam.exam_id && r.student_id === student.student_id)
    }));
  },

  statusBadge(status) {
    const map = { Active: 'success live', Scheduled: 'info', Completed: 'neutral', Draft: 'warning' };
    const label = status === 'Active' ? 'Live' : status;
    return `<span class="ev-badge ${map[status] || 'neutral'}"><span class="dot"></span>${label}</span>`;
  }
};

/* ---------------- 4/5. Examination Attempt + Timer & Submission ---------------- */
const Attempts = {
  get(student_id, exam_id) { return DB.find('attempts', a => a.student_id === student_id && a.exam_id === exam_id); },

  // POST /api/exams/{id}/attempts
  start(student, exam) {
    const existing = this.get(student.student_id, exam.exam_id);
    if (existing) return existing;
    const rand = EV.rng(student.student_id * 7919 + exam.exam_id * 104729);
    const ids = Exams.questions(exam.exam_id).map(q => q.question_id);
    const question_order = exam.shuffle_questions ? EV.shuffle(ids, rand) : ids;
    const option_order = {};
    ids.forEach(id => { option_order[id] = exam.shuffle_options ? EV.shuffle(EV.OPTIONS, rand) : EV.OPTIONS.slice(); });
    const now = EV.nowIso();
    const attempt = DB.insert('attempts', {
      exam_id: exam.exam_id, student_id: student.student_id, started_at: now, last_activity: now, submitted_at: null,
      status: 'in_progress', question_order, option_order, responses: {}, marked: {}, current_index: 0, tab_switches: 0, simulated: false
    });
    Log.add('student', student.student_id, 'EXAM_START', `Started ${exam.exam_name}`, exam.exam_id);
    return attempt;
  },

  // PATCH /api/attempts/{id}   (auto-save)
  save(attempt_id, patch) { return DB.update('attempts', attempt_id, { ...patch, last_activity: EV.nowIso() }); },

  // PUT /api/attempts/{id}/answers/{questionId}   (Answer table: saved_at)
  saveAnswer(attempt, question_id, selected_option) {
    const where = a => a.exam_id === attempt.exam_id && a.student_id === attempt.student_id && a.question_id === question_id;
    const row = DB.find('answers', where);
    if (!selected_option) { if (row) DB.remove('answers', row.answer_id); return; }
    const data = { selected_option, is_correct: null, marks_obtained: null, saved_at: EV.nowIso() };
    if (row) DB.update('answers', row.answer_id, data);
    else DB.insert('answers', { exam_id: attempt.exam_id, student_id: attempt.student_id, question_id, ...data });
  },

  /** Seconds left: limited by both the exam duration and the schedule end time. */
  remaining(attempt, exam) {
    let end = Date.parse(attempt.started_at) + exam.duration * 60000;
    const sc = Exams.schedule(exam.exam_id);
    if (sc) end = Math.min(end, Date.parse(sc.end_time));
    return Math.max(0, Math.floor((end - Date.now()) / 1000));
  }
};

/* ---------------- 6/7. Evaluation + Result Management ---------------- */
const Results = {
  // POST /api/attempts/{id}/submit  → server evaluates and returns the Result
  submit(attempt, auto = false) {
    const exam = DB.get('examinations', attempt.exam_id);
    const done = DB.find('results', r => r.exam_id === exam.exam_id && r.student_id === attempt.student_id);
    if (done) return done;
    const qs = Exams.questions(exam.exam_id);
    const { graded, result } = EV.evaluate(exam, qs, attempt.responses || {});
    const now = EV.nowIso();

    graded.forEach(g => {
      const row = DB.find('answers', a => a.exam_id === exam.exam_id && a.student_id === attempt.student_id && a.question_id === g.question_id);
      if (!g.selected_option) { if (row) DB.remove('answers', row.answer_id); return; }
      const data = { selected_option: g.selected_option, is_correct: g.is_correct, marks_obtained: g.marks_obtained };
      if (row) DB.update('answers', row.answer_id, data);
      else DB.insert('answers', { exam_id: exam.exam_id, student_id: attempt.student_id, question_id: g.question_id, ...data, saved_at: now });
    });

    const time_taken = Math.min(exam.duration * 60, Math.round((Date.now() - Date.parse(attempt.started_at)) / 1000));
    const saved = DB.insert('results', { exam_id: exam.exam_id, student_id: attempt.student_id, ...result, time_taken, generated_at: now });
    DB.update('attempts', attempt.attempt_id, { status: auto ? 'auto_submitted' : 'submitted', submitted_at: now, last_activity: now });
    Log.add('student', attempt.student_id, auto ? 'AUTO_SUBMIT' : 'EXAM_SUBMIT',
      `${auto ? 'Auto-submitted' : 'Submitted'} ${exam.exam_name} – ${result.score}/${exam.total_marks}`, exam.exam_id);
    if (this.visible(exam)) {
      Notify.add('student', attempt.student_id, 'Result available', `Your result for ${exam.exam_name} is ready.`, `result.html?id=${saved.result_id}`);
    }
    return saved;
  },

  visible(exam) { return exam.result_mode === 'instant' || !!exam.result_published; },

  // POST /api/exams/{id}/results/publish
  publish(exam_id, published = true) {
    const exam = DB.update('examinations', exam_id, { result_published: published });
    if (published) {
      DB.where('results', r => r.exam_id === exam_id).forEach(r =>
        Notify.add('student', r.student_id, 'Results published', `Your ${exam.exam_name} result is now available.`, `result.html?id=${r.result_id}`));
    }
    return exam;
  },

  forExam(exam_id) { return DB.where('results', r => r.exam_id === exam_id); },

  /** Rank and class statistics for one result. */
  standing(result) {
    const all = this.forExam(result.exam_id).sort((a, b) => b.score - a.score);
    return {
      rank: all.findIndex(r => r.result_id === result.result_id) + 1,
      total: all.length,
      average: EV.round2(EV.avg(all.map(r => r.percentage))),
      highest: all.length ? all[0].percentage : 0
    };
  },

  /** Per-question detail for analysis / answer review. */
  detail(result) {
    const exam = DB.get('examinations', result.exam_id);
    const qs = Exams.questions(exam.exam_id);
    const answers = DB.where('answers', a => a.exam_id === exam.exam_id && a.student_id === result.student_id);
    return qs.map((q, i) => {
      const a = answers.find(x => x.question_id === q.question_id);
      const selected = a ? a.selected_option : null;
      return { no: i + 1, q, selected, state: !selected ? 'skip' : selected === q.correct_option ? 'correct' : 'wrong', marks: a ? a.marks_obtained : 0 };
    });
  },

  statusBadge(r) {
    return r.result_status === 'Pass' ? '<span class="ev-badge success">Passed</span>' : '<span class="ev-badge danger">Failed</span>';
  }
};
