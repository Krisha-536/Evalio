import os
import sys
import json
import random
from datetime import datetime, timedelta

# Support running directly or as a package
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

try:
    from .db import get_db, init_db, DB_PATH
except (ImportError, ValueError):
    from db import get_db, init_db, DB_PATH

MIN = 60
DAY = 86400

BANK = {
    'Data Structures': [
        ['Arrays and Linked Lists', 'What is the time complexity of accessing an element by index in an array?', 'O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'A', 'Easy'],
        ['Arrays and Linked Lists', 'Which linked list allows traversal in both directions?', 'Singly linked list', 'Doubly linked list', 'Circular singly linked list', 'Skip list', 'B', 'Easy'],
        ['Arrays and Linked Lists', 'What is the time taken to insert a node at the head of a singly linked list?', 'O(1)', 'O(n)', 'O(log n)', 'O(n²)', 'A', 'Medium'],
        ['Arrays and Linked Lists', 'In a circular linked list, the last node points to:', 'NULL', 'The first node', 'The middle node', 'Itself', 'B', 'Easy'],
        ['Stacks and Queues', 'Which data structure follows the Last In, First Out (LIFO) principle?', 'Queue', 'Stack', 'Linked List', 'Binary Tree', 'B', 'Easy'],
        ['Stacks and Queues', 'Which data structure is used for a breadth-first search of a graph?', 'Stack', 'Queue', 'Heap', 'Hash table', 'B', 'Medium'],
        ['Stacks and Queues', 'Converting an infix expression to postfix typically uses a:', 'Queue', 'Stack', 'Tree', 'Graph', 'B', 'Medium'],
        ['Stacks and Queues', 'A circular queue of size n that keeps one slot empty can hold at most how many elements?', 'n', 'n − 1', 'n + 1', 'n / 2', 'B', 'Hard'],
        ['Trees', 'What is the maximum number of nodes in a binary tree of height h (root at height 0)?', '2^h', '2^(h+1) − 1', '2h + 1', 'h²', 'B', 'Medium'],
        ['Trees', 'Which traversal of a binary search tree visits the keys in sorted order?', 'Preorder', 'Postorder', 'Inorder', 'Level order', 'C', 'Easy'],
        ['Trees', 'The height of an AVL tree with n nodes is:', 'O(n)', 'O(log n)', 'O(n log n)', 'O(1)', 'B', 'Medium'],
        ['Trees', 'In a min-heap, the smallest element is always at the:', 'Last leaf', 'Root', 'Leftmost leaf', 'Rightmost leaf', 'B', 'Easy'],
        ['Trees', 'What is the maximum number of children a node can have in a B-tree of order m?', '2', 'm − 1', 'm', '2m', 'C', 'Hard'],
        ['Graphs', 'Which algorithm finds shortest paths from a source when all edge weights are non-negative?', "Kruskal's", "Prim's", "Dijkstra's", "Floyd's cycle detection", 'C', 'Medium'],
        ['Graphs', 'A connected acyclic graph with n vertices has how many edges?', 'n', 'n − 1', 'n + 1', 'n²', 'B', 'Medium'],
        ['Graphs', 'Depth-first search is naturally implemented using a:', 'Queue', 'Stack', 'Priority queue', 'Hash map', 'B', 'Easy'],
        ['Graphs', 'Topological sorting is possible only for a:', 'Complete graph', 'Directed acyclic graph', 'Undirected cyclic graph', 'Bipartite graph', 'B', 'Hard'],
        ['Sorting and Searching', 'What is the average-case time complexity of quicksort?', 'O(n)', 'O(n log n)', 'O(n²)', 'O(log n)', 'B', 'Medium'],
        ['Sorting and Searching', 'Binary search requires the input array to be:', 'Sorted', 'Unsorted', 'Stored in a linked list', 'Of even length', 'A', 'Easy'],
        ['Sorting and Searching', 'Which sorting algorithm is stable and runs in O(n log n) in the worst case?', 'Quicksort', 'Heapsort', 'Merge sort', 'Selection sort', 'C', 'Hard']
    ],
    'Database Management Systems': [
        ['ER Model', 'In an ER diagram, a rectangle represents:', 'Entity', 'Attribute', 'Relationship', 'Key', 'A', 'Easy'],
        ['ER Model', 'A weak entity set is one that:', 'Has no attributes', 'Does not have a sufficient primary key of its own', 'Has only one attribute', 'Cannot take part in relationships', 'B', 'Medium'],
        ['ER Model', 'A relationship where one entity in A relates to many entities in B is:', 'One-to-one', 'One-to-many', 'Many-to-many', 'Recursive', 'B', 'Easy'],
        ['Normalization', 'A relation is in 2NF if it is in 1NF and has no:', 'Transitive dependencies', 'Partial dependencies on a candidate key', 'Multivalued dependencies', 'Join dependencies', 'B', 'Medium'],
        ['Normalization', 'BCNF requires that for every functional dependency X → Y, X is a:', 'Foreign key', 'Superkey', 'Non-prime attribute', 'Composite attribute', 'B', 'Hard'],
        ['Normalization', '1NF requires that every attribute contains:', 'Atomic values', 'Unique values', 'Numeric values', 'Non-null values', 'A', 'Easy'],
        ['SQL', 'Which SQL command removes all rows from a table but keeps its structure?', 'DROP', 'DELETE ... WHERE', 'TRUNCATE', 'ALTER', 'C', 'Medium'],
        ['SQL', 'Which clause filters groups after aggregation?', 'WHERE', 'HAVING', 'ORDER BY', 'GROUP BY', 'B', 'Easy'],
        ['SQL', 'A LEFT JOIN returns:', 'Only matching rows', 'All rows of the left table plus matching rows of the right', 'All rows of both tables', 'Only non-matching rows', 'B', 'Medium'],
        ['Transactions', 'Which ACID property makes a transaction all-or-nothing?', 'Atomicity', 'Consistency', 'Isolation', 'Durability', 'A', 'Easy'],
        ['Transactions', 'A dirty read happens when a transaction reads data that:', 'Has been committed', 'Was written by an uncommitted transaction', 'Is indexed', 'It locked itself', 'B', 'Medium'],
        ['Transactions', 'Two-phase locking guarantees:', 'Freedom from deadlock', 'Conflict serializability', 'Cascadeless schedules', 'Freedom from starvation', 'B', 'Hard'],
        ['Indexing', 'In a B+ tree index, record pointers are stored in:', 'Only internal nodes', 'Only leaf nodes', 'Only the root', 'Every node equally', 'B', 'Medium'],
        ['Indexing', 'A clustered index determines:', 'The physical order of rows', 'Only uniqueness', 'The number of columns', 'Foreign key relations', 'A', 'Medium'],
        ['Indexing', 'Hash indexes are best suited for:', 'Range queries', 'Equality lookups', 'Sorting', 'LIKE pattern matching', 'B', 'Hard']
    ],
    'Operating Systems': [
        ['Processes', 'A process in the "ready" state is:', 'Waiting for I/O', 'Waiting to be assigned the CPU', 'Currently executing', 'Terminated', 'B', 'Easy'],
        ['Processes', 'The context of a process is stored in its:', 'Page table', 'Process Control Block', 'File descriptor', 'Stack only', 'B', 'Easy'],
        ['Processes', 'Threads of the same process share their:', 'Registers', 'Stack', 'Address space', 'Program counter', 'C', 'Medium'],
        ['CPU Scheduling', 'Which scheduling algorithm can starve long processes?', 'FCFS', 'Round Robin', 'Shortest Job First', 'FIFO', 'C', 'Medium'],
        ['CPU Scheduling', 'Round Robin scheduling is designed mainly for:', 'Batch systems', 'Time-sharing systems', 'Hard real-time systems', 'Single-user systems', 'B', 'Easy'],
        ['CPU Scheduling', 'The convoy effect is associated with:', 'SJF', 'FCFS', 'Priority scheduling', 'Multilevel queues', 'B', 'Medium'],
        ['Memory Management', 'Thrashing occurs when:', 'CPU utilisation is at its maximum', 'Processes spend more time paging than executing', 'Memory is unused', 'The disk is full', 'B', 'Medium'],
        ['Memory Management', "Which page replacement algorithm suffers from Belady's anomaly?", 'LRU', 'Optimal', 'FIFO', 'LFU', 'C', 'Hard'],
        ['Memory Management', 'Paging eliminates:', 'Internal fragmentation', 'External fragmentation', 'Thrashing', 'Page faults', 'B', 'Medium'],
        ['Deadlocks', 'Which of these is NOT a necessary condition for deadlock?', 'Mutual exclusion', 'Hold and wait', 'Preemption', 'Circular wait', 'C', 'Medium'],
        ['Deadlocks', "The Banker's algorithm is used for deadlock:", 'Prevention', 'Avoidance', 'Detection', 'Recovery', 'B', 'Easy'],
        ['Deadlocks', 'A cycle in a resource-allocation graph with single-instance resources implies:', 'No deadlock', 'Deadlock', 'Only starvation', 'Livelock', 'B', 'Hard'],
        ['File Systems', 'An inode stores:', 'The file name', 'File metadata and block pointers', 'Only the directory listing', 'User passwords', 'B', 'Medium'],
        ['File Systems', 'Which allocation method suffers from external fragmentation?', 'Linked', 'Indexed', 'Contiguous', 'FAT', 'C', 'Medium'],
        ['File Systems', 'Journaling file systems mainly improve:', 'Read speed', 'Crash consistency', 'Compression', 'Encryption', 'B', 'Easy']
    ],
    'Computer Networks': [
        ['OSI Model', 'Which OSI layer is responsible for routing?', 'Data link', 'Network', 'Transport', 'Session', 'B', 'Easy'],
        ['OSI Model', 'The data unit at the transport layer is called a:', 'Frame', 'Packet', 'Segment', 'Bit', 'C', 'Easy'],
        ['OSI Model', 'MAC addresses are used at which layer?', 'Physical', 'Data link', 'Network', 'Application', 'B', 'Easy'],
        ['TCP/IP Protocols', 'TCP establishes a connection using a:', 'Two-way handshake', 'Three-way handshake', 'Four-way handshake', 'No handshake', 'B', 'Easy'],
        ['TCP/IP Protocols', 'Which protocol is connectionless?', 'TCP', 'UDP', 'FTP', 'SMTP', 'B', 'Easy'],
        ['TCP/IP Protocols', 'The default port for HTTPS is:', '80', '21', '443', '8080', 'C', 'Easy'],
        ['Routing', 'OSPF is a:', 'Distance-vector protocol', 'Link-state protocol', 'Path-vector protocol', 'Static routing method', 'B', 'Medium'],
        ['Routing', 'The count-to-infinity problem affects:', 'Link-state routing', 'Distance-vector routing', 'Flooding', 'Source routing', 'B', 'Hard'],
        ['IP Addressing', 'How many usable host addresses does a /26 subnet have?', '62', '64', '30', '126', 'A', 'Medium'],
        ['IP Addressing', 'Which protocol maps an IP address to a MAC address?', 'DNS', 'DHCP', 'ARP', 'ICMP', 'C', 'Medium']
    ],
    'Software Engineering': [
        ['SDLC Models', 'Which model suits a project whose requirements are well understood and fixed?', 'Spiral', 'Waterfall', 'Prototype', 'Agile', 'B', 'Easy'],
        ['SDLC Models', 'Risk analysis is the key feature of which model?', 'Waterfall', 'V-model', 'Spiral', 'RAD', 'C', 'Medium'],
        ['SDLC Models', 'In Scrum, a time-boxed development iteration is called a:', 'Epic', 'Sprint', 'Backlog', 'Release', 'B', 'Easy'],
        ['Requirements', '"The system shall respond within 2 seconds" is a:', 'Functional requirement', 'Non-functional requirement', 'Domain requirement', 'User story', 'B', 'Easy'],
        ['Requirements', 'An SRS document mainly describes:', 'How the system is coded', 'What the system must do', 'The test results', 'The deployment server', 'B', 'Easy'],
        ['Testing', 'Testing individual modules in isolation is called:', 'Integration testing', 'System testing', 'Unit testing', 'Acceptance testing', 'C', 'Easy'],
        ['Testing', 'Black-box testing is based on:', 'Internal code structure', 'Specifications and requirements', 'Code coverage', 'Control flow graphs', 'B', 'Medium'],
        ['Testing', 'Cyclomatic complexity of a flow graph with E edges, N nodes and P components is:', 'E − N + 2P', 'E + N − 2P', 'N − E + P', 'E × N', 'A', 'Hard'],
        ['Project Estimation', 'In Basic COCOMO, an "organic" project is:', 'Large and tightly constrained', 'Small, with an experienced team in a familiar environment', 'Embedded and hardware-dependent', 'Undefined', 'B', 'Medium'],
        ['Project Estimation', 'Function Point analysis measures software size from:', 'Lines of code', 'Functionality delivered to the user', 'Number of developers', 'Execution time', 'B', 'Medium']
    ]
}

def seed_database():
    init_db()
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT COUNT(*) FROM administrators")
    if c.fetchone()[0] > 0:
        conn.close()
        return

    now = datetime.now()
    def iso(dt):
        return dt.isoformat()

    # 1. Courses
    c.execute("INSERT INTO courses (course_name, description, status, created_at) VALUES (?, ?, ?, ?)",
              ('Computer Science', 'B.Tech Computer Science & Engineering — core CS subjects.', 'Active', iso(now - timedelta(days=220))))
    cs_id = c.lastrowid

    c.execute("INSERT INTO courses (course_name, description, status, created_at) VALUES (?, ?, ?, ?)",
              ('Information Technology', 'B.Tech Information Technology.', 'Active', iso(now - timedelta(days=210))))
    it_id = c.lastrowid

    c.execute("INSERT INTO courses (course_name, description, status, created_at) VALUES (?, ?, ?, ?)",
              ('Electronics & Telecommunication', 'B.Tech EXTC — signals, circuits and communication.', 'Inactive', iso(now - timedelta(days=200))))

    # 2. Administrator (Demo Admin account: admin@evalio.edu / admin123)
    c.execute("INSERT INTO administrators (name, email, password, status, created_at) VALUES (?, ?, ?, ?, ?)",
              ('Dr. Priya Sharma', 'admin@evalio.edu', 'admin123', 'Active', iso(now - timedelta(days=230))))

    # 3. Students (Demo Student account: 21CS1047 / student123)
    students_data = [
        ('Aarav Mehta', '21CS1047', cs_id),
        ('Diya Patel', '21CS1012', cs_id),
        ('Rohan Iyer', '21CS1023', cs_id),
        ('Ananya Gupta', '21CS1031', cs_id),
        ('Kabir Singh', '21CS1038', cs_id),
        ('Ishita Rao', '21CS1052', cs_id),
        ('Vivaan Joshi', '21CS1058', cs_id),
        ('Meera Nair', '21CS1063', cs_id),
        ('Arjun Reddy', '21CS1070', cs_id),
        ('Sneha Kulkarni', '21CS1076', cs_id),
        ('Aditya Verma', '21CS1081', cs_id),
        ('Pooja Desai', '21CS1089', cs_id),
        ('Rahul Menon', '21IT1005', it_id),
        ('Nisha Bhat', '21IT1011', it_id)
    ]

    student_records = []
    for i, (name, roll, cid) in enumerate(students_data):
        email = name.lower().replace(' ', '.') + '@evalio.edu'
        status = 'Inactive' if roll == '21CS1089' else 'Active'
        phone = f"982000{i:04d}"
        c.execute("""
            INSERT INTO students (enrollment_no, name, email, password, course_id, phone, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (roll, name, email, 'student123', cid, phone, status, iso(now - timedelta(days=180 - i))))
        student_records.append({'student_id': c.lastrowid, 'enrollment_no': roll, 'name': name, 'course_id': cid, 'email': email, 'status': status})

    # 4. Questions
    q_by_subject = {}
    for subject, qlist in BANK.items():
        q_by_subject[subject] = []
        for topic, text, a, b, c_opt, d, correct, difficulty in qlist:
            c.execute("""
                INSERT INTO questions (course_id, subject, topic, question_text, option_a, option_b, option_c, option_d, correct_option, difficulty, marks, negative_marks, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (cs_id, subject, topic, text, a, b, c_opt, d, correct, difficulty, 2.0, 0.5, 'Active', iso(now - timedelta(days=100))))
            q_by_subject[subject].append({
                'question_id': c.lastrowid, 'topic': topic, 'text': text, 'marks': 2.0, 'negative_marks': 0.5,
                'difficulty': difficulty, 'correct': correct, 'subject': subject
            })

    def add_exam(name, subject, desc, duration, passing, negative, status, published, start, end, q_list):
        total_m = sum(q['marks'] for q in q_list)
        c.execute("""
            INSERT INTO examinations (course_id, exam_name, subject, description, duration, total_marks, passing_marks, negative_marking, status, shuffle_questions, shuffle_options, result_published, max_tab_switches, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (cs_id, name, subject, desc, duration, total_m, passing, 1 if negative else 0, status, 1, 1, 1 if published else 0, 3, iso(now - timedelta(days=40))))
        exam_id = c.lastrowid

        for idx, q in enumerate(q_list):
            c.execute("INSERT INTO exam_questions (exam_id, question_id, question_order) VALUES (?, ?, ?)",
                      (exam_id, q['question_id'], idx + 1))

        c.execute("INSERT INTO schedules (exam_id, start_time, end_time, status) VALUES (?, ?, ?, ?)",
                  (exam_id, iso(start), iso(end), 'Scheduled'))
        return exam_id

    # Create examinations
    ds_mid = add_exam('Data Structures Mid-Term', 'Data Structures', 'Mid-term examination covering arrays, linked lists, stacks, queues, trees, graphs, sorting and searching.',
                      40, 16.0, False, 'Active', True, now - timedelta(days=1), now + timedelta(days=6), q_by_subject['Data Structures'])

    dbms_exam = add_exam('Database Management Systems', 'Database Management Systems', 'Unit test on ER modelling, normalization, SQL, transactions and indexing.',
                         30, 12.0, True, 'Active', True, now - timedelta(days=1), now + timedelta(days=6), q_by_subject['Database Management Systems'])

    os_quiz = add_exam('Operating Systems Quiz', 'Operating Systems', 'Quiz on processes, scheduling, memory management, deadlocks and file systems.',
                       30, 12.0, False, 'Active', False, now - timedelta(days=1), now + timedelta(days=6), q_by_subject['Operating Systems'])

    cn_test = add_exam('Computer Networks Unit Test', 'Computer Networks', 'Unit test 1 — OSI model, TCP/IP, routing and addressing.',
                       20, 8.0, False, 'Completed', True, now - timedelta(days=17), now - timedelta(days=16), q_by_subject['Computer Networks'])

    se_quiz = add_exam('Software Engineering Quiz', 'Software Engineering', 'Quiz on SDLC models, requirements, testing and estimation.',
                       20, 8.0, False, 'Completed', True, now - timedelta(days=26), now - timedelta(days=25), q_by_subject['Software Engineering'])

    ds_hard = [q for q in q_by_subject['Data Structures'] if q['difficulty'] != 'Easy'] + [q for q in q_by_subject['Data Structures'] if q['difficulty'] == 'Easy'][:4]
    add_exam('Data Structures End-Semester', 'Data Structures', 'End-semester examination (full syllabus).',
             60, 16.0, True, 'Scheduled', False, now + timedelta(days=9), now + timedelta(days=9, hours=3), ds_hard)

    # 5. Attempts, Answers & Results
    def seed_attempt(exam_id, student_id, started_at, submitted_at, status, q_list, accuracy, answer_frac, tab_switches=0, is_simulated=0):
        qids = [q['question_id'] for q in q_list]
        rng = random.Random(exam_id * 1000 + student_id)
        rng.shuffle(qids)

        option_order = {str(qid): ['A', 'B', 'C', 'D'] for qid in qids}
        for qid in qids:
            opts = ['A', 'B', 'C', 'D']
            rng.shuffle(opts)
            option_order[str(qid)] = opts

        ans_count = round(len(qids) * answer_frac)
        answered_qids = qids[:ans_count]

        c.execute("""
            INSERT INTO exam_attempts (exam_id, student_id, started_at, submitted_at, status, question_order, option_order, marked, current_index, tab_switches, last_activity, device_token, simulated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (exam_id, student_id, iso(started_at), iso(submitted_at) if submitted_at else None, status,
              json.dumps(qids), json.dumps(option_order), json.dumps([]), min(ans_count, len(qids) - 1), tab_switches,
              iso(submitted_at or (started_at + timedelta(seconds=ans_count * 75))), "seed_token", is_simulated))

        attempted = 0
        correct = 0
        wrong = 0
        score = 0.0

        for i, qid in enumerate(answered_qids):
            q_info = next(q for q in q_list if q['question_id'] == qid)
            wrongs = [k for k in ['A', 'B', 'C', 'D'] if k != q_info['correct']]
            sel = q_info['correct'] if rng.random() < accuracy else rng.choice(wrongs)
            is_corr = 1 if sel == q_info['correct'] else 0
            m_obt = q_info['marks'] if is_corr else 0.0
            attempted += 1
            if is_corr:
                correct += 1
            else:
                wrong += 1
            score += m_obt

            c.execute("""
                INSERT INTO answers (exam_id, student_id, question_id, selected_option, is_correct, marks_obtained, saved_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (exam_id, student_id, qid, sel, is_corr, m_obt, iso(started_at + timedelta(seconds=(i + 1) * 75))))

        if status != 'In Progress':
            total_marks = sum(q['marks'] for q in q_list)
            pct = round((score / total_marks * 100), 2) if total_marks else 0
            c.execute("SELECT passing_marks FROM examinations WHERE exam_id = ?", (exam_id,))
            pass_m = c.fetchone()[0]
            res_status = 'Pass' if score >= pass_m else 'Fail'

            c.execute("""
                INSERT INTO results (exam_id, student_id, total_questions, attempted_questions, correct_answers, wrong_answers, score, percentage, result_status, generated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (exam_id, student_id, len(q_list), attempted, correct, wrong, score, pct, res_status, iso(submitted_at or now)))

    cs_cohort = [s for s in student_records if s['course_id'] == cs_id and s['status'] == 'Active']
    for i, s in enumerate(cs_cohort):
        acc = 0.86 if s['enrollment_no'] == '21CS1047' else 0.45 + ((i * 37) % 50) / 100
        t1 = now - timedelta(days=17) + timedelta(minutes=i * 3)
        sub1 = t1 + timedelta(minutes=14 + (i % 6))
        seed_attempt(cn_test, s['student_id'], t1, sub1, 'Submitted', q_by_subject['Computer Networks'], acc, 0.8 if i % 4 == 3 else 1.0)

        t2 = now - timedelta(days=26) + timedelta(minutes=i * 2)
        sub2 = t2 + timedelta(minutes=12 + (i % 7))
        stat2 = 'Auto-Submitted' if i == 7 else 'Submitted'
        tabs2 = 3 if i == 7 else 0
        seed_attempt(se_quiz, s['student_id'], t2, sub2, stat2, q_by_subject['Software Engineering'], min(0.95, acc + 0.05), 0.9 if i % 5 == 4 else 1.0, tab_switches=tabs2)

    def student_by_roll(roll):
        return next(s for s in student_records if s['enrollment_no'] == roll)

    for i, (roll, acc) in enumerate([('21CS1052', 0.8), ('21CS1063', 0.62), ('21CS1058', 0.5)]):
        t = now - timedelta(hours=5) - timedelta(minutes=i * 40)
        sub = t + timedelta(minutes=28 + i * 4)
        seed_attempt(ds_mid, student_by_roll(roll)['student_id'], t, sub, 'Submitted', q_by_subject['Data Structures'], acc, 1.0)

    for i, (roll, frac, acc, tabs) in enumerate([('21CS1012', 0.6, 0.55, 0), ('21CS1023', 0.4, 0.7, 1), ('21CS1031', 0.75, 0.3, 0), ('21CS1038', 0.25, 0.65, 2)]):
        t = now - timedelta(minutes=8 + i * 5)
        seed_attempt(ds_mid, student_by_roll(roll)['student_id'], t, None, 'In Progress', q_by_subject['Data Structures'], acc, frac, tab_switches=tabs, is_simulated=1)

    # 6. Notifications
    c.execute("INSERT INTO notifications (title, message, course_id, type, created_at) VALUES (?, ?, ?, ?, ?)",
              ('Results published', 'Results for Computer Networks Unit Test are now available.', cs_id, 'result', iso(now - timedelta(days=16))))
    c.execute("INSERT INTO notifications (title, message, course_id, type, created_at) VALUES (?, ?, ?, ?, ?)",
              ('Examination scheduled', 'Data Structures End-Semester has been scheduled. Check My Exams for the date and time.', cs_id, 'exam', iso(now - timedelta(days=2))))
    c.execute("INSERT INTO notifications (title, message, course_id, type, created_at) VALUES (?, ?, ?, ?, ?)",
              ('Examinations now live', 'Data Structures Mid-Term, Database Management Systems and Operating Systems Quiz are open until next week.', cs_id, 'exam', iso(now - timedelta(days=1))))

    # 7. Activity Logs
    c.execute("INSERT INTO activity_logs (exam_id, user_role, user_id, user_name, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (None, 'admin', 1, 'Dr. Priya Sharma', 'Exam created', 'Created "Data Structures End-Semester"', iso(now - timedelta(days=3))))
    c.execute("INSERT INTO activity_logs (exam_id, user_role, user_id, user_name, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (None, 'admin', 1, 'Dr. Priya Sharma', 'Exam scheduled', 'Scheduled "Data Structures End-Semester"', iso(now - timedelta(days=2))))
    c.execute("INSERT INTO activity_logs (exam_id, user_role, user_id, user_name, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (ds_mid, 'student', student_by_roll('21CS1012')['student_id'], 'Diya Patel', 'Exam started', 'Started "Data Structures Mid-Term"', iso(now - timedelta(minutes=15))))
    c.execute("INSERT INTO activity_logs (exam_id, user_role, user_id, user_name, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (ds_mid, 'student', student_by_roll('21CS1023')['student_id'], 'Rohan Iyer', 'Tab switch detected', 'Left the examination window (warning 1 of 3)', iso(now - timedelta(minutes=10))))

    conn.commit()
    conn.close()
    print("Database successfully seeded in database/ directory!")

if __name__ == "__main__":
    seed_database()
