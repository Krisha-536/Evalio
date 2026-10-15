/* =========================================================
   Evalio – core helpers (pure functions, no page logic)
   ========================================================= */
const EV = (() => {
  const pad = n => String(n).padStart(2, '0');

  /** Deterministic PRNG so a student always gets the same randomized paper. */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const round2 = n => Math.round(Number(n) * 100) / 100;
  const nowIso = () => new Date().toISOString();

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    return `${fmtDate(iso)}, ${fmtTime(iso)}`;
  }
  /** "31 min 12 s" */
  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h} h ${m} min`;
    return m ? `${m} min ${s} s` : `${s} s`;
  }
  /** "24:36" or "1:04:36" */
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function timeAgo(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return 'just now';
    if (d < 3600) return `${Math.floor(d / 60)} min ago`;
    if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
    if (d < 86400 * 7) return `${Math.floor(d / 86400)} d ago`;
    return fmtDate(iso);
  }
  /** Value for <input type="datetime-local"> in local time. */
  function toLocalInput(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const initials = name => (name || '?').replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const param = name => new URLSearchParams(location.search).get(name);
  const intParam = name => { const v = parseInt(param(name), 10); return Number.isFinite(v) ? v : null; };

  const OPTIONS = ['A', 'B', 'C', 'D'];
  const optText = (q, letter) => q['option_' + letter.toLowerCase()];

  /**
   * Evaluation module (Exp 7 §6): compares selections with correct answers,
   * applies the marking scheme (incl. negative marking) and builds the Result row.
   * @param exam       examination row
   * @param questions  question rows in the exam
   * @param selections { question_id: 'A'|'B'|'C'|'D' }
   */
  function evaluate(exam, questions, selections) {
    let score = 0, correct = 0, wrong = 0, attempted = 0;
    const graded = questions.map(q => {
      const sel = selections[q.question_id] || null;
      let is_correct = null, marks = 0;
      if (sel) {
        attempted++;
        is_correct = sel === q.correct_option;
        if (is_correct) { correct++; marks = Number(q.marks); }
        else { wrong++; marks = exam.negative_marking ? -Number(q.negative_marks || 0) : 0; }
      }
      score += marks;
      return { question_id: q.question_id, selected_option: sel, is_correct, marks_obtained: round2(marks) };
    });
    score = Math.max(0, round2(score));
    const total = Number(exam.total_marks) || 0;
    const percentage = total ? round2((score / total) * 100) : 0;
    return {
      graded,
      result: {
        total_questions: questions.length,
        attempted_questions: attempted,
        correct_answers: correct,
        wrong_answers: wrong,
        score,
        percentage,
        result_status: score >= Number(exam.passing_marks) ? 'Pass' : 'Fail'
      }
    };
  }

  const sum = arr => arr.reduce((a, b) => a + Number(b || 0), 0);
  const avg = arr => (arr.length ? sum(arr) / arr.length : 0);

  return {
    rng, shuffle, round2, nowIso, fmtDate, fmtTime, fmtDateTime, fmtDuration, fmtClock, timeAgo, toLocalInput,
    initials, esc, param, intParam, OPTIONS, optText, evaluate, sum, avg
  };
})();
