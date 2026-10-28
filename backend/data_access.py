"""Database connector and Data Access Layer for Evalio backend.

Directs all database interactions to the central SQLite database stored
inside the `database/` directory (database/evalio.db).
"""
import os
import sys
import sqlite3
import json
from datetime import datetime
from typing import Optional, Dict, Any, List

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import database as db_pkg

get_db = db_pkg.get_db
init_db = db_pkg.init_db
DB_PATH = db_pkg.DB_PATH

def query_one(sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    """Execute a query and return a single row as a dictionary."""
    conn = get_db()
    c = conn.cursor()
    c.execute(sql, params)
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def query_all(sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    """Execute a query and return all matching rows as dictionaries."""
    conn = get_db()
    c = conn.cursor()
    c.execute(sql, params)
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def execute_commit(sql: str, params: tuple = ()) -> int:
    """Execute an insert/update/delete statement and return the last inserted rowid."""
    conn = get_db()
    c = conn.cursor()
    c.execute(sql, params)
    last_id = c.lastrowid
    conn.commit()
    conn.close()
    return last_id

# Core Data Access Functions
def get_student_by_id(student_id: int) -> Optional[Dict[str, Any]]:
    return query_one("""
        SELECT s.*, c.course_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.course_id
        WHERE s.student_id = ?
    """, (student_id,))

def get_student_by_login(identifier: str) -> Optional[Dict[str, Any]]:
    return query_one("""
        SELECT s.*, c.course_name
        FROM students s
        LEFT JOIN courses c ON s.course_id = c.course_id
        WHERE LOWER(s.email) = LOWER(?) OR LOWER(s.enrollment_no) = LOWER(?)
    """, (identifier, identifier))

def get_admin_by_email(email: str) -> Optional[Dict[str, Any]]:
    return query_one("SELECT * FROM administrators WHERE LOWER(email) = LOWER(?)", (email,))

def get_exam_by_id(exam_id: int) -> Optional[Dict[str, Any]]:
    return query_one("""
        SELECT e.*, c.course_name,
               (SELECT COUNT(*) FROM exam_questions WHERE exam_id = e.exam_id) as question_count
        FROM examinations e
        JOIN courses c ON e.course_id = c.course_id
        WHERE e.exam_id = ?
    """, (exam_id,))

def get_schedule_by_exam(exam_id: int) -> Optional[Dict[str, Any]]:
    return query_one("SELECT * FROM schedules WHERE exam_id = ?", (exam_id,))

def get_attempt(exam_id: int, student_id: int) -> Optional[Dict[str, Any]]:
    return query_one("SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?", (exam_id, student_id))

def get_attempt_by_id(attempt_id: int) -> Optional[Dict[str, Any]]:
    return query_one("SELECT * FROM exam_attempts WHERE attempt_id = ?", (attempt_id,))

def get_result(exam_id: int, student_id: int) -> Optional[Dict[str, Any]]:
    return query_one("SELECT * FROM results WHERE exam_id = ? AND student_id = ?", (exam_id, student_id))

__all__ = [
    "get_db",
    "init_db",
    "DB_PATH",
    "query_one",
    "query_all",
    "execute_commit",
    "get_student_by_id",
    "get_student_by_login",
    "get_admin_by_email",
    "get_exam_by_id",
    "get_schedule_by_exam",
    "get_attempt",
    "get_attempt_by_id",
    "get_result"
]
