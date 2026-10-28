import os
import sys
import json
import random
import csv
import io
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, HTTPException, Request, Response, Depends, Query
from fastapi.responses import JSONResponse, Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from database import get_db, init_db, seed_database
from pdf_reports import generate_result_card_pdf

app = FastAPI(title="Evalio Examination API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Seed database on startup if not already seeded
@app.on_event("startup")
def startup_event():
    seed_database()

def now_iso():
    return datetime.now().isoformat()

def parse_iso(dt_str):
    if not dt_str:
        return None
    if isinstance(dt_str, datetime):
        if dt_str.tzinfo is not None:
            return dt_str.astimezone().replace(tzinfo=None)
        return dt_str
    try:
        dt = datetime.fromisoformat(str(dt_str).replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            return dt.astimezone().replace(tzinfo=None)
        return dt
    except Exception:
        return None

def parse_json_field(val, default=None):
    if val is None:
        return default
    if isinstance(val, (list, dict)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default if default is not None else val

def row_to_dict(row):
    if not row:
        return None
    d = dict(row)
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
        elif hasattr(v, '__float__') and type(v).__name__ == 'Decimal':
            d[k] = float(v)
    return d

def rows_to_list(rows):
    return [row_to_dict(r) for r in rows]

def log_activity(conn, role, user_id, user_name, action, details="", exam_id=None):
    conn.execute("""
        INSERT INTO activity_logs (exam_id, user_role, user_id, user_name, action, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (exam_id, role, user_id, user_name, action, details, now_iso()))

def get_ends_at(exam, schedule, attempt):
    started = parse_iso(attempt['started_at'])
    end_time = started + timedelta(minutes=exam['duration'])
    if schedule and schedule.get('end_time'):
        sched_end = parse_iso(schedule['end_time'])
        if sched_end and sched_end < end_time:
            end_time = sched_end
    return end_time

def evaluate_attempt(conn, attempt_id, auto=False, reason=""):
    c = conn.cursor()
    c.execute("SELECT * FROM exam_attempts WHERE attempt_id = ?", (attempt_id,))
    attempt = row_to_dict(c.fetchone())
    if not attempt or attempt['status'] in ('Submitted', 'Auto-Submitted'):
        c.execute("SELECT * FROM results WHERE exam_id = ? AND student_id = ?", (attempt['exam_id'], attempt['student_id']))
        return row_to_dict(c.fetchone())

    c.execute("SELECT * FROM examinations WHERE exam_id = ?", (attempt['exam_id'],))
    exam = row_to_dict(c.fetchone())

    c.execute("SELECT * FROM students WHERE student_id = ?", (attempt['student_id'],))
    student = row_to_dict(c.fetchone())

    sub_status = 'Auto-Submitted' if auto else 'Submitted'
    sub_time = now_iso()
    c.execute("""
        UPDATE exam_attempts
        SET status = ?, submitted_at = ?, last_activity = ?
        WHERE attempt_id = ?
    """, (sub_status, sub_time, sub_time, attempt_id))

    c.execute("""
        SELECT q.question_id, q.marks, q.negative_marks, q.correct_option
        FROM questions q
        JOIN exam_questions eq ON q.question_id = eq.question_id
        WHERE eq.exam_id = ?
        ORDER BY eq.question_order ASC
    """, (exam['exam_id'],))
    questions = rows_to_list(c.fetchall())

    c.execute("SELECT * FROM answers WHERE exam_id = ? AND student_id = ?", (exam['exam_id'], attempt['student_id']))
    ans_map = {a['question_id']: row_to_dict(a) for a in c.fetchall()}

    attempted = 0
    correct = 0
    wrong = 0
    score = 0.0
    total_q = len(questions)

    for q in questions:
        qid = q['question_id']
        ans = ans_map.get(qid)
        if ans and ans.get('selected_option'):
            attempted += 1
            is_corr = 1 if ans['selected_option'] == q['correct_option'] else 0
            if is_corr:
                correct += 1
                m_obt = float(q['marks'])
            else:
                wrong += 1
                m_obt = -float(q['negative_marks']) if exam['negative_marking'] else 0.0
            score += m_obt

            c.execute("""
                UPDATE answers
                SET is_correct = ?, marks_obtained = ?
                WHERE answer_id = ?
            """, (is_corr, m_obt, ans['answer_id']))

    score = max(0.0, round(score, 2))
    total_marks = float(exam['total_marks']) if exam['total_marks'] else sum(q['marks'] for q in questions)
    pct = round((score / total_marks * 100), 2) if total_marks else 0.0
    res_status = 'Pass' if score >= float(exam['passing_marks']) else 'Fail'

    c.execute("""
        INSERT INTO results (exam_id, student_id, total_questions, attempted_questions, correct_answers, wrong_answers, score, percentage, result_status, generated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(exam_id, student_id) DO UPDATE SET
            total_questions = excluded.total_questions,
            attempted_questions = excluded.attempted_questions,
            correct_answers = excluded.correct_answers,
            wrong_answers = excluded.wrong_answers,
            score = excluded.score,
            percentage = excluded.percentage,
            result_status = excluded.result_status,
            generated_at = excluded.generated_at
    """, (exam['exam_id'], student['student_id'], total_q, attempted, correct, wrong, score, pct, res_status, sub_time))

    c.execute("SELECT * FROM results WHERE exam_id = ? AND student_id = ?", (exam['exam_id'], student['student_id']))
    result = row_to_dict(c.fetchone())

    log_action = "Exam auto-submitted" if auto else "Exam submitted"
    log_details = f"{'Auto-submitted' if auto else 'Submitted'} \"{exam['exam_name']}\"{' — ' + reason if reason else ''}"
    log_activity(conn, 'student', student['student_id'], student['name'], log_action, log_details, exam['exam_id'])

    return result

def auto_expire_attempts(conn):
    c = conn.cursor()
    c.execute("SELECT * FROM exam_attempts WHERE status = 'In Progress' AND simulated = 0")
    attempts = rows_to_list(c.fetchall())
    now = datetime.now()
    for a in attempts:
        c.execute("SELECT * FROM examinations WHERE exam_id = ?", (a['exam_id'],))
        exam = row_to_dict(c.fetchone())
        c.execute("SELECT * FROM schedules WHERE exam_id = ?", (a['exam_id'],))
        sched = row_to_dict(c.fetchone())
        if exam:
            ends_at = get_ends_at(exam, sched, a)
            if now > ends_at + timedelta(seconds=2):
                evaluate_attempt(conn, a['attempt_id'], auto=True, reason="time expired")
    conn.commit()

# =========================================================================
# Authentication & Single-Device Session Enforcement
# =========================================================================

@app.post("/api/auth/login")
async def login(payload: Dict[str, Any]):
    identifier = str(payload.get("identifier", "")).strip().lower()
    password = str(payload.get("password", ""))
    role = str(payload.get("role", "student")).lower()

    if not identifier or not password:
        raise HTTPException(status_code=400, detail="Enter your email / student ID and password.")

    conn = get_db()
    c = conn.cursor()

    if role == "admin":
        c.execute("SELECT * FROM administrators WHERE LOWER(email) = ?", (identifier,))
        user = row_to_dict(c.fetchone())
        if not user or user["password"] != password:
            conn.close()
            raise HTTPException(status_code=401, detail="Invalid credentials. Please check and try again.")
        if user["status"] != "Active":
            conn.close()
            raise HTTPException(status_code=403, detail="This account is inactive. Contact the examination administrator.")

        session_token = f"adm_{random.randint(100000, 999999)}_{int(datetime.now().timestamp())}"
        user_key = f"admin:{user['admin_id']}"
        c.execute("""
            INSERT INTO active_sessions (user_key, device_token, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_key) DO UPDATE SET device_token = excluded.device_token, updated_at = excluded.updated_at
        """, (user_key, session_token, now_iso()))

        log_activity(conn, 'admin', user['admin_id'], user['name'], 'Login', 'Administrator signed in')
        conn.commit()
        conn.close()

        return {
            "role": "admin",
            "id": user["admin_id"],
            "name": user["name"],
            "email": user["email"],
            "token": session_token
        }
    else:
        c.execute("""
            SELECT s.*, c.course_name
            FROM students s
            LEFT JOIN courses c ON s.course_id = c.course_id
            WHERE LOWER(s.email) = ? OR LOWER(s.enrollment_no) = ?
        """, (identifier, identifier))
        user = row_to_dict(c.fetchone())
        if not user or user["password"] != password:
            conn.close()
            raise HTTPException(status_code=401, detail="Invalid credentials. Please check and try again.")
        if user["status"] != "Active":
            conn.close()
            raise HTTPException(status_code=403, detail="This account is inactive. Contact the examination administrator.")

        session_token = f"stu_{random.randint(100000, 999999)}_{int(datetime.now().timestamp())}"
        user_key = f"student:{user['student_id']}"
        c.execute("""
            INSERT INTO active_sessions (user_key, device_token, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_key) DO UPDATE SET device_token = excluded.device_token, updated_at = excluded.updated_at
        """, (user_key, session_token, now_iso()))

        log_activity(conn, 'student', user['student_id'], user['name'], 'Login', 'Student signed in')
        conn.commit()
        conn.close()

        return {
            "role": "student",
            "id": user["student_id"],
            "name": user["name"],
            "email": user["email"],
            "enrollment_no": user["enrollment_no"],
            "course_id": user["course_id"],
            "course_name": user["course_name"],
            "token": session_token
        }

@app.post("/api/auth/logout")
async def logout(payload: Dict[str, Any]):
    user_id = payload.get("id")
    role = payload.get("role", "student")
    conn = get_db()
    c = conn.cursor()
    user_key = f"{role}:{user_id}"
    c.execute("DELETE FROM active_sessions WHERE user_key = ?", (user_key,))
    log_activity(conn, role, user_id, payload.get("name", "User"), 'Logout', 'Signed out')
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.get("/api/auth/check-session")
async def check_session(role: str, user_id: int, token: str):
    conn = get_db()
    c = conn.cursor()
    user_key = f"{role}:{user_id}"
    c.execute("SELECT device_token FROM active_sessions WHERE user_key = ?", (user_key,))
    row = c.fetchone()
    conn.close()
    if not row or row[0] != token:
        raise HTTPException(status_code=401, detail="Session revoked because account signed in elsewhere.")
    return {"valid": True}

# =========================================================================
# Student APIs
# =========================================================================

@app.get("/api/students/{student_id}/exams")
async def get_student_exams(student_id: int):
    conn = get_db()
    auto_expire_attempts(conn)
    c = conn.cursor()

    c.execute("SELECT * FROM students WHERE student_id = ?", (student_id,))
    student = row_to_dict(c.fetchone())
    if not student:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found.")

    c.execute("""
        SELECT e.*, c.course_name,
               (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
        FROM examinations e
        JOIN courses c ON e.course_id = c.course_id
        WHERE e.course_id = ? AND e.status != 'Draft'
    """, (student['course_id'],))
    exams = rows_to_list(c.fetchall())

    now = datetime.now()
    out = {"available": [], "upcoming": [], "completed": [], "missed": []}

    for e in exams:
        c.execute("SELECT * FROM schedules WHERE exam_id = ?", (e['exam_id'],))
        sched = row_to_dict(c.fetchone())
        e['schedule'] = sched

        c.execute("SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?", (e['exam_id'], student_id))
        att = row_to_dict(c.fetchone())
        e['attempt'] = att

        if att and att['status'] in ('Submitted', 'Auto-Submitted'):
            c.execute("SELECT * FROM results WHERE exam_id = ? AND student_id = ?", (e['exam_id'], student_id))
            e['result'] = row_to_dict(c.fetchone()) if e['result_published'] else None
            out["completed"].append(e)
        elif not sched:
            pass
        else:
            st = parse_iso(sched['start_time'])
            et = parse_iso(sched['end_time'])
            if now < st:
                out["upcoming"].append(e)
            elif now <= et:
                out["available"].append(e)
            else:
                out["missed"].append(e)

    conn.close()
    return out

@app.get("/api/exams/{exam_id}")
async def get_exam_info(exam_id: int, student: Optional[int] = Query(None)):
    conn = get_db()
    auto_expire_attempts(conn)
    c = conn.cursor()

    c.execute("""
        SELECT e.*, c.course_name,
               (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
        FROM examinations e
        JOIN courses c ON e.course_id = c.course_id
        WHERE e.exam_id = ?
    """, (exam_id,))
    exam = row_to_dict(c.fetchone())
    if not exam:
        conn.close()
        raise HTTPException(status_code=404, detail="Examination not found.")

    c.execute("SELECT * FROM schedules WHERE exam_id = ?", (exam_id,))
    exam['schedule'] = row_to_dict(c.fetchone())

    exam['can_start'] = False
    exam['block_reason'] = ""
    exam['attempt'] = None

    if student:
        c.execute("SELECT * FROM students WHERE student_id = ?", (student,))
        s_rec = row_to_dict(c.fetchone())
        c.execute("SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?", (exam_id, student))
        att = row_to_dict(c.fetchone())
        exam['attempt'] = att

        now = datetime.now()
        sched = exam['schedule']
        is_done = att and att['status'] in ('Submitted', 'Auto-Submitted')

        if not s_rec or s_rec['course_id'] != exam['course_id']:
            exam['block_reason'] = "This examination is not assigned to your course."
        elif is_done:
            exam['block_reason'] = "You have already submitted this examination."
        elif not sched or exam['status'] == 'Draft':
            exam['block_reason'] = "This examination has not been scheduled yet."
        elif now < parse_iso(sched['start_time']):
            exam['block_reason'] = "This examination has not started yet."
        elif now > parse_iso(sched['end_time']):
            exam['block_reason'] = "The examination window has closed."
        else:
            exam['can_start'] = True

    conn.close()
    return exam

@app.post("/api/exams/{exam_id}/attempts")
async def start_or_resume_attempt(exam_id: int, payload: Dict[str, Any]):
    session = payload.get("session") or payload
    student_id = session.get("id")
    device_token = session.get("token", "")

    conn = get_db()
    auto_expire_attempts(conn)
    c = conn.cursor()

    c.execute("SELECT * FROM examinations WHERE exam_id = ?", (exam_id,))
    exam = row_to_dict(c.fetchone())
    if not exam:
        conn.close()
        raise HTTPException(status_code=404, detail="Examination not found.")

    c.execute("SELECT * FROM students WHERE student_id = ?", (student_id,))
    student = row_to_dict(c.fetchone())
    if not student or student['course_id'] != exam['course_id']:
        conn.close()
        raise HTTPException(status_code=403, detail="This examination is not assigned to your course.")

    c.execute("SELECT * FROM schedules WHERE exam_id = ?", (exam_id,))
    sched = row_to_dict(c.fetchone())
    now = datetime.now()

    if not sched or exam['status'] == 'Draft' or now < parse_iso(sched['start_time']):
        conn.close()
        raise HTTPException(status_code=400, detail="This examination has not started yet.")
    if now > parse_iso(sched['end_time']):
        conn.close()
        raise HTTPException(status_code=400, detail="The examination window has closed.")

    c.execute("SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?", (exam_id, student_id))
    att = row_to_dict(c.fetchone())

    if att:
        if att['status'] in ('Submitted', 'Auto-Submitted'):
            conn.close()
            raise HTTPException(status_code=400, detail="You have already submitted this examination.")
        c.execute("UPDATE exam_attempts SET device_token = ?, last_activity = ? WHERE attempt_id = ?",
                  (device_token, now_iso(), att['attempt_id']))
        log_activity(conn, 'student', student_id, student['name'], 'Exam resumed', f"Resumed \"{exam['exam_name']}\"", exam_id)
        conn.commit()
        conn.close()
        return att['attempt_id']

    c.execute("""
        SELECT q.question_id
        FROM questions q
        JOIN exam_questions eq ON q.question_id = eq.question_id
        WHERE eq.exam_id = ?
        ORDER BY eq.question_order ASC
    """, (exam_id,))
    qids = [row[0] for row in c.fetchall()]

    rng = random.Random(int(datetime.now().timestamp()) + student_id)
    if exam['shuffle_questions']:
        rng.shuffle(qids)

    option_order = {}
    for qid in qids:
        opts = ['A', 'B', 'C', 'D']
        if exam['shuffle_options']:
            rng.shuffle(opts)
        option_order[str(qid)] = opts

    started_at = now_iso()
    c.execute("""
        INSERT INTO exam_attempts (exam_id, student_id, started_at, status, question_order, option_order, marked, current_index, tab_switches, last_activity, device_token)
        VALUES (?, ?, ?, 'In Progress', ?, ?, '[]', 0, 0, ?, ?)
    """, (exam_id, student_id, started_at, json.dumps(qids), json.dumps(option_order), started_at, device_token))

    att_id = c.lastrowid
    log_activity(conn, 'student', student_id, student['name'], 'Exam started', f"Started \"{exam['exam_name']}\"", exam_id)
    conn.commit()
    conn.close()
    return att_id

@app.get("/api/attempts/{attempt_id}")
async def get_attempt_detail(attempt_id: int):
    conn = get_db()
    auto_expire_attempts(conn)
    c = conn.cursor()

    c.execute("SELECT * FROM exam_attempts WHERE attempt_id = ?", (attempt_id,))
    att = row_to_dict(c.fetchone())
    if not att:
        conn.close()
        raise HTTPException(status_code=404, detail="Attempt not found.")

    c.execute("""
        SELECT e.*, c.course_name,
               (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
        FROM examinations e
        JOIN courses c ON e.course_id = c.course_id
        WHERE e.exam_id = ?
    """, (att['exam_id'],))
    exam = row_to_dict(c.fetchone())

    c.execute("SELECT * FROM schedules WHERE exam_id = ?", (att['exam_id'],))
    sched = row_to_dict(c.fetchone())
    exam['schedule'] = sched

    c.execute("SELECT question_id, selected_option FROM answers WHERE exam_id = ? AND student_id = ?", (att['exam_id'], att['student_id']))
    answers = {a[0]: a[1] for a in c.fetchall()}

    q_order = parse_json_field(att['question_order'], [])
    opt_order = parse_json_field(att['option_order'], {})
    marked = parse_json_field(att.get('marked'), [])

    questions = []
    for qid in q_order:
        c.execute("SELECT * FROM questions WHERE question_id = ?", (qid,))
        q = row_to_dict(c.fetchone())
        if q:
            opts = opt_order.get(str(qid), ['A', 'B', 'C', 'D'])
            questions.append({
                "question_id": q["question_id"],
                "question_text": q["question_text"],
                "topic": q["topic"],
                "marks": q["marks"],
                "negative_marks": q["negative_marks"] if exam["negative_marking"] else 0,
                "options": [{"key": k, "text": q[f"option_{k.lower()}"]} for k in opts]
            })

    ends_at_dt = get_ends_at(exam, sched, att)
    server_now = datetime.now()

    conn.close()
    return {
        "attempt": {
            "attempt_id": att["attempt_id"],
            "status": att["status"],
            "started_at": att["started_at"],
            "current_index": att["current_index"],
            "marked": marked,
            "tab_switches": att["tab_switches"],
            "device_token": att["device_token"]
        },
        "exam": exam,
        "questions": questions,
        "answers": answers,
        "ends_at": int(ends_at_dt.timestamp() * 1000),
        "server_now": int(server_now.timestamp() * 1000)
    }

@app.put("/api/attempts/{attempt_id}/answers/{question_id}")
async def save_answer(attempt_id: int, question_id: int, payload: Dict[str, Any]):
    selected_option = payload.get("selected_option")
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT * FROM exam_attempts WHERE attempt_id = ?", (attempt_id,))
    att = row_to_dict(c.fetchone())
    if not att or att['status'] != 'In Progress':
        conn.close()
        raise HTTPException(status_code=400, detail="Examination has already been submitted.")

    c.execute("SELECT * FROM examinations WHERE exam_id = ?", (att['exam_id'],))
    exam = row_to_dict(c.fetchone())
    c.execute("SELECT * FROM schedules WHERE exam_id = ?", (att['exam_id'],))
    sched = row_to_dict(c.fetchone())

    ends_at = get_ends_at(exam, sched, att)
    if datetime.now() > ends_at + timedelta(seconds=5):
        evaluate_attempt(conn, attempt_id, auto=True, reason="time expired")
        conn.commit()
        conn.close()
        raise HTTPException(status_code=400, detail="Time is up — your examination was submitted automatically.")

    saved_at = now_iso()
    if not selected_option:
        c.execute("DELETE FROM answers WHERE exam_id = ? AND student_id = ? AND question_id = ?",
                  (att['exam_id'], att['student_id'], question_id))
    else:
        c.execute("""
            INSERT INTO answers (exam_id, student_id, question_id, selected_option, is_correct, marks_obtained, saved_at)
            VALUES (?, ?, ?, ?, NULL, 0, ?)
            ON CONFLICT(exam_id, student_id, question_id) DO UPDATE SET
                selected_option = excluded.selected_option,
                saved_at = excluded.saved_at
        """, (att['exam_id'], att['student_id'], question_id, selected_option, saved_at))

    c.execute("UPDATE exam_attempts SET last_activity = ? WHERE attempt_id = ?", (saved_at, attempt_id))
    conn.commit()
    conn.close()
    return {"saved_at": saved_at}

@app.patch("/api/attempts/{attempt_id}")
async def save_progress(attempt_id: int, payload: Dict[str, Any]):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM exam_attempts WHERE attempt_id = ?", (attempt_id,))
    att = row_to_dict(c.fetchone())
    if not att or att['status'] != 'In Progress':
        conn.close()
        return False

    updates = []
    params = []
    if "current_index" in payload:
        updates.append("current_index = ?")
        params.append(payload["current_index"])
    if "marked" in payload:
        updates.append("marked = ?")
        params.append(json.dumps(payload["marked"]))

    if updates:
        updates.append("last_activity = ?")
        params.append(now_iso())
        params.append(attempt_id)
        c.execute(f"UPDATE exam_attempts SET {', '.join(updates)} WHERE attempt_id = ?", params)
        conn.commit()

    conn.close()
    return True

@app.post("/api/attempts/{attempt_id}/events")
async def report_violation(attempt_id: int, payload: Dict[str, Any]):
    event_type = payload.get("type", "Tab switch")
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT * FROM exam_attempts WHERE attempt_id = ?", (attempt_id,))
    att = row_to_dict(c.fetchone())
    if not att or att['status'] != 'In Progress':
        conn.close()
        return {"count": att['tab_switches'] if att else 0, "max": 0, "submitted": True}

    c.execute("SELECT * FROM examinations WHERE exam_id = ?", (att['exam_id'],))
    exam = row_to_dict(c.fetchone())
    c.execute("SELECT * FROM students WHERE student_id = ?", (att['student_id'],))
    student = row_to_dict(c.fetchone())

    switches = att['tab_switches'] + 1
    max_switches = exam['max_tab_switches'] or 3
    c.execute("UPDATE exam_attempts SET tab_switches = ?, last_activity = ? WHERE attempt_id = ?",
              (switches, now_iso(), attempt_id))

    log_activity(conn, 'student', student['student_id'], student['name'], 'Tab switch detected',
                 f"{event_type} (warning {switches} of {max_switches})", exam['exam_id'])

    submitted = False
    if switches >= max_switches:
        evaluate_attempt(conn, attempt_id, auto=True, reason="tab-switch limit reached")
        submitted = True

    conn.commit()
    conn.close()
    return {"count": switches, "max": max_switches, "submitted": submitted}

@app.post("/api/attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: int, payload: Optional[Dict[str, Any]] = None):
    auto = bool(payload and payload.get("auto"))
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT exam_id FROM exam_attempts WHERE attempt_id = ?", (attempt_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Attempt not found.")
    exam_id = row[0]

    evaluate_attempt(conn, attempt_id, auto=auto, reason="time expired" if auto else "User submitted")

    c.execute("SELECT result_published FROM examinations WHERE exam_id = ?", (exam_id,))
    pub = c.fetchone()[0]
    conn.commit()
    conn.close()
    return {"exam_id": exam_id, "published": bool(pub)}

@app.get("/api/results")
async def get_results(exam: int, student: int):
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        SELECT e.*, c.course_name,
               (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
        FROM examinations e
        JOIN courses c ON e.course_id = c.course_id
        WHERE e.exam_id = ?
    """, (exam,))
    exam_rec = row_to_dict(c.fetchone())

    c.execute("SELECT s.*, c.course_name FROM students s JOIN courses c ON s.course_id = c.course_id WHERE s.student_id = ?", (student,))
    student_rec = row_to_dict(c.fetchone())

    c.execute("SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?", (exam, student))
    att = row_to_dict(c.fetchone())
    if not att or att['status'] not in ('Submitted', 'Auto-Submitted'):
        conn.close()
        raise HTTPException(status_code=400, detail="You have not submitted this examination yet.")

    c.execute("SELECT * FROM results WHERE exam_id = ? AND student_id = ?", (exam, student))
    res = row_to_dict(c.fetchone())

    started_p = parse_iso(att['started_at'])
    submitted_p = parse_iso(att['submitted_at'])
    time_taken_ms = int((submitted_p - started_p).total_seconds() * 1000) if started_p and submitted_p else 0

    conn.close()
    return {
        "exam": exam_rec,
        "student": {
            "name": student_rec["name"],
            "enrollment_no": student_rec["enrollment_no"],
            "course_name": student_rec["course_name"]
        },
        "attempt": {
            "status": att["status"],
            "started_at": att["started_at"],
            "submitted_at": att["submitted_at"],
            "time_taken_ms": time_taken_ms,
            "tab_switches": att["tab_switches"]
        },
        "published": bool(exam_rec["result_published"]),
        "result": res if exam_rec["result_published"] else None
    }

@app.get("/api/results/{exam_id}/{student_id}/analysis")
async def get_analysis(exam_id: int, student_id: int):
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT * FROM examinations WHERE exam_id = ?", (exam_id,))
    exam = row_to_dict(c.fetchone())
    if not exam:
        conn.close()
        raise HTTPException(status_code=404, detail="Examination not found.")
    if not exam['result_published']:
        conn.close()
        raise HTTPException(status_code=403, detail="Results for this examination have not been published yet.")

    c.execute("SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?", (exam_id, student_id))
    att = row_to_dict(c.fetchone())
    if not att or att['status'] not in ('Submitted', 'Auto-Submitted'):
        conn.close()
        raise HTTPException(status_code=400, detail="You have not submitted this examination yet.")

    c.execute("SELECT * FROM results WHERE exam_id = ? AND student_id = ?", (exam_id, student_id))
    res = row_to_dict(c.fetchone())

    c.execute("SELECT * FROM answers WHERE exam_id = ? AND student_id = ?", (exam_id, student_id))
    ans_map = {a['question_id']: row_to_dict(a) for a in c.fetchall()}

    q_order = parse_json_field(att['question_order'], [])
    opt_order = parse_json_field(att['option_order'], {})

    questions = []
    topics_dict = {}

    for i, qid in enumerate(q_order):
        c.execute("SELECT * FROM questions WHERE question_id = ?", (qid,))
        q = row_to_dict(c.fetchone())
        ans = ans_map.get(qid)
        sel = ans['selected_option'] if ans else None
        state = 'unattempted' if not sel else ('correct' if sel == q['correct_option'] else 'incorrect')

        opts = opt_order.get(str(qid), ['A', 'B', 'C', 'D'])
        questions.append({
            "no": i + 1,
            "question_id": qid,
            "question_text": q["question_text"],
            "topic": q["topic"],
            "difficulty": q["difficulty"],
            "marks": q["marks"],
            "options": [{"key": k, "text": q[f"option_{k.lower()}"]} for k in opts],
            "correct_option": q["correct_option"],
            "selected_option": sel,
            "state": state,
            "marks_obtained": ans['marks_obtained'] if ans else 0
        })

        if q['topic'] not in topics_dict:
            topics_dict[q['topic']] = {"topic": q['topic'], "total": 0, "correct": 0}
        topics_dict[q['topic']]["total"] += 1
        if state == 'correct':
            topics_dict[q['topic']]["correct"] += 1

    c.execute("SELECT score, percentage FROM results WHERE exam_id = ?", (exam_id,))
    class_results = rows_to_list(c.fetchall())
    class_avg = round(sum(r['percentage'] for r in class_results) / len(class_results), 2) if class_results else None
    rank = sum(1 for r in class_results if r['score'] > res['score']) + 1

    conn.close()
    return {
        "exam": exam,
        "result": res,
        "questions": questions,
        "topics": list(topics_dict.values()),
        "class_average": class_avg,
        "rank": rank,
        "class_size": len(class_results)
    }

@app.get("/api/students/{student_id}/results")
async def get_student_history(student_id: int):
    conn = get_db()
    auto_expire_attempts(conn)
    c = conn.cursor()

    c.execute("""
        SELECT a.*, e.exam_name, e.subject, e.duration, e.total_marks, e.passing_marks, e.result_published,
               c.course_name,
               (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
        FROM exam_attempts a
        JOIN examinations e ON a.exam_id = e.exam_id
        JOIN courses c ON e.course_id = c.course_id
        WHERE a.student_id = ? AND a.status IN ('Submitted', 'Auto-Submitted')
        ORDER BY a.submitted_at DESC
    """, (student_id,))
    attempts = rows_to_list(c.fetchall())

    out = []
    for a in attempts:
        c.execute("SELECT * FROM results WHERE exam_id = ? AND student_id = ?", (a['exam_id'], student_id))
        res = row_to_dict(c.fetchone())
        out.append({
            "exam": {
                "exam_id": a["exam_id"],
                "exam_name": a["exam_name"],
                "subject": a["subject"],
                "course_name": a["course_name"],
                "question_count": a["question_count"],
                "total_marks": a["total_marks"]
            },
            "submitted_at": a["submitted_at"],
            "status": a["status"],
            "published": bool(a["result_published"]),
            "result": res if a["result_published"] else None
        })

    conn.close()
    return out

@app.get("/api/notifications")
async def get_notifications(course_id: Optional[int] = None, role: Optional[str] = "student"):
    conn = get_db()
    c = conn.cursor()
    if role == "admin":
        c.execute("SELECT * FROM notifications ORDER BY created_at DESC")
    elif course_id:
        c.execute("SELECT * FROM notifications WHERE course_id IS NULL OR course_id = ? ORDER BY created_at DESC", (course_id,))
    else:
        c.execute("SELECT * FROM notifications ORDER BY created_at DESC")
    rows = rows_to_list(c.fetchall())
    conn.close()
    return rows

# =========================================================================
# Administrator APIs
# =========================================================================

@app.get("/api/admin/overview")
async def admin_overview():
    conn = get_db()
    auto_expire_attempts(conn)
    c = conn.cursor()

    c.execute("SELECT COUNT(*) FROM students")
    total_students = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM students WHERE status = 'Active'")
    active_students = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM courses")
    total_courses = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM questions")
    total_questions = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM examinations")
    total_exams = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM exam_attempts WHERE status = 'In Progress'")
    in_progress = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM results")
    total_results = c.fetchone()[0]

    c.execute("""
        SELECT e.*, c.course_name,
               (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
        FROM examinations e
        JOIN courses c ON e.course_id = c.course_id
        WHERE e.status = 'Active'
    """)
    live_raw = rows_to_list(c.fetchall())
    live = []
    for e in live_raw:
        c.execute("SELECT COUNT(*) FROM students WHERE course_id = ? AND status = 'Active'", (e['course_id'],))
        assigned = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM exam_attempts WHERE exam_id = ? AND status = 'In Progress'", (e['exam_id'],))
        inp = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM exam_attempts WHERE exam_id = ? AND status IN ('Submitted', 'Auto-Submitted')", (e['exam_id'],))
        sub = c.fetchone()[0]
        c.execute("SELECT COALESCE(SUM(tab_switches), 0) FROM exam_attempts WHERE exam_id = ? AND status = 'In Progress'", (e['exam_id'],))
        alerts = c.fetchone()[0]
        c.execute("SELECT * FROM schedules WHERE exam_id = ?", (e['exam_id'],))
        e['schedule'] = row_to_dict(c.fetchone())
        live.append({
            **e,
            "assigned": assigned,
            "in_progress": inp,
            "submitted": sub,
            "alerts": alerts
        })

    c.execute("""
        SELECT e.exam_name, AVG(r.percentage) as avg,
               (SUM(CASE WHEN r.result_status = 'Pass' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as pass_rate
        FROM results r
        JOIN examinations e ON r.exam_id = e.exam_id
        GROUP BY e.exam_id, e.exam_name
    """)
    perf = [{"exam_name": row[0], "avg": round(row[1], 2), "pass_rate": round(row[2], 2)} for row in c.fetchall()]

    c.execute("""
        SELECT s.*, e.exam_name
        FROM schedules s
        JOIN examinations e ON s.exam_id = e.exam_id
        WHERE s.status = 'Scheduled'
    """)
    upcoming = rows_to_list(c.fetchall())

    c.execute("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 8")
    recent = rows_to_list(c.fetchall())

    conn.close()
    return {
        "counts": {
            "students": total_students,
            "active_students": active_students,
            "courses": total_courses,
            "questions": total_questions,
            "exams": total_exams,
            "live_exams": len(live),
            "in_progress": in_progress,
            "results": total_results
        },
        "live": live,
        "perf": perf,
        "upcoming": upcoming,
        "recent": recent
    }

@app.get("/api/admin/monitor/{exam_id}")
async def admin_monitor(exam_id: int):
    conn = get_db()
    auto_expire_attempts(conn)
    c = conn.cursor()

    c.execute("""
        SELECT e.*, c.course_name,
               (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
        FROM examinations e
        JOIN courses c ON e.course_id = c.course_id
        WHERE e.exam_id = ?
    """, (exam_id,))
    exam = row_to_dict(c.fetchone())
    if not exam:
        conn.close()
        raise HTTPException(status_code=404, detail="Examination not found.")

    c.execute("SELECT * FROM schedules WHERE exam_id = ?", (exam_id,))
    exam['schedule'] = row_to_dict(c.fetchone())

    c.execute("SELECT * FROM students WHERE course_id = ? AND status = 'Active'", (exam['course_id'],))
    students = rows_to_list(c.fetchall())

    now = datetime.now()
    rows = []
    for s in students:
        c.execute("SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?", (exam_id, s['student_id']))
        att = row_to_dict(c.fetchone())
        ans_count = 0
        score = None
        remaining_ms = None
        if att:
            c.execute("SELECT COUNT(*) FROM answers WHERE exam_id = ? AND student_id = ? AND selected_option IS NOT NULL",
                      (exam_id, s['student_id']))
            ans_count = c.fetchone()[0]
            if att['status'] == 'In Progress':
                ends_at = get_ends_at(exam, exam['schedule'], att)
                remaining_ms = max(0, int((ends_at - now).total_seconds() * 1000))
            elif att['status'] in ('Submitted', 'Auto-Submitted'):
                c.execute("SELECT score FROM results WHERE exam_id = ? AND student_id = ?", (exam_id, s['student_id']))
                r_row = c.fetchone()
                if r_row:
                    score = r_row[0]

        rows.append({
            "student_id": s["student_id"],
            "name": s["name"],
            "enrollment_no": s["enrollment_no"],
            "status": att["status"] if att else "Not Started",
            "answered": ans_count,
            "total": exam["question_count"],
            "current": (att["current_index"] + 1) if att else None,
            "remaining_ms": remaining_ms,
            "tab_switches": att["tab_switches"] if att else 0,
            "started_at": att["started_at"] if att else None,
            "submitted_at": att["submitted_at"] if att else None,
            "last_activity": att["last_activity"] if att else None,
            "score": score
        })

    c.execute("SELECT * FROM activity_logs WHERE exam_id = ? ORDER BY created_at DESC LIMIT 15", (exam_id,))
    events = rows_to_list(c.fetchall())

    conn.close()
    return {
        "exam": exam,
        "rows": rows,
        "events": events
    }

@app.get("/api/admin/simulate-tick")
async def simulate_tick():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM exam_attempts WHERE simulated = 1 AND status = 'In Progress'")
    live = rows_to_list(c.fetchall())
    if not live:
        conn.close()
        return False

    a = random.choice(live)
    q_order = json.loads(a['question_order'])

    c.execute("SELECT question_id FROM answers WHERE exam_id = ? AND student_id = ?", (a['exam_id'], a['student_id']))
    answered_ids = set(row[0] for row in c.fetchall())

    unanswered = [qid for qid in q_order if qid not in answered_ids]
    if not unanswered:
        evaluate_attempt(conn, a['attempt_id'], auto=False)
        conn.commit()
        conn.close()
        return True

    next_q = unanswered[0]
    c.execute("SELECT * FROM questions WHERE question_id = ?", (next_q,))
    q = row_to_dict(c.fetchone())
    sel = q['correct_option'] if random.random() < 0.65 else random.choice(['A', 'B', 'C', 'D'])

    now_str = now_iso()
    c.execute("""
        INSERT INTO answers (exam_id, student_id, question_id, selected_option, is_correct, marks_obtained, saved_at)
        VALUES (?, ?, ?, ?, NULL, 0, ?)
    """, (a['exam_id'], a['student_id'], next_q, sel, now_str))

    curr_idx = min(q_order.index(next_q) + 1, len(q_order) - 1)
    tabs = a['tab_switches']
    if random.random() < 0.05 and tabs < 2:
        tabs += 1
        c.execute("SELECT * FROM students WHERE student_id = ?", (a['student_id'],))
        st = row_to_dict(c.fetchone())
        log_activity(conn, 'student', st['student_id'], st['name'], 'Tab switch detected',
                     f"Left the examination window (warning {tabs} of 3)", a['exam_id'])

    c.execute("UPDATE exam_attempts SET current_index = ?, tab_switches = ?, last_activity = ? WHERE attempt_id = ?",
              (curr_idx, tabs, now_str, a['attempt_id']))

    conn.commit()
    conn.close()
    return True

@app.post("/api/exams")
async def save_exam(payload: Dict[str, Any]):
    exam_data = payload.get("exam", payload)
    q_ids = payload.get("question_ids", [])
    session = payload.get("session")

    conn = get_db()
    c = conn.cursor()

    if not q_ids and exam_data.get("status") != "Draft":
        conn.close()
        raise HTTPException(status_code=400, detail="Add at least one question, or save the examination as Draft.")

    c.execute(f"SELECT SUM(marks) FROM questions WHERE question_id IN ({','.join(['?']*len(q_ids))})", q_ids) if q_ids else None
    marks_sum = c.fetchone()[0] if q_ids else 0.0
    marks_sum = float(marks_sum or 0.0)

    if float(exam_data.get("passing_marks", 0)) > marks_sum and q_ids:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Passing marks cannot exceed total marks ({marks_sum}).")

    exam_id = exam_data.get("exam_id")
    if exam_id:
        c.execute("""
            UPDATE examinations
            SET exam_name = ?, course_id = ?, subject = ?, description = ?, duration = ?,
                total_marks = ?, passing_marks = ?, negative_marking = ?, shuffle_questions = ?,
                shuffle_options = ?, result_published = ?, max_tab_switches = ?
            WHERE exam_id = ?
        """, (
            exam_data["exam_name"], exam_data["course_id"], exam_data["subject"], exam_data.get("description", ""),
            exam_data["duration"], marks_sum, exam_data["passing_marks"], 1 if exam_data.get("negative_marking") else 0,
            1 if exam_data.get("shuffle_questions") else 0, 1 if exam_data.get("shuffle_options") else 0,
            1 if exam_data.get("result_published") else 0, exam_data.get("max_tab_switches", 3),
            exam_id
        ))
    else:
        c.execute("""
            INSERT INTO examinations (exam_name, course_id, subject, description, duration, total_marks, passing_marks, negative_marking, status, shuffle_questions, shuffle_options, result_published, max_tab_switches, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            exam_data["exam_name"], exam_data["course_id"], exam_data["subject"], exam_data.get("description", ""),
            exam_data["duration"], marks_sum, exam_data["passing_marks"], 1 if exam_data.get("negative_marking") else 0,
            exam_data.get("status", "Draft"), 1 if exam_data.get("shuffle_questions") else 0,
            1 if exam_data.get("shuffle_options") else 0, 1 if exam_data.get("result_published") else 0,
            exam_data.get("max_tab_switches", 3), now_iso()
        ))
        exam_id = c.lastrowid

    c.execute("DELETE FROM exam_questions WHERE exam_id = ?", (exam_id,))
    for idx, qid in enumerate(q_ids):
        c.execute("INSERT INTO exam_questions (exam_id, question_id, question_order) VALUES (?, ?, ?)",
                  (exam_id, qid, idx + 1))

    c.execute("SELECT * FROM examinations WHERE exam_id = ?", (exam_id,))
    rec = row_to_dict(c.fetchone())

    admin_name = session.get("name", "Administrator") if session else "Administrator"
    admin_id = session.get("id") if session else None
    log_activity(conn, 'admin', admin_id, admin_name, 'Exam updated' if exam_data.get("exam_id") else 'Exam created',
                 f"\"{rec['exam_name']}\" — {len(q_ids)} questions, {marks_sum} marks", exam_id)

    conn.commit()
    conn.close()
    return rec

@app.get("/api/exams/{exam_id}/questions")
async def get_exam_questions(exam_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT question_id FROM exam_questions WHERE exam_id = ? ORDER BY question_order ASC", (exam_id,))
    qids = [row[0] for row in c.fetchall()]
    conn.close()
    return qids

@app.post("/api/schedules")
async def save_schedule(payload: Dict[str, Any]):
    exam_id = payload.get("exam_id")
    start_time = payload.get("start_time")
    end_time = payload.get("end_time")
    notify = payload.get("notify", False)

    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT * FROM examinations WHERE exam_id = ?", (exam_id,))
    exam = row_to_dict(c.fetchone())
    if not exam:
        conn.close()
        raise HTTPException(status_code=400, detail="Choose an examination.")

    st = parse_iso(start_time)
    et = parse_iso(end_time)
    if et <= st:
        conn.close()
        raise HTTPException(status_code=400, detail="End time must be after the start time.")

    duration_td = timedelta(minutes=exam['duration'])
    if et - st < duration_td:
        conn.close()
        raise HTTPException(status_code=400, detail=f"The window must be at least the exam duration ({exam['duration']} min).")

    now = datetime.now()
    sched_status = 'Scheduled' if now < st else ('Active' if now <= et else 'Completed')

    c.execute("""
        INSERT INTO schedules (exam_id, start_time, end_time, status)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(exam_id) DO UPDATE SET
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            status = excluded.status
    """, (exam_id, start_time, end_time, sched_status))

    if exam['status'] == 'Draft':
        c.execute("UPDATE examinations SET status = ? WHERE exam_id = ?", (sched_status, exam_id))

    if notify:
        c.execute("""
            INSERT INTO notifications (title, message, course_id, type, created_at)
            VALUES (?, ?, ?, 'exam', ?)
        """, (
            "Examination scheduled",
            f"{exam['exam_name']} is scheduled from {st.strftime('%d %b %Y, %I:%M %p')} to {et.strftime('%d %b %Y, %I:%M %p')}.",
            exam['course_id'], now_iso()
        ))

    c.execute("SELECT * FROM schedules WHERE exam_id = ?", (exam_id,))
    sched = row_to_dict(c.fetchone())
    conn.commit()
    conn.close()
    return sched

@app.get("/api/exams/{exam_id}/results")
async def get_exam_results_table(exam_id: int):
    conn = get_db()
    auto_expire_attempts(conn)
    c = conn.cursor()

    c.execute("""
        SELECT e.*, c.course_name,
               (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
        FROM examinations e
        JOIN courses c ON e.course_id = c.course_id
        WHERE e.exam_id = ?
    """, (exam_id,))
    exam = row_to_dict(c.fetchone())

    c.execute("""
        SELECT r.*, s.name, s.enrollment_no, a.status as submission, a.started_at, a.submitted_at, a.tab_switches
        FROM results r
        JOIN students s ON r.student_id = s.student_id
        JOIN exam_attempts a ON r.exam_id = a.exam_id AND r.student_id = a.student_id
        WHERE r.exam_id = ?
        ORDER BY r.score DESC
    """, (exam_id,))
    rows = rows_to_list(c.fetchall())

    for idx, r in enumerate(rows):
        st = parse_iso(r['started_at'])
        et = parse_iso(r['submitted_at'])
        r['time_taken_ms'] = int((et - st).total_seconds() * 1000) if st and et else 0
        r['rank'] = idx + 1 if (idx == 0 or rows[idx - 1]['score'] != r['score']) else rows[idx - 1]['rank']

    stats = None
    if rows:
        scores = [r['score'] for r in rows]
        pcts = [r['percentage'] for r in rows]
        pass_count = sum(1 for r in rows if r['result_status'] == 'Pass')
        stats = {
            "attempted": len(rows),
            "average": round(sum(pcts) / len(pcts), 2),
            "highest": max(scores),
            "lowest": min(scores),
            "pass_rate": round(pass_count / len(rows) * 100, 2)
        }

    conn.close()
    return {
        "exam": exam,
        "rows": rows,
        "stats": stats
    }

@app.put("/api/exams/{exam_id}/publish")
async def publish_results(exam_id: int, payload: Dict[str, Any]):
    published = bool(payload.get("published"))
    conn = get_db()
    c = conn.cursor()

    c.execute("UPDATE examinations SET result_published = ? WHERE exam_id = ?", (1 if published else 0, exam_id))
    c.execute("SELECT * FROM examinations WHERE exam_id = ?", (exam_id,))
    exam = row_to_dict(c.fetchone())

    if published:
        c.execute("""
            INSERT INTO notifications (title, message, course_id, type, created_at)
            VALUES (?, ?, ?, 'result', ?)
        """, ("Results published", f"Results for {exam['exam_name']} are now available.", exam['course_id'], now_iso()))

    log_activity(conn, 'admin', 1, 'Administrator', 'Results published' if published else 'Results withdrawn', f"\"{exam['exam_name']}\"", exam_id)
    conn.commit()
    conn.close()
    return exam

@app.get("/api/admin/analytics")
async def get_analytics(exam: Optional[str] = None):
    conn = get_db()
    c = conn.cursor()

    exam_filter = f"WHERE e.exam_id = {int(exam)}" if exam and exam != "all" else ""
    c.execute(f"""
        SELECT DISTINCT e.*
        FROM examinations e
        JOIN results r ON e.exam_id = r.exam_id
        {exam_filter}
    """)
    exams = rows_to_list(c.fetchall())
    exam_ids = [e['exam_id'] for e in exams]

    if not exam_ids:
        conn.close()
        return {
            "exams": [],
            "totals": {"results": 0, "average": 0, "pass": 0, "fail": 0},
            "distribution": [{"label": f"{i*10}–{i*10+10}%", "count": 0} for i in range(10)],
            "subjects": [],
            "difficulty": [],
            "topics": [],
            "hardest": [],
            "per_exam": []
        }

    in_clause = f"({','.join(str(eid) for eid in exam_ids)})"
    c.execute(f"SELECT * FROM results WHERE exam_id IN {in_clause}")
    results = rows_to_list(c.fetchall())

    buckets = [{"label": f"{i*10}–{i*10+10}%", "count": 0} for i in range(10)]
    for r in results:
        idx = min(9, int(r['percentage'] // 10))
        buckets[idx]["count"] += 1

    pass_count = sum(1 for r in results if r['result_status'] == 'Pass')
    fail_count = len(results) - pass_count
    avg_score = round(sum(r['percentage'] for r in results) / len(results), 2) if results else 0

    # Subject performance
    subjects_dict = {}
    for e in exams:
        subj = e['subject']
        e_res = [r for r in results if r['exam_id'] == e['exam_id']]
        if subj not in subjects_dict:
            subjects_dict[subj] = {"subject": subj, "sum": 0, "n": 0, "pass": 0}
        for r in e_res:
            subjects_dict[subj]["sum"] += r['percentage']
            subjects_dict[subj]["n"] += 1
            if r['result_status'] == 'Pass':
                subjects_dict[subj]["pass"] += 1

    subjects = []
    for s in subjects_dict.values():
        subjects.append({
            "subject": s["subject"],
            "average": round(s["sum"] / s["n"], 2) if s["n"] else 0,
            "pass_rate": round(s["pass"] / s["n"] * 100, 2) if s["n"] else 0,
            "n": s["n"]
        })

    # Hardest questions
    c.execute(f"""
        SELECT q.question_id, q.question_text, q.topic, q.difficulty, e.exam_name,
               SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) as correct,
               SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) as wrong,
               COUNT(a.answer_id) as total_ans
        FROM exam_questions eq
        JOIN questions q ON eq.question_id = q.question_id
        JOIN examinations e ON eq.exam_id = e.exam_id
        LEFT JOIN answers a ON eq.exam_id = a.exam_id AND eq.question_id = a.question_id
        WHERE eq.exam_id IN {in_clause}
        GROUP BY eq.exam_id, eq.question_id, q.question_id, q.question_text, q.topic, q.difficulty, e.exam_name
    """)
    q_rows = rows_to_list(c.fetchall())
    hardest = []
    diff_map = {"Easy": {"c": 0, "n": 0}, "Medium": {"c": 0, "n": 0}, "Hard": {"c": 0, "n": 0}}
    topic_map = {}

    for row in q_rows:
        tot = row['total_ans'] or 0
        corr = row['correct'] or 0
        rate = round((corr / tot * 100), 2) if tot > 0 else 0
        hardest.append({
            "question_id": row["question_id"],
            "question_text": row["question_text"],
            "topic": row["topic"],
            "difficulty": row["difficulty"],
            "exam_name": row["exam_name"],
            "correct": corr,
            "wrong": row["wrong"] or 0,
            "skipped": max(0, len(results) - tot),
            "total": tot,
            "rate": rate
        })
        d = row["difficulty"]
        if d in diff_map:
            diff_map[d]["c"] += corr
            diff_map[d]["n"] += tot

        top = row["topic"]
        if top not in topic_map:
            topic_map[top] = {"topic": top, "c": 0, "n": 0}
        topic_map[top]["c"] += corr
        topic_map[top]["n"] += tot

    hardest.sort(key=lambda x: x["rate"])
    hardest = hardest[:8]

    difficulty = []
    for k, v in diff_map.items():
        difficulty.append({
            "difficulty": k,
            "accuracy": round(v["c"] / v["n"] * 100, 2) if v["n"] else 0,
            "n": v["n"]
        })

    topics = []
    for t in topic_map.values():
        topics.append({
            "topic": t["topic"],
            "accuracy": round(t["c"] / t["n"] * 100, 2) if t["n"] else 0,
            "n": t["n"]
        })
    topics.sort(key=lambda x: x["accuracy"])

    per_exam = []
    for e in exams:
        e_res = [r for r in results if r['exam_id'] == e['exam_id']]
        if e_res:
            pcts = [r['percentage'] for r in e_res]
            p_cnt = sum(1 for r in e_res if r['result_status'] == 'Pass')
            per_exam.append({
                "exam_name": e["exam_name"],
                "subject": e["subject"],
                "students": len(e_res),
                "average": round(sum(pcts) / len(pcts), 2),
                "highest": max(pcts),
                "lowest": min(pcts),
                "pass_rate": round(p_cnt / len(e_res) * 100, 2)
            })

    conn.close()
    return {
        "exams": [{"exam_id": e["exam_id"], "exam_name": e["exam_name"]} for e in exams],
        "totals": {
            "results": len(results),
            "average": avg_score,
            "pass": pass_count,
            "fail": fail_count
        },
        "distribution": buckets,
        "subjects": subjects,
        "difficulty": difficulty,
        "topics": topics,
        "hardest": hardest,
        "per_exam": per_exam
    }

@app.get("/api/activity-logs")
async def get_activity_logs():
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        SELECT l.*, e.exam_name
        FROM activity_logs l
        LEFT JOIN examinations e ON l.exam_id = e.exam_id
        ORDER BY l.created_at DESC
        LIMIT 100
    """)
    rows = rows_to_list(c.fetchall())
    conn.close()
    return rows

@app.post("/api/notifications")
async def send_notification(payload: Dict[str, Any]):
    title = payload.get("title", "").strip()
    message = payload.get("message", "").strip()
    course_id = payload.get("course_id")
    n_type = payload.get("type", "info")

    if not title or not message:
        raise HTTPException(status_code=400, detail="Enter a title and a message.")

    conn = get_db()
    c = conn.cursor()
    c.execute("""
        INSERT INTO notifications (title, message, course_id, type, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (title, message, course_id if course_id else None, n_type, now_iso()))
    nid = c.lastrowid

    log_activity(conn, 'admin', 1, 'Administrator', 'Notification sent', title)
    c.execute("SELECT * FROM notifications WHERE notification_id = ?", (nid,))
    rec = row_to_dict(c.fetchone())
    conn.commit()
    conn.close()
    return rec

# =========================================================================
# Reports & Downloads (PDF Result Card & Excel Exports)
# =========================================================================

@app.get("/api/reports/pdf/result-card/{exam_id}/{student_id}")
async def download_result_card_pdf(exam_id: int, student_id: int):
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        SELECT e.*, c.course_name,
               (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
        FROM examinations e
        JOIN courses c ON e.course_id = c.course_id
        WHERE e.exam_id = ?
    """, (exam_id,))
    exam = row_to_dict(c.fetchone())

    c.execute("""
        SELECT s.*, c.course_name
        FROM students s
        JOIN courses c ON s.course_id = c.course_id
        WHERE s.student_id = ?
    """, (student_id,))
    student = row_to_dict(c.fetchone())

    c.execute("SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?", (exam_id, student_id))
    att = row_to_dict(c.fetchone())

    c.execute("SELECT * FROM results WHERE exam_id = ? AND student_id = ?", (exam_id, student_id))
    res = row_to_dict(c.fetchone())

    if not exam or not student or not att or not res:
        conn.close()
        raise HTTPException(status_code=404, detail="Result record not found.")

    c.execute("""
        SELECT q.topic,
               COUNT(q.question_id) as total,
               SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) as correct
        FROM questions q
        JOIN exam_questions eq ON q.question_id = eq.question_id
        LEFT JOIN answers a ON q.question_id = a.question_id AND a.exam_id = ? AND a.student_id = ?
        WHERE eq.exam_id = ?
        GROUP BY q.topic
    """, (exam_id, student_id, exam_id))
    topics = rows_to_list(c.fetchall())
    conn.close()

    pdf_bytes = generate_result_card_pdf(exam, student, att, res, topics)
    filename = f"ResultCard_{student['enrollment_no']}_{exam_id}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )

@app.get("/api/reports/export/excel/{report_type}")
async def export_excel_report(report_type: str, exam_id: Optional[int] = None):
    conn = get_db()
    c = conn.cursor()
    output = io.StringIO()
    writer = csv.writer(output)

    if report_type == "results":
        query = """
            SELECT s.enrollment_no, s.name, e.exam_name, e.subject,
                   r.total_questions, r.attempted_questions, r.correct_answers, r.wrong_answers,
                   r.score, e.total_marks, r.percentage, r.result_status, r.generated_at
            FROM results r
            JOIN students s ON r.student_id = s.student_id
            JOIN examinations e ON r.exam_id = e.exam_id
        """
        params = ()
        if exam_id:
            query += " WHERE r.exam_id = ?"
            params = (exam_id,)
        query += " ORDER BY r.score DESC"

        c.execute(query, params)
        rows = c.fetchall()
        writer.writerow(["Student ID", "Name", "Examination", "Subject", "Total Qs", "Attempted", "Correct", "Wrong", "Score", "Total Marks", "Percentage", "Status", "Date"])
        for r in rows:
            writer.writerow(list(r))
        filename = f"Evalio_Results_{datetime.now().strftime('%Y%m%d')}.csv"

    elif report_type == "questions":
        c.execute("SELECT question_id, subject, topic, difficulty, marks, negative_marks, correct_option, question_text FROM questions WHERE status = 'Active'")
        rows = c.fetchall()
        writer.writerow(["Question ID", "Subject", "Topic", "Difficulty", "Marks", "Negative Marks", "Correct Option", "Question Text"])
        for r in rows:
            writer.writerow(list(r))
        filename = f"Evalio_QuestionBank_{datetime.now().strftime('%Y%m%d')}.csv"

    elif report_type == "students":
        c.execute("""
            SELECT s.enrollment_no, s.name, s.email, c.course_name, s.phone, s.status, s.created_at
            FROM students s
            JOIN courses c ON s.course_id = c.course_id
        """)
        rows = c.fetchall()
        writer.writerow(["Student ID", "Name", "Email", "Course", "Phone", "Status", "Enrolled Date"])
        for r in rows:
            writer.writerow(list(r))
        filename = f"Evalio_Students_{datetime.now().strftime('%Y%m%d')}.csv"

    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Unknown export type.")

    conn.close()
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )
# =========================================================================
# Bulk question import (CSV)
# =========================================================================

REQUIRED_IMPORT_COLS = ["subject", "topic", "question_text", "option_a", "option_b",
                        "option_c", "option_d", "correct_option", "difficulty"]

@app.post("/api/questions/import")
async def import_questions(payload: Dict[str, Any]):
    text = str(payload.get("csv", "")).lstrip("\ufeff")
    default_course_id = payload.get("course_id")
    session = payload.get("session") or {}

    if not text.strip():
        raise HTTPException(status_code=400, detail="The file is empty.")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="The file has no header row.")
    reader.fieldnames = [(h or "").strip().lower().replace(" ", "_") for h in reader.fieldnames]

    missing = [col for col in REQUIRED_IMPORT_COLS if col not in reader.fieldnames]
    if missing:
        raise HTTPException(status_code=400, detail="Missing column(s): " + ", ".join(missing))

    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT course_id, course_name FROM courses")
    course_rows = c.fetchall()
    course_by_name = {str(r[1]).strip().lower(): r[0] for r in course_rows}
    valid_course_ids = {r[0] for r in course_rows}

    c.execute("SELECT course_id, question_text FROM questions")
    existing = {(r[0], str(r[1]).strip().lower()) for r in c.fetchall()}

    to_insert = []
    errors = []
    duplicates = 0
    seen = set()

    for line_no, row in enumerate(reader, start=2):
        get = lambda k: (row.get(k) or "").strip()
        if not any(get(k) for k in REQUIRED_IMPORT_COLS):
            continue  # skip blank lines

        if len(to_insert) + duplicates >= 1000:
            errors.append("Too many rows (limit is 1000 per file)")
            break

        # Course: the CSV "course" column wins, otherwise the course chosen in the dialog
        course_id = None
        if get("course"):
            course_id = course_by_name.get(get("course").lower())
            if course_id is None:
                errors.append(f"Row {line_no}: unknown course '{get('course')}'")
                continue
        else:
            try:
                course_id = int(default_course_id)
            except (TypeError, ValueError):
                course_id = None
            if course_id not in valid_course_ids:
                errors.append(f"Row {line_no}: no course selected")
                continue

        empty = [k for k in REQUIRED_IMPORT_COLS if not get(k)]
        if empty:
            errors.append(f"Row {line_no}: missing " + ", ".join(empty))
            continue

        correct = get("correct_option").upper()
        if correct not in ("A", "B", "C", "D"):
            errors.append(f"Row {line_no}: correct_option must be A, B, C or D")
            continue

        difficulty = get("difficulty").capitalize()
        if difficulty not in ("Easy", "Medium", "Hard"):
            errors.append(f"Row {line_no}: difficulty must be Easy, Medium or Hard")
            continue

        try:
            marks = float(get("marks") or 2.0)
            negative = float(get("negative_marks") or 0.5)
            if marks <= 0 or negative < 0:
                raise ValueError
        except ValueError:
            errors.append(f"Row {line_no}: marks must be a positive number and negative_marks cannot be negative")
            continue

        key = (course_id, get("question_text").lower())
        if key in existing or key in seen:
            duplicates += 1
            continue
        seen.add(key)

        to_insert.append((course_id, get("subject"), get("topic"), get("question_text"),
                          get("option_a"), get("option_b"), get("option_c"), get("option_d"),
                          correct, difficulty, marks, negative))

    if errors:
        conn.close()
        shown = " | ".join(errors[:8])
        more = f" (and {len(errors) - 8} more)" if len(errors) > 8 else ""
        raise HTTPException(status_code=400,
                            detail=f"Nothing was imported. {len(errors)} problem(s) found: {shown}{more}")

    if not to_insert and not duplicates:
        conn.close()
        raise HTTPException(status_code=400, detail="No questions found in the file.")

    created = now_iso()
    for item in to_insert:
        c.execute("""
            INSERT INTO questions (course_id, subject, topic, question_text, option_a, option_b,
                                   option_c, option_d, correct_option, difficulty, marks,
                                   negative_marks, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)
        """, item + (created,))

    log_activity(conn, 'admin', session.get("id"), session.get("name", "Administrator"),
                 'Questions imported', f"{len(to_insert)} questions imported from CSV")
    conn.commit()
    conn.close()
    return {"imported": len(to_insert), "skipped_duplicates": duplicates}
# =========================================================================
# Generic CRUD for Admin Tables
# =========================================================================

PK_MAP = {
    "courses": "course_id",
    "administrators": "admin_id",
    "students": "student_id",
    "questions": "question_id",
    "examinations": "exam_id",
    "schedules": "schedule_id",
    "notifications": "notification_id",
    "exam_attempts": "attempt_id"
}

@app.get("/api/{table}")
async def list_records(table: str):
    if table not in PK_MAP:
        raise HTTPException(status_code=404, detail="Table not found.")
    conn = get_db()
    c = conn.cursor()

    if table == "students":
        c.execute("""
            SELECT s.*, c.course_name
            FROM students s
            LEFT JOIN courses c ON s.course_id = c.course_id
        """)
        rows = rows_to_list(c.fetchall())
    elif table == "courses":
        c.execute("""
            SELECT c.*,
                   (SELECT COUNT(*) FROM students WHERE course_id = c.course_id) as student_count,
                   (SELECT COUNT(*) FROM questions WHERE course_id = c.course_id) as question_count,
                   (SELECT COUNT(*) FROM examinations WHERE course_id = c.course_id) as exam_count
            FROM courses c
        """)
        rows = rows_to_list(c.fetchall())
    elif table == "questions":
        c.execute("""
            SELECT q.*, c.course_name,
                   (SELECT COUNT(*) FROM exam_questions WHERE question_id = q.question_id) as used_in
            FROM questions q
            LEFT JOIN courses c ON q.course_id = c.course_id
        """)
        rows = rows_to_list(c.fetchall())
    elif table == "examinations":
        c.execute("""
            SELECT e.*, c.course_name,
                   (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
            FROM examinations e
            LEFT JOIN courses c ON e.course_id = c.course_id
        """)
        rows = rows_to_list(c.fetchall())
        for e in rows:
            c.execute("SELECT * FROM schedules WHERE exam_id = ?", (e['exam_id'],))
            e['schedule'] = row_to_dict(c.fetchone())
    elif table == "schedules":
        c.execute("""
            SELECT s.*, e.exam_name, c.course_name, e.duration
            FROM schedules s
            JOIN examinations e ON s.exam_id = e.exam_id
            JOIN courses c ON e.course_id = c.course_id
        """)
        rows = rows_to_list(c.fetchall())
    else:
        c.execute(f"SELECT * FROM {table}")
        rows = rows_to_list(c.fetchall())

    conn.close()
    return rows

@app.get("/api/{table}/{record_id}")
async def get_record(table: str, record_id: int):
    if table not in PK_MAP:
        raise HTTPException(status_code=404, detail="Table not found.")
    pk = PK_MAP[table]
    conn = get_db()
    c = conn.cursor()
    c.execute(f"SELECT * FROM {table} WHERE {pk} = ?", (record_id,))
    rec = row_to_dict(c.fetchone())
    conn.close()
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found.")
    return rec

@app.post("/api/{table}")
async def create_record(table: str, payload: Dict[str, Any]):
    if table not in PK_MAP:
        raise HTTPException(status_code=404, detail="Table not found.")
    pk = PK_MAP[table]
    conn = get_db()
    c = conn.cursor()

    payload_clean = {k: v for k, v in payload.items() if k != pk}
    payload_clean["created_at"] = now_iso()

    cols = list(payload_clean.keys())
    placeholders = ["?"] * len(cols)
    values = [payload_clean[col] for col in cols]

    try:
        c.execute(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(placeholders)})", values)
        new_id = c.lastrowid
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))

    c.execute(f"SELECT * FROM {table} WHERE {pk} = ?", (new_id,))
    rec = row_to_dict(c.fetchone())
    log_activity(conn, 'admin', 1, 'Administrator', f"Created {table.rstrip('s')}", str(rec.get('name') or rec.get('course_name') or rec.get('exam_name') or ''))
    conn.commit()
    conn.close()
    return rec

@app.put("/api/{table}/{record_id}")
async def update_record(table: str, record_id: int, payload: Dict[str, Any]):
    if table not in PK_MAP:
        raise HTTPException(status_code=404, detail="Table not found.")
    pk = PK_MAP[table]
    conn = get_db()
    c = conn.cursor()

    payload_clean = {k: v for k, v in payload.items() if k != pk}
    cols = list(payload_clean.keys())
    if not cols:
        conn.close()
        return {"status": "no change"}

    set_clause = ", ".join(f"{col} = ?" for col in cols)
    values = [payload_clean[col] for col in cols] + [record_id]

    try:
        c.execute(f"UPDATE {table} SET {set_clause} WHERE {pk} = ?", values)
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))

    c.execute(f"SELECT * FROM {table} WHERE {pk} = ?", (record_id,))
    rec = row_to_dict(c.fetchone())
    log_activity(conn, 'admin', 1, 'Administrator', f"Updated {table.rstrip('s')}", str(rec.get('name') or rec.get('course_name') or rec.get('exam_name') or ''))
    conn.commit()
    conn.close()
    return rec

