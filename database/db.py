import sqlite3
import os
import sys
import json
from datetime import datetime

# The database file lives inside the database/ directory (for SQLite fallback)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "evalio.db")

def get_database_url():
    """Detect DATABASE_URL from environment variable or .env files."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return url.strip()

    current_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(current_dir, ".env"),
        os.path.join(os.path.dirname(current_dir), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(current_dir)), ".env")
    ]
    for p in candidates:
        if os.path.isfile(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("DATABASE_URL="):
                            val = line.split("=", 1)[1].strip()
                            if val:
                                return val
            except Exception:
                pass
    return None

class PostgresCursorWrapper:
    """Wraps a psycopg2 cursor to provide an SQLite-compatible interface:
    - Translates '?' parameter placeholders to '%s'
    - Populates c.lastrowid on INSERT using SELECT lastval()
    - Allows row[0] indexing and dict(row) access
    """
    def __init__(self, raw_cursor):
        self._cur = raw_cursor
        self.lastrowid = None

    def execute(self, sql, params=None):
        translated_sql = sql.replace("?", "%s")
        is_insert = translated_sql.strip().upper().startswith("INSERT")
        if params is not None:
            self._cur.execute(translated_sql, params)
        else:
            self._cur.execute(translated_sql)

        if is_insert:
            try:
                self._cur.execute("SELECT lastval()")
                r = self._cur.fetchone()
                self.lastrowid = r[0] if r else None
            except Exception:
                self.lastrowid = None
        return self

    def executemany(self, sql, seq_of_parameters):
        translated_sql = sql.replace("?", "%s")
        return self._cur.executemany(translated_sql, seq_of_parameters)

    def executescript(self, script):
        return self._cur.execute(script)

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def close(self):
        return self._cur.close()

    @property
    def rowcount(self):
        return self._cur.rowcount

class PostgresConnectionWrapper:
    """Wraps a psycopg2 connection to provide an SQLite-compatible interface."""
    def __init__(self, raw_conn):
        self._conn = raw_conn

    def cursor(self):
        import psycopg2.extras
        raw_cur = self._conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        return PostgresCursorWrapper(raw_cur)

    def execute(self, sql, params=None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        return self._conn.close()

def get_db():
    """Returns an active database connection:
    - Connects to Supabase PostgreSQL if DATABASE_URL is configured
    - Falls back to local SQLite (database/evalio.db) otherwise
    """
    db_url = get_database_url()
    if db_url and (db_url.startswith("postgresql://") or db_url.startswith("postgres://")):
        try:
            import psycopg2
            raw_conn = psycopg2.connect(db_url, connect_timeout=10)
            return PostgresConnectionWrapper(raw_conn)
        except Exception as e:
            print(f"[Evalio DB] Warning: PostgreSQL connection failed ({e}). Falling back to SQLite.")

    # SQLite Fallback
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    db_url = get_database_url()
    if db_url and (db_url.startswith("postgresql://") or db_url.startswith("postgres://")):
        # Schema already initialized via Supabase SQL Editor
        return

    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
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
    """)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized at:", DB_PATH)
