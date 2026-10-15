/* =========================================================
   Evalio – data access layer
   Every read/write in the app goes through DB.*. For now the
   tables live in the browser's localStorage (seeded from
   data.js). When the Java + MySQL backend is ready, these
   functions are swapped for fetch() calls to the REST API –
   the pages themselves do not need to change.
   ========================================================= */
const DB = (() => {
  const KEY = 'evalio_db';
  const PK = {
    admins: 'admin_id', students: 'student_id', courses: 'course_id', questions: 'question_id',
    examinations: 'exam_id', exam_questions: 'exam_question_id', schedules: 'schedule_id',
    answers: 'answer_id', results: 'result_id', attempts: 'attempt_id',
    activity_logs: 'log_id', notifications: 'notification_id'
  };
  let cache = null;

  function load() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(KEY)); } catch { cache = null; }
    if (!cache || cache.version !== Seed.VERSION) {
      cache = Seed.build(Date.now());
      persist();
    }
    return cache;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); }
    catch (e) { console.warn('Evalio: could not persist data', e); }
  }
  // Keep tabs in sync (e.g. admin monitor reading a student's live attempt).
  window.addEventListener('storage', e => { if (e.key === KEY) cache = null; });

  const clone = r => (r ? JSON.parse(JSON.stringify(r)) : r);
  const table = t => { const d = load(); if (!d[t]) throw new Error('Unknown table ' + t); return d[t]; };

  return {
    PK,
    all: t => table(t).map(clone),
    get: (t, id) => clone(table(t).find(r => r[PK[t]] === Number(id))),
    find: (t, fn) => clone(table(t).find(fn)),
    where: (t, fn) => table(t).filter(fn).map(clone),
    count: (t, fn = () => true) => table(t).filter(fn).length,
    insert(t, row) {
      const rows = table(t), pk = PK[t];
      const id = rows.reduce((m, r) => Math.max(m, r[pk]), 0) + 1;
      const rec = { [pk]: id, ...row };
      rows.push(rec); persist();
      return clone(rec);
    },
    update(t, id, patch) {
      const r = table(t).find(x => x[PK[t]] === Number(id));
      if (!r) return null;
      Object.assign(r, patch); persist();
      return clone(r);
    },
    remove(t, id) {
      const rows = table(t), i = rows.findIndex(x => x[PK[t]] === Number(id));
      if (i >= 0) { rows.splice(i, 1); persist(); }
    },
    removeWhere(t, fn) {
      const d = load(); d[t] = d[t].filter(r => !fn(r)); persist();
    },
    /** Re-read from storage (used by pages that poll for live changes). */
    refresh() { cache = null; return load(); },
    reset() { cache = Seed.build(Date.now()); persist(); }
  };
})();