@app.delete("/api/{table}/{record_id}")
async def delete_record(table: str, record_id: int):
    if table not in PK_MAP:
        raise HTTPException(status_code=404, detail="Table not found.")
    pk = PK_MAP[table]
    conn = get_db()
    c = conn.cursor()

    if table == "courses":
        c.execute("SELECT COUNT(*) FROM students WHERE course_id = ?", (record_id,))
        if c.fetchone()[0] > 0:
            conn.close()
            raise HTTPException(status_code=400, detail="This course still has students. Move or delete them first.")
    elif table == "questions":
        c.execute("SELECT COUNT(*) FROM exam_questions WHERE question_id = ?", (record_id,))
        if c.fetchone()[0] > 0:
            conn.close()
            raise HTTPException(status_code=400, detail="This question is used in an examination. Remove it from the exam first.")
    elif table == "examinations":
        c.execute("SELECT COUNT(*) FROM exam_attempts WHERE exam_id = ?", (record_id,))
        if c.fetchone()[0] > 0:
            conn.close()
            raise HTTPException(status_code=400, detail="Students have already attempted this examination.")

    c.execute(f"DELETE FROM {table} WHERE {pk} = ?", (record_id,))
    log_activity(conn, 'admin', 1, 'Administrator', f"Deleted {table.rstrip('s')}", f"#{record_id}")
    conn.commit()
    conn.close()
    return {"success": True}

# =========================================================================
# Static files mount
# =========================================================================

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
