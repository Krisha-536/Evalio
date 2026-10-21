-- =========================================================================
-- Evalio Online Examination System — Database Schema (DDL)
-- =========================================================================

CREATE TABLE IF NOT EXISTS courses (
    course_id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_name TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS administrators (
    admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    status TEXT DEFAULT 'Active',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
    student_id INTEGER PRIMARY KEY AUTOINCREMENT,
    enrollment_no TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    course_id INTEGER REFERENCES courses(course_id),
    phone TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
    question_id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER REFERENCES courses(course_id),
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    marks REAL DEFAULT 2.0,
    negative_marks REAL DEFAULT 0.5,
    status TEXT DEFAULT 'Active',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS examinations (
    exam_id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER REFERENCES courses(course_id),
    exam_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT DEFAULT '',
    duration INTEGER NOT NULL,
    total_marks REAL DEFAULT 0,
    passing_marks REAL DEFAULT 0,
    negative_marking INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Draft',
    shuffle_questions INTEGER DEFAULT 1,
    shuffle_options INTEGER DEFAULT 1,
    result_published INTEGER DEFAULT 0,
    max_tab_switches INTEGER DEFAULT 3,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_questions (
    exam_question_id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER REFERENCES examinations(exam_id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(question_id) ON DELETE CASCADE,
    question_order INTEGER NOT NULL,
    UNIQUE(exam_id, question_id)
);

CREATE TABLE IF NOT EXISTS schedules (
    schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER UNIQUE REFERENCES examinations(exam_id) ON DELETE CASCADE,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT DEFAULT 'Scheduled'
);

CREATE TABLE IF NOT EXISTS exam_attempts (
    attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER REFERENCES examinations(exam_id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    submitted_at TEXT,
    status TEXT DEFAULT 'In Progress',
    question_order TEXT NOT NULL,
    option_order TEXT NOT NULL,
    marked TEXT DEFAULT '[]',
    current_index INTEGER DEFAULT 0,
    tab_switches INTEGER DEFAULT 0,
    last_activity TEXT NOT NULL,
    device_token TEXT,
    simulated INTEGER DEFAULT 0,
    UNIQUE(exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS answers (
    answer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER REFERENCES examinations(exam_id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(question_id) ON DELETE CASCADE,
    selected_option TEXT,
    is_correct INTEGER,
    marks_obtained REAL DEFAULT 0,
    saved_at TEXT NOT NULL,
    UNIQUE(exam_id, student_id, question_id)
);

CREATE TABLE IF NOT EXISTS results (
    result_id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER REFERENCES examinations(exam_id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(student_id) ON DELETE CASCADE,
    total_questions INTEGER NOT NULL,
    attempted_questions INTEGER NOT NULL,
    correct_answers INTEGER NOT NULL,
    wrong_answers INTEGER NOT NULL,
    score REAL NOT NULL,
    percentage REAL NOT NULL,
    result_status TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    UNIQUE(exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER,
    user_role TEXT NOT NULL,
    user_id INTEGER,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key TEXT UNIQUE NOT NULL,
    device_token TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
