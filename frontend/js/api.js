/* ==========================================================================
   Evalio — API layer
   --------------------------------------------------------------------------
   Communicates with the Python / SQLite backend REST API on port 8000.
   Includes graceful client-side fallback (EvalioDB) for offline reliability.
   All methods are async and resolve to plain JSON objects.
   ========================================================================== */
(function () {
  const MIN = 60e3;
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowIso = () => new Date().toISOString();
  const round2 = (n) => Math.round(n * 100) / 100;

  class ApiError extends Error {
    constructor(msg, status = 400) {
      super(msg);
      this.name = 'ApiError';
      this.status = status;
    }
  }
  const fail = (msg, status = 400) => { throw new ApiError(msg, status); };

  // Determine API base: same host if loaded on 8000, otherwise http://127.0.0.1:8000
  const API_BASE = (location.port === '8000') ? '' : 'http://127.0.0.1:8000';

  async function request(endpoint, options = {}) {
    try {
      const url = `${API_BASE}${endpoint}`;
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      if (!res.ok) {
        let errData = {};
        try { errData = await res.json(); } catch (e) { }
        const msg = errData.detail || errData.message || `Request failed (${res.status})`;
        throw new ApiError(msg, res.status);
      }
      const cType = res.headers.get('content-type') || '';
      if (cType.includes('application/json')) {
        return await res.json();
      }
      return await res.text();
    } catch (e) {
      if (e instanceof ApiError) throw e;
      return { __offline: true, error: e };
    }
  }

  // --- Local Fallback Engine (EvalioDB) ---
  async function tx(fn) {
    if (!window.EvalioDB) fail('Offline storage not available.');
    const db = EvalioDB.load();
    const out = fn(db);
    EvalioDB.save(db);
    await sleep(25);
    return clone(out);
  }
  async function read(fn) {
    if (!window.EvalioDB) fail('Offline storage not available.');
    const db = EvalioDB.load();
    await sleep(15);
    return clone(fn(db));
  }

  function insert(db, table, row) {
    const pk = EvalioDB.PK[table];
    db.seq[table] = (db.seq[table] || 0) + 1;
    const rec = { ...row, [pk]: db.seq[table] };
    db[table].push(rec);
    return rec;
  }
  const find = (db, table, id) => db[table].find((r) => r[EvalioDB.PK[table]] === +id);
  const courseName = (db, id) => (find(db, 'courses', id) || {}).course_name || '—';
  const scheduleOf = (db, examId) => db.schedules.find((s) => s.exam_id === examId) || null;
  const examQuestions = (db, examId) => EvalioDB.examQuestionIds(db, examId).map((qid) => find(db, 'questions', qid));
  const attemptOf = (db, examId, studentId) => db.exam_attempts.find((a) => a.exam_id === examId && a.student_id === studentId);
  const isDone = (a) => a && (a.status === 'Submitted' || a.status === 'Auto-Submitted');

  function log(db, entry) {
    insert(db, 'activity_logs', { exam_id: null, details: '', ...entry, created_at: nowIso() });
  }
  function actor(db, session) {
    if (!session) return { user_role: 'system', user_id: null, user_name: 'System' };
    return { user_role: session.role, user_id: session.id, user_name: session.name };
  }
  function examSummary(db, exam) {
    const qs = examQuestions(db, exam.exam_id);
    return {
      ...exam,
      course_name: courseName(db, exam.course_id),
      question_count: qs.length,
      schedule: scheduleOf(db, exam.exam_id)
    };
  }
  function endsAt(db, attempt) {
    const exam = find(db, 'examinations', attempt.exam_id);
    const sched = scheduleOf(db, exam.exam_id);
    let end = Date.parse(attempt.started_at) + exam.duration * MIN;
    if (sched) end = Math.min(end, Date.parse(sched.end_time));
    return end;
  }
  function finalize(db, attempt, auto, reason) {
    if (isDone(attempt)) return db.results.find((r) => r.exam_id === attempt.exam_id && r.student_id === attempt.student_id);
    attempt.status = auto ? 'Auto-Submitted' : 'Submitted';
    attempt.submitted_at = new Date(Math.min(Date.now(), endsAt(db, attempt))).toISOString();
    attempt.last_activity = attempt.submitted_at;
    const result = EvalioDB.evaluate(db, attempt);
    const s = find(db, 'students', attempt.student_id);
    const exam = find(db, 'examinations', attempt.exam_id);
    log(db, { user_role: 'student', user_id: s.student_id, user_name: s.name, exam_id: exam.exam_id, action: auto ? 'Exam auto-submitted' : 'Exam submitted', details: `${auto ? 'Auto-submitted' : 'Submitted'} "${exam.exam_name}"${reason ? ' — ' + reason : ''}` });
    return result;
  }
  function expireAttempts(db) {
    db.exam_attempts.filter((a) => a.status === 'In Progress' && !a.simulated && Date.now() >= endsAt(db, a))
      .forEach((a) => finalize(db, a, true, 'time expired'));
  }

  const UNIQUE = { students: ['email', 'enrollment_no'], administrators: ['email'], courses: ['course_name'] };

  const Api = {
    ApiError,

    // Report URLs
    getPdfUrl(examId, studentId) {
      return `${API_BASE}/api/reports/pdf/result-card/${examId}/${studentId}`;
    },
    getExcelUrl(reportType, examId) {
      return `${API_BASE}/api/reports/export/excel/${reportType}${examId ? '?exam_id=' + examId : ''}`;
    },

    // POST /api/questions/import  { csv, course_id, session }
    async importQuestions(csvText, courseId, session) {
      const res = await request('/api/questions/import', {
        method: 'POST',
        body: JSON.stringify({ csv: csvText, course_id: courseId || null, session })
      });
      if (res.__offline) fail('CSV import needs the server to be running.');
      return res;
    },
    /* ---------------------------------------------------------------- Auth */

    async checkSession(session) {
      if (!session) return { valid: false };
      const res = await request(`/api/auth/check-session?role=${session.role}&user_id=${session.id}&token=${encodeURIComponent(session.token || '')}`);
      if (!res.__offline) return res;
      return { valid: true }; // offline fallback
    },

    // POST /api/auth/login  { identifier, password, role }
    async login({ identifier, password, role }) {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, role })
      });
      if (!res.__offline) return res;

      // Fallback
      return tx((db) => {
        const id = String(identifier || '').trim().toLowerCase();
        if (!id || !password) fail('Enter your email / student ID and password.');
        let user, table = role === 'admin' ? 'administrators' : 'students';
        if (role === 'admin') user = db.administrators.find((a) => a.email.toLowerCase() === id);
        else user = db.students.find((s) => s.email.toLowerCase() === id || s.enrollment_no.toLowerCase() === id);
        if (!user || user.password !== password) fail('Invalid credentials. Please check and try again.');
        if (user.status !== 'Active') fail('This account is inactive. Contact the examination administrator.');
        const pk = EvalioDB.PK[table];
        const session = {
          role, id: user[pk], name: user.name, email: user.email,
          enrollment_no: user.enrollment_no || null, course_id: user.course_id || null,
          course_name: user.course_id ? courseName(db, user.course_id) : null
        };
        log(db, { ...actor(db, session), action: 'Login', details: `${role === 'admin' ? 'Administrator' : 'Student'} signed in` });
        return session;
      });
    },

    // POST /api/auth/logout
    async logout(session) {
      await request('/api/auth/logout', { method: 'POST', body: JSON.stringify(session || {}) });
      return tx((db) => { if (session) log(db, { ...actor(db, session), action: 'Logout', details: 'Signed out' }); return true; });
    },

    /* --------------------------------------------------- Generic CRUD (admin) */

    async list(table) {
      const res = await request(`/api/${table}`);
      if (!res.__offline) return res;

      return read((db) => {
        const rows = db[table].map((r) => ({ ...r }));
        if (table === 'students') rows.forEach((r) => { r.course_name = courseName(db, r.course_id); });
        if (table === 'courses') rows.forEach((r) => {
          r.student_count = db.students.filter((s) => s.course_id === r.course_id).length;
          r.question_count = db.questions.filter((q) => q.course_id === r.course_id).length;
          r.exam_count = db.examinations.filter((e) => e.course_id === r.course_id).length;
        });
        if (table === 'questions') rows.forEach((r) => {
          r.course_name = courseName(db, r.course_id);
          r.used_in = db.exam_questions.filter((x) => x.question_id === r.question_id).length;
        });
        if (table === 'examinations') return rows.map((e) => examSummary(db, e));
        if (table === 'schedules') rows.forEach((r) => {
          const e = find(db, 'examinations', r.exam_id) || {};
          r.exam_name = e.exam_name; r.course_name = courseName(db, e.course_id); r.duration = e.duration;
        });
        return rows;
      });
    },

    async get(table, id) {
      const res = await request(`/api/${table}/${id}`);
      if (!res.__offline) return res;
      return read((db) => find(db, table, id) || fail('Record not found.'));
    },

    async create(table, data, session) {
      const res = await request(`/api/${table}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (!res.__offline) return res;

      return tx((db) => {
        (UNIQUE[table] || []).forEach((f) => {
          if (data[f] && db[table].some((r) => String(r[f]).toLowerCase() === String(data[f]).toLowerCase())) fail(`A record with this ${f.replace('_', ' ')} already exists.`);
        });
        const rec = insert(db, table, { ...data, created_at: nowIso() });
        log(db, { ...actor(db, session), action: 'Created ' + table.replace(/s$/, '').replace('_', ' '), details: rec.name || rec.course_name || rec.exam_name || rec.title || (rec.question_text || '').slice(0, 60) });
        return rec;
      });
    },

    async update(table, id, patch, session) {
      const res = await request(`/api/${table}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch)
      });
      if (!res.__offline) return res;

      return tx((db) => {
        const rec = find(db, table, id) || fail('Record not found.');
        (UNIQUE[table] || []).forEach((f) => {
          if (patch[f] && db[table].some((r) => r !== rec && String(r[f]).toLowerCase() === String(patch[f]).toLowerCase())) fail(`A record with this ${f.replace('_', ' ')} already exists.`);
        });
        Object.assign(rec, patch);
        log(db, { ...actor(db, session), action: 'Updated ' + table.replace(/s$/, '').replace('_', ' '), details: rec.name || rec.course_name || rec.exam_name || (rec.question_text || '').slice(0, 60) || `#${id}` });
        return rec;
      });
    },

    async remove(table, id, session) {
      const res = await request(`/api/${table}/${id}`, { method: 'DELETE' });
      if (!res.__offline) return true;

      return tx((db) => {
        const pk = EvalioDB.PK[table];
        const rec = find(db, table, id) || fail('Record not found.');
        if (table === 'courses' && (db.students.some((s) => s.course_id === +id) || db.examinations.some((e) => e.course_id === +id)))
          fail('This course still has students or examinations. Move or delete them first, or mark the course Inactive.');
        if (table === 'questions' && db.exam_questions.some((x) => x.question_id === +id))
          fail('This question is used in an examination. Remove it from the examination first, or mark it Inactive.');
        if (table === 'students' && db.exam_attempts.some((a) => a.student_id === +id))
          fail('This student has examination records. Mark the account Inactive instead of deleting it.');
        if (table === 'examinations') {
          if (db.exam_attempts.some((a) => a.exam_id === +id)) fail('Students have already attempted this examination, so it cannot be deleted.');
          db.exam_questions = db.exam_questions.filter((x) => x.exam_id !== +id);
          db.schedules = db.schedules.filter((x) => x.exam_id !== +id);
        }
        db[table] = db[table].filter((r) => r[pk] !== +id);
        log(db, { ...actor(db, session), action: 'Deleted ' + table.replace(/s$/, '').replace('_', ' '), details: rec.name || rec.course_name || rec.exam_name || (rec.question_text || '').slice(0, 60) || `#${id}` });
        return true;
      });
    },

    /* ------------------------------------------------------------ Student */

    async studentExams(studentId) {
      const res = await request(`/api/students/${studentId}/exams`);
      if (!res.__offline) return res;

      return tx((db) => {
        expireAttempts(db);
        const student = find(db, 'students', studentId);
        const now = Date.now();
        const out = { available: [], upcoming: [], completed: [], missed: [] };
        db.examinations.filter((e) => e.course_id === student.course_id && e.status !== 'Draft').forEach((e) => {
          const item = examSummary(db, e);
          const a = attemptOf(db, e.exam_id, student.student_id);
          item.attempt = a ? { attempt_id: a.attempt_id, status: a.status, started_at: a.started_at, submitted_at: a.submitted_at } : null;
          const s = item.schedule;
          if (isDone(a)) {
            const r = db.results.find((x) => x.exam_id === e.exam_id && x.student_id === student.student_id);
            item.result = e.result_published ? r : null;
            out.completed.push(item);
          } else if (!s) {
            /* not yet scheduled */
          } else if (now < Date.parse(s.start_time)) out.upcoming.push(item);
          else if (now <= Date.parse(s.end_time)) out.available.push(item);
          else out.missed.push(item);
        });
        out.completed.sort((a, b) => Date.parse(b.attempt.submitted_at) - Date.parse(a.attempt.submitted_at));
        out.upcoming.sort((a, b) => Date.parse(a.schedule.start_time) - Date.parse(b.schedule.start_time));
        return out;
      });
    },

    async examInfo(examId, studentId) {
      const res = await request(`/api/exams/${examId}?student=${studentId}`);
      if (!res.__offline) return res;

      return tx((db) => {
        expireAttempts(db);
        const exam = find(db, 'examinations', examId) || fail('Examination not found.');
        const student = find(db, 'students', studentId);
        const item = examSummary(db, exam);
        const a = attemptOf(db, exam.exam_id, student.student_id);
        item.attempt = a ? { attempt_id: a.attempt_id, status: a.status } : null;
        const s = item.schedule, now = Date.now();
        item.can_start = exam.course_id === student.course_id && exam.status !== 'Draft' && !!s &&
          now >= Date.parse(s.start_time) && now <= Date.parse(s.end_time) && !isDone(a);
        item.block_reason = isDone(a) ? 'You have already submitted this examination.'
          : !s || exam.status === 'Draft' ? 'This examination has not been scheduled yet.'
            : now < Date.parse(s.start_time) ? 'This examination has not started yet.'
              : now > Date.parse(s.end_time) ? 'The examination window has closed.' : '';
        return item;
      });
    },

    async startAttempt(examId, session) {
      const res = await request(`/api/exams/${examId}/attempts`, {
        method: 'POST',
        body: JSON.stringify({ session })
      });
      if (!res.__offline) return res;

      return tx((db) => {
        expireAttempts(db);
        const exam = find(db, 'examinations', examId) || fail('Examination not found.');
        const student = find(db, 'students', session.id);
        const s = scheduleOf(db, exam.exam_id), now = Date.now();
        if (exam.course_id !== student.course_id) fail('This examination is not assigned to your course.');
        if (!s || exam.status === 'Draft' || now < Date.parse(s.start_time)) fail('This examination has not started yet.');
        let a = attemptOf(db, exam.exam_id, student.student_id);
        if (isDone(a)) fail('You have already submitted this examination.');
        if (now > Date.parse(s.end_time)) fail('The examination window has closed.');
        if (a) {
          a.device_token = session.token;
          log(db, { ...actor(db, session), exam_id: exam.exam_id, action: 'Exam resumed', details: `Resumed "${exam.exam_name}"` });
          return a.attempt_id;
        }
        const r = EvalioDB.rng((now % 1e9) + student.student_id);
        const order = EvalioDB.buildAttemptOrder(db, exam, r);
        a = insert(db, 'exam_attempts', {
          exam_id: exam.exam_id, student_id: student.student_id, started_at: nowIso(), submitted_at: null,
          status: 'In Progress', ...order, marked: [], current_index: 0, tab_switches: 0,
          last_activity: nowIso(), device_token: session.token, simulated: false
        });
        log(db, { ...actor(db, session), exam_id: exam.exam_id, action: 'Exam started', details: `Started "${exam.exam_name}"` });
        return a.attempt_id;
      });
    },

    async getAttempt(attemptId, session) {
      const res = await request(`/api/attempts/${attemptId}`);
      if (!res.__offline) return res;

      return tx((db) => {
        expireAttempts(db);
        const a = find(db, 'exam_attempts', attemptId) || fail('Attempt not found.');
        if (session && a.student_id !== session.id) fail('Not allowed.');
        const exam = find(db, 'examinations', a.exam_id);
        const answers = {};
        db.answers.filter((x) => x.exam_id === a.exam_id && x.student_id === a.student_id).forEach((x) => { answers[x.question_id] = x.selected_option; });
        const questions = a.question_order.map((qid) => {
          const q = find(db, 'questions', qid);
          return {
            question_id: q.question_id, question_text: q.question_text, topic: q.topic, marks: q.marks,
            negative_marks: exam.negative_marking ? q.negative_marks : 0,
            options: a.option_order[qid].map((k) => ({ key: k, text: q['option_' + k.toLowerCase()] }))
          };
        });
        return {
          attempt: { attempt_id: a.attempt_id, status: a.status, started_at: a.started_at, current_index: a.current_index, marked: a.marked, tab_switches: a.tab_switches, device_token: a.device_token },
          exam: { ...examSummary(db, exam) },
          questions, answers, ends_at: endsAt(db, a), server_now: Date.now()
        };
      });
    },

    async saveAnswer(attemptId, questionId, option) {
      const res = await request(`/api/attempts/${attemptId}/answers/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify({ selected_option: option })
      });
      if (!res.__offline) return res;

      return tx((db) => {
        const a = find(db, 'exam_attempts', attemptId) || fail('Attempt not found.');
        if (a.status !== 'In Progress') fail('This examination has already been submitted.');
        if (Date.now() > endsAt(db, a) + 5e3) { finalize(db, a, true, 'time expired'); fail('Time is up — your examination was submitted automatically.'); }
        const existing = db.answers.find((x) => x.exam_id === a.exam_id && x.student_id === a.student_id && x.question_id === +questionId);
        const saved_at = nowIso();
        if (!option) db.answers = db.answers.filter((x) => x !== existing);
        else if (existing) Object.assign(existing, { selected_option: option, saved_at });
        else insert(db, 'answers', { exam_id: a.exam_id, student_id: a.student_id, question_id: +questionId, selected_option: option, is_correct: null, marks_obtained: 0, saved_at });
        a.last_activity = saved_at;
        return { saved_at };
      });
    },

    async saveProgress(attemptId, patch) {
      const res = await request(`/api/attempts/${attemptId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      if (!res.__offline) return res;

      return tx((db) => {
        const a = find(db, 'exam_attempts', attemptId) || fail('Attempt not found.');
        if (a.status !== 'In Progress') return false;
        if (patch.current_index != null) a.current_index = patch.current_index;
        if (patch.marked) a.marked = patch.marked;
        a.last_activity = nowIso();
        return true;
      });
    },

    async reportViolation(attemptId, type, session) {
      const res = await request(`/api/attempts/${attemptId}/events`, {
        method: 'POST',
        body: JSON.stringify({ type, session })
      });
      if (!res.__offline) return res;

      return tx((db) => {
        const a = find(db, 'exam_attempts', attemptId) || fail('Attempt not found.');
        if (a.status !== 'In Progress') return { count: a.tab_switches, max: 0, submitted: true };
        const exam = find(db, 'examinations', a.exam_id);
        a.tab_switches += 1;
        a.last_activity = nowIso();
        const max = exam.max_tab_switches || 3;
        log(db, { ...actor(db, session), exam_id: exam.exam_id, action: 'Tab switch detected', details: `${type} (warning ${a.tab_switches} of ${max})` });
        let submitted = false;
        if (a.tab_switches >= max) { finalize(db, a, true, 'tab-switch limit reached'); submitted = true; }
        return { count: a.tab_switches, max, submitted };
      });
    },

    async submitAttempt(attemptId, auto) {
      const res = await request(`/api/attempts/${attemptId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ auto })
      });
      if (!res.__offline) return res;

      return tx((db) => {
        const a = find(db, 'exam_attempts', attemptId) || fail('Attempt not found.');
        finalize(db, a, !!auto, auto ? 'time expired' : '');
        const exam = find(db, 'examinations', a.exam_id);
        return { exam_id: exam.exam_id, published: !!exam.result_published };
      });
    },

    async result(examId, studentId) {
      const res = await request(`/api/results?exam=${examId}&student=${studentId}`);
      if (!res.__offline) return res;

      return tx((db) => {
        expireAttempts(db);
        const exam = find(db, 'examinations', examId) || fail('Examination not found.');
        const student = find(db, 'students', studentId);
        const a = attemptOf(db, exam.exam_id, student.student_id);
        if (!isDone(a)) fail('You have not submitted this examination yet.');
        const r = db.results.find((x) => x.exam_id === exam.exam_id && x.student_id === student.student_id);
        return {
          exam: examSummary(db, exam),
          student: { name: student.name, enrollment_no: student.enrollment_no, course_name: courseName(db, student.course_id) },
          attempt: { status: a.status, started_at: a.started_at, submitted_at: a.submitted_at, time_taken_ms: Date.parse(a.submitted_at) - Date.parse(a.started_at), tab_switches: a.tab_switches },
          published: !!exam.result_published,
          result: exam.result_published ? r : null
        };
      });
    },

    async analysis(examId, studentId) {
      const res = await request(`/api/results/${examId}/${studentId}/analysis`);
      if (!res.__offline) return res;

      return read((db) => {
        const exam = find(db, 'examinations', examId) || fail('Examination not found.');
        const a = attemptOf(db, exam.exam_id, +studentId);
        if (!isDone(a)) fail('You have not submitted this examination yet.');
        if (!exam.result_published) fail('Results for this examination have not been published yet.');
        const r = db.results.find((x) => x.exam_id === exam.exam_id && x.student_id === +studentId);
        const questions = a.question_order.map((qid, i) => {
          const q = find(db, 'questions', qid);
          const ans = db.answers.find((x) => x.exam_id === exam.exam_id && x.student_id === +studentId && x.question_id === qid);
          const sel = ans ? ans.selected_option : null;
          return {
            no: i + 1, question_id: qid, question_text: q.question_text, topic: q.topic, difficulty: q.difficulty, marks: q.marks,
            options: a.option_order[qid].map((k) => ({ key: k, text: q['option_' + k.toLowerCase()] })),
            correct_option: q.correct_option, selected_option: sel,
            state: !sel ? 'unattempted' : sel === q.correct_option ? 'correct' : 'incorrect',
            marks_obtained: ans ? ans.marks_obtained : 0
          };
        });
        const topics = {};
        questions.forEach((q) => {
          topics[q.topic] = topics[q.topic] || { topic: q.topic, total: 0, correct: 0 };
          topics[q.topic].total++; if (q.state === 'correct') topics[q.topic].correct++;
        });
        const classRows = db.results.filter((x) => x.exam_id === exam.exam_id);
        return {
          exam: examSummary(db, exam), result: r, questions, topics: Object.values(topics),
          time_taken_ms: Date.parse(a.submitted_at) - Date.parse(a.started_at),
          class_average: classRows.length ? round2(classRows.reduce((s, x) => s + x.percentage, 0) / classRows.length) : null,
          rank: classRows.filter((x) => x.score > r.score).length + 1, class_size: classRows.length
        };
      });
    },

    async history(studentId) {
      const res = await request(`/api/students/${studentId}/results`);
      if (!res.__offline) return res;

      return tx((db) => {
        expireAttempts(db);
        return db.exam_attempts.filter((a) => a.student_id === +studentId && isDone(a)).map((a) => {
          const exam = find(db, 'examinations', a.exam_id);
          const r = db.results.find((x) => x.exam_id === a.exam_id && x.student_id === a.student_id);
          return { exam: examSummary(db, exam), submitted_at: a.submitted_at, status: a.status, published: !!exam.result_published, result: exam.result_published ? r : null };
        }).sort((x, y) => Date.parse(y.submitted_at) - Date.parse(x.submitted_at));
      });
    },

    async notifications(session) {
      const res = await request(`/api/notifications?course_id=${session ? session.course_id || '' : ''}&role=${session ? session.role : 'student'}`);
      if (!res.__offline) return res;

      return read((db) => db.notifications
        .filter((n) => session.role === 'admin' || n.course_id == null || n.course_id === session.course_id)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
    },

    /* -------------------------------------------------------------- Admin */

    async adminOverview() {
      const res = await request('/api/admin/overview');
      if (!res.__offline) return res;

      return tx((db) => {
        expireAttempts(db);
        const live = db.examinations.filter((e) => e.status === 'Active').map((e) => {
          const assigned = db.students.filter((s) => s.course_id === e.course_id && s.status === 'Active').length;
          const atts = db.exam_attempts.filter((a) => a.exam_id === e.exam_id);
          return { ...examSummary(db, e), assigned, in_progress: atts.filter((a) => a.status === 'In Progress').length, submitted: atts.filter(isDone).length, alerts: atts.reduce((s, a) => s + (a.status === 'In Progress' ? a.tab_switches : 0), 0) };
        });
        const perf = db.examinations.filter((e) => db.results.some((r) => r.exam_id === e.exam_id)).map((e) => {
          const rs = db.results.filter((r) => r.exam_id === e.exam_id);
          return { exam_name: e.exam_name, avg: round2(rs.reduce((s, r) => s + r.percentage, 0) / rs.length), pass_rate: round2(rs.filter((r) => r.result_status === 'Pass').length / rs.length * 100) };
        });
        return {
          counts: {
            students: db.students.length, active_students: db.students.filter((s) => s.status === 'Active').length,
            courses: db.courses.length, questions: db.questions.length, exams: db.examinations.length,
            live_exams: live.length, in_progress: db.exam_attempts.filter((a) => a.status === 'In Progress').length,
            results: db.results.length
          },
          live, perf,
          upcoming: db.schedules.filter((s) => s.status === 'Scheduled').map((s) => ({ ...s, exam_name: (find(db, 'examinations', s.exam_id) || {}).exam_name })),
          recent: db.activity_logs.slice(-8).reverse()
        };
      });
    },

    async monitor(examId) {
      const res = await request(`/api/admin/monitor/${examId}`);
      if (!res.__offline) return res;

      return tx((db) => {
        expireAttempts(db);
        const exam = find(db, 'examinations', examId) || fail('Examination not found.');
        const qCount = EvalioDB.examQuestionIds(db, exam.exam_id).length;
        const rows = db.students.filter((s) => s.course_id === exam.course_id && s.status === 'Active').map((s) => {
          const a = attemptOf(db, exam.exam_id, s.student_id);
          const answered = a ? db.answers.filter((x) => x.exam_id === exam.exam_id && x.student_id === s.student_id).length : 0;
          return {
            student_id: s.student_id, name: s.name, enrollment_no: s.enrollment_no,
            status: a ? a.status : 'Not Started', answered, total: qCount,
            current: a ? a.current_index + 1 : null,
            remaining_ms: a && a.status === 'In Progress' ? Math.max(0, endsAt(db, a) - Date.now()) : null,
            tab_switches: a ? a.tab_switches : 0, started_at: a ? a.started_at : null,
            submitted_at: a ? a.submitted_at : null, last_activity: a ? a.last_activity : null,
            score: a && isDone(a) ? (db.results.find((r) => r.exam_id === exam.exam_id && r.student_id === s.student_id) || {}).score : null
          };
        });
        return {
          exam: examSummary(db, exam), rows,
          events: db.activity_logs.filter((l) => l.exam_id === exam.exam_id).slice(-15).reverse()
        };
      });
    },

    async simulateTick() {
      const res = await request('/api/admin/simulate-tick');
      if (!res.__offline) return res;

      return tx((db) => {
        const live = db.exam_attempts.filter((a) => a.simulated && a.status === 'In Progress');
        if (!live.length) return false;
        const a = live[Math.floor(Math.random() * live.length)];
        const done = new Set(db.answers.filter((x) => x.exam_id === a.exam_id && x.student_id === a.student_id).map((x) => x.question_id));
        const next = a.question_order.find((q) => !done.has(q));
        const s = find(db, 'students', a.student_id);
        if (next == null) { finalize(db, a, false); return true; }
        const q = find(db, 'questions', next);
        const sel = Math.random() < 0.65 ? q.correct_option : ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
        insert(db, 'answers', { exam_id: a.exam_id, student_id: a.student_id, question_id: next, selected_option: sel, is_correct: null, marks_obtained: 0, saved_at: nowIso() });
        a.current_index = Math.min(a.question_order.indexOf(next) + 1, a.question_order.length - 1);
        a.last_activity = nowIso();
        if (Math.random() < 0.04 && a.tab_switches < 2) {
          a.tab_switches++;
          log(db, { user_role: 'student', user_id: s.student_id, user_name: s.name, exam_id: a.exam_id, action: 'Tab switch detected', details: `Left the examination window (warning ${a.tab_switches} of 3)` });
        }
        return true;
      });
    },

    async saveExam(exam, questionIds, session) {
      const res = await request('/api/exams', {
        method: 'POST',
        body: JSON.stringify({ exam, question_ids: questionIds, session })
      });
      if (!res.__offline) return res;

      return tx((db) => {
        if (!questionIds.length && exam.status !== 'Draft') fail('Add at least one question, or save the examination as Draft.');
        const marks = questionIds.reduce((s, id) => s + +(find(db, 'questions', id) || {}).marks, 0);
        if (+exam.passing_marks > marks && questionIds.length) fail(`Passing marks (${exam.passing_marks}) cannot exceed total marks (${marks}).`);
        let rec;
        if (exam.exam_id) {
          rec = find(db, 'examinations', exam.exam_id) || fail('Examination not found.');
          if (db.exam_attempts.some((a) => a.exam_id === rec.exam_id)) {
            const before = EvalioDB.examQuestionIds(db, rec.exam_id).join(',');
            if (before !== questionIds.join(',')) fail('Students have already attempted this examination, so its questions can no longer change.');
          }
          Object.assign(rec, exam, { total_marks: marks });
        } else {
          const { exam_id, ...fields } = exam;
          rec = insert(db, 'examinations', { result_published: false, ...fields, total_marks: marks, created_at: nowIso() });
        }
        db.exam_questions = db.exam_questions.filter((x) => x.exam_id !== rec.exam_id);
        questionIds.forEach((qid, i) => insert(db, 'exam_questions', { exam_id: rec.exam_id, question_id: +qid, question_order: i + 1 }));
        log(db, { ...actor(db, session), exam_id: rec.exam_id, action: exam.exam_id ? 'Exam updated' : 'Exam created', details: `"${rec.exam_name}" — ${questionIds.length} questions, ${marks} marks` });
        return rec;
      });
    },

    async examQuestionIds(examId) {
      const res = await request(`/api/exams/${examId}/questions`);
      if (!res.__offline) return res;
      return read((db) => EvalioDB.examQuestionIds(db, +examId));
    },

    async saveSchedule(data, notify, session) {
      const res = await request('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...data, notify, session })
      });
      if (!res.__offline) return res;

      return tx((db) => {
        const exam = find(db, 'examinations', data.exam_id) || fail('Choose an examination.');
        if (Date.parse(data.end_time) <= Date.parse(data.start_time)) fail('End time must be after the start time.');
        if (Date.parse(data.end_time) - Date.parse(data.start_time) < exam.duration * MIN) fail(`The window must be at least the exam duration (${exam.duration} min).`);
        if (!EvalioDB.examQuestionIds(db, exam.exam_id).length) fail('This examination has no questions yet. Add questions before scheduling it.');
        let rec = data.schedule_id ? find(db, 'schedules', data.schedule_id) : db.schedules.find((s) => s.exam_id === exam.exam_id);
        if (rec) Object.assign(rec, { exam_id: exam.exam_id, start_time: data.start_time, end_time: data.end_time });
        else rec = insert(db, 'schedules', { exam_id: exam.exam_id, start_time: data.start_time, end_time: data.end_time, status: 'Scheduled' });
        if (exam.status === 'Draft') exam.status = 'Scheduled';
        const now = Date.now();
        rec.status = now < Date.parse(rec.start_time) ? 'Scheduled' : now <= Date.parse(rec.end_time) ? 'Active' : 'Completed';
        exam.status = rec.status;
        log(db, { ...actor(db, session), exam_id: exam.exam_id, action: 'Exam scheduled', details: `"${exam.exam_name}" ${new Date(rec.start_time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} → ${new Date(rec.end_time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` });
        if (notify) insert(db, 'notifications', { title: 'Examination scheduled', message: `${exam.exam_name} is scheduled from ${new Date(rec.start_time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} to ${new Date(rec.end_time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.`, course_id: exam.course_id, type: 'exam', created_at: nowIso() });
        return rec;
      });
    },

    async examResults(examId) {
      const res = await request(`/api/exams/${examId}/results`);
      if (!res.__offline) return res;

      return tx((db) => {
        expireAttempts(db);
        const exam = find(db, 'examinations', examId) || fail('Examination not found.');
        const rows = db.results.filter((r) => r.exam_id === exam.exam_id).map((r) => {
          const s = find(db, 'students', r.student_id);
          const a = attemptOf(db, exam.exam_id, r.student_id);
          return { ...r, name: s.name, enrollment_no: s.enrollment_no, submission: a.status, time_taken_ms: Date.parse(a.submitted_at) - Date.parse(a.started_at), tab_switches: a.tab_switches };
        }).sort((a, b) => b.score - a.score);
        rows.forEach((r, i) => { r.rank = i && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1; });
        const pcts = rows.map((r) => r.percentage);
        return {
          exam: examSummary(db, exam), rows,
          stats: rows.length ? {
            attempted: rows.length, average: round2(pcts.reduce((s, x) => s + x, 0) / rows.length),
            highest: Math.max(...rows.map((r) => r.score)), lowest: Math.min(...rows.map((r) => r.score)),
            pass_rate: round2(rows.filter((r) => r.result_status === 'Pass').length / rows.length * 100)
          } : null
        };
      });
    },

    async setPublished(examId, published, session) {
      const res = await request(`/api/exams/${examId}/publish`, {
        method: 'PUT',
        body: JSON.stringify({ published })
      });
      if (!res.__offline) return res;

      return tx((db) => {
        const exam = find(db, 'examinations', examId) || fail('Examination not found.');
        exam.result_published = !!published;
        log(db, { ...actor(db, session), exam_id: exam.exam_id, action: published ? 'Results published' : 'Results withdrawn', details: `"${exam.exam_name}"` });
        if (published) insert(db, 'notifications', { title: 'Results published', message: `Results for ${exam.exam_name} are now available.`, course_id: exam.course_id, type: 'result', created_at: nowIso() });
        return exam;
      });
    },

    async analytics(examId) {
      const res = await request(`/api/admin/analytics${examId ? '?exam=' + examId : ''}`);
      if (!res.__offline) return res;

      return read((db) => {
        const exams = db.examinations.filter((e) => (examId ? e.exam_id === +examId : true) && db.results.some((r) => r.exam_id === e.exam_id));
        const ids = new Set(exams.map((e) => e.exam_id));
        const results = db.results.filter((r) => ids.has(r.exam_id));
        const answers = db.answers.filter((a) => ids.has(a.exam_id) && db.results.some((r) => r.exam_id === a.exam_id && r.student_id === a.student_id));
        const buckets = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i * 10 + 10}%`, count: 0 }));
        results.forEach((r) => { buckets[Math.min(9, Math.floor(r.percentage / 10))].count++; });
        const subjects = {};
        exams.forEach((e) => {
          const rs = results.filter((r) => r.exam_id === e.exam_id);
          subjects[e.subject] = subjects[e.subject] || { subject: e.subject, sum: 0, n: 0, pass: 0 };
          rs.forEach((r) => { subjects[e.subject].sum += r.percentage; subjects[e.subject].n++; if (r.result_status === 'Pass') subjects[e.subject].pass++; });
        });
        const qStats = {};
        const diff = { Easy: { c: 0, n: 0 }, Medium: { c: 0, n: 0 }, Hard: { c: 0, n: 0 } };
        const topics = {};
        exams.forEach((e) => EvalioDB.examQuestionIds(db, e.exam_id).forEach((qid) => {
          const q = find(db, 'questions', qid);
          const attemptsN = results.filter((r) => r.exam_id === e.exam_id).length;
          const key = e.exam_id + ':' + qid;
          qStats[key] = { question_id: qid, exam_name: e.exam_name, question_text: q.question_text, topic: q.topic, difficulty: q.difficulty, correct: 0, wrong: 0, skipped: attemptsN };
        }));
        answers.forEach((a) => {
          const st = qStats[a.exam_id + ':' + a.question_id]; if (!st) return;
          const q = find(db, 'questions', a.question_id);
          st.skipped--; if (a.is_correct) st.correct++; else st.wrong++;
          diff[q.difficulty].n++; if (a.is_correct) diff[q.difficulty].c++;
          topics[q.topic] = topics[q.topic] || { topic: q.topic, c: 0, n: 0 };
          topics[q.topic].n++; if (a.is_correct) topics[q.topic].c++;
        });
        const hardest = Object.values(qStats).map((s) => ({ ...s, total: s.correct + s.wrong + s.skipped, rate: (s.correct + s.wrong + s.skipped) ? round2(s.correct / (s.correct + s.wrong + s.skipped) * 100) : 0 }))
          .sort((a, b) => a.rate - b.rate).slice(0, 8);
        return {
          exams: exams.map((e) => ({ exam_id: e.exam_id, exam_name: e.exam_name })),
          totals: {
            results: results.length,
            average: results.length ? round2(results.reduce((s, r) => s + r.percentage, 0) / results.length) : 0,
            pass: results.filter((r) => r.result_status === 'Pass').length,
            fail: results.filter((r) => r.result_status === 'Fail').length
          },
          distribution: buckets,
          subjects: Object.values(subjects).map((s) => ({ subject: s.subject, average: s.n ? round2(s.sum / s.n) : 0, pass_rate: s.n ? round2(s.pass / s.n * 100) : 0, n: s.n })),
          difficulty: Object.entries(diff).map(([k, v]) => ({ difficulty: k, accuracy: v.n ? round2(v.c / v.n * 100) : 0, n: v.n })),
          topics: Object.values(topics).map((t) => ({ topic: t.topic, accuracy: round2(t.c / t.n * 100), n: t.n })).sort((a, b) => a.accuracy - b.accuracy),
          hardest,
          per_exam: exams.map((e) => {
            const rs = results.filter((r) => r.exam_id === e.exam_id);
            return { exam_name: e.exam_name, subject: e.subject, students: rs.length, average: round2(rs.reduce((s, r) => s + r.percentage, 0) / rs.length), highest: Math.max(...rs.map((r) => r.percentage)), lowest: Math.min(...rs.map((r) => r.percentage)), pass_rate: round2(rs.filter((r) => r.result_status === 'Pass').length / rs.length * 100) };
          })
        };
      });
    },

    async activityLogs() {
      const res = await request('/api/activity-logs');
      if (!res.__offline) return res;

      return read((db) => db.activity_logs.slice().reverse().map((l) => ({ ...l, exam_name: l.exam_id ? (find(db, 'examinations', l.exam_id) || {}).exam_name : null })));
    },

    async sendNotification(data, session) {
      const res = await request('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ ...data, session })
      });
      if (!res.__offline) return res;

      return tx((db) => {
        if (!data.title || !data.message) fail('Enter a title and a message.');
        const rec = insert(db, 'notifications', { title: data.title, message: data.message, course_id: data.course_id ? +data.course_id : null, type: data.type || 'info', created_at: nowIso() });
        log(db, { ...actor(db, session), action: 'Notification sent', details: data.title });
        return rec;
      });
    },

    resetDemo() {
      if (window.EvalioDB) EvalioDB.reset();
      return Promise.resolve(true);
    }
  };

  window.Api = Api;
})();
