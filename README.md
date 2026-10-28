# Evalio: An Online Examination System

Evalio is a web-based examination platform where administrators create and schedule multiple-choice exams, and students sit them online under timed, monitored conditions. Results, analytics and reports are generated automatically.

## Features

### For students
- Secure login with single-device session enforcement
- Dashboard with available, upcoming, completed and missed exams
- Instructions page and a timed exam interface (question navigator, mark-for-review, auto-save)
- Automatic submission when time runs out
- Result page, detailed answer analysis (topic-wise performance, class average, rank) and result history
- Downloadable PDF result card

### For administrators
- Manage students, courses, questions and examinations
- Schedule exams and notify students
- **Bulk question import from CSV** (with downloadable template)
- Live exam monitoring (progress, time remaining, tab-switch alerts)
- Results table with publish / withdraw control
- Reports and analytics (score distribution, subject and topic performance, hardest questions)
- Activity logs and notifications
- Excel / CSV export of results, questions and students

### Exam integrity
- Question and option shuffling (configurable per exam)
- Tab-switch detection with warnings and automatic submission after a configurable limit
- Negative marking (configurable per exam)

## Tech stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Backend   | Python, FastAPI, Uvicorn                        |
| Database  | SQLite                                          |
| Frontend  | HTML, CSS, JavaScript, Bootstrap 5, Chart.js    |
| Reports   | PDF result cards, CSV / Excel export            |

## Project structure

```
Evalio/
├── backend/
│   ├── main.py            # FastAPI app: all REST API routes
│   ├── data_access.py     # Database helper functions
│   ├── pdf_reports.py     # PDF result card generation
│   └── ...
├── database/
│   ├── db.py              # Connection and schema setup
│   ├── schema.sql         # Table definitions
│   ├── seed.py            # Sample data
│   └── evalio.db          # SQLite database file
├── frontend/
│   ├── admin/             # Administrator pages
│   ├── student/           # Student pages
│   ├── js/                # api.js, auth.js, ui.js, db.js
│   ├── css/
│   ├── index.html
│   └── login.html
├── run_server.py          # Starts the server
└── serve.py
```

## Getting started

### Prerequisites
- Python 3.10 or newer
- Git

### Installation

```bash
git clone https://github.com/Krisha-536/Evalio.git
cd Evalio
pip install fastapi uvicorn
```

> `backend/pdf_reports.py` may need an extra package for PDF generation. If the server reports a `ModuleNotFoundError`, install the package it names with `pip install <package-name>`.

### Run

```bash
python run_server.py
```

Then open **http://127.0.0.1:8000/** in your browser. The database is seeded with sample data on first start. To use a different port, pass it as an argument: `python run_server.py 8080`.

Interactive API documentation is available at **http://127.0.0.1:8000/docs**.

### Demo accounts

| Role          | Login               | Password     |
|---------------|---------------------|--------------|
| Student       | `21CS1047`          | `student123` |
| Administrator | `admin@evalio.edu`  | `admin123`   |

## API overview

All endpoints are under `/api`. Full details are in the auto-generated docs at `/docs`.

| Area           | Examples                                                              |
|----------------|-----------------------------------------------------------------------|
| Authentication | `POST /api/auth/login`, `POST /api/auth/logout`                       |
| Student        | `GET /api/students/{id}/exams`, `POST /api/exams/{id}/attempts`       |
| Exam attempt   | `PUT /api/attempts/{id}/answers/{qid}`, `POST /api/attempts/{id}/submit` |
| Admin          | `GET /api/admin/overview`, `GET /api/admin/monitor/{exam_id}`, `GET /api/admin/analytics` |
| Import         | `POST /api/questions/import`                                          |
| Reports        | `GET /api/reports/pdf/result-card/{exam_id}/{student_id}`, `GET /api/reports/export/excel/{type}` |
