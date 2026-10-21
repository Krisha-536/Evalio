/* ==========================================================================
   Evalio — mock database
   --------------------------------------------------------------------------
   Mirrors the tables defined in Exp 7 (Data Design). Until the Java/MySQL
   backend exists, the "database" lives in localStorage so that every page
   (and every open tab) sees the same data. Pages never touch this file
   directly — they go through js/api.js.

   Columns follow the data dictionary exactly. A few extra columns that the
   UI mock-ups need are marked  // + ext  (see README "Schema additions").
   ========================================================================== */
(function () {
  const KEY = 'evalio.v2.db';
  const VERSION = 3;
  const MIN = 60e3, DAY = 864e5;

  // Primary key of every table — used by the generic CRUD calls in api.js
  const PK = {
    courses: 'course_id',
    administrators: 'admin_id',
    students: 'student_id',
    questions: 'question_id',
    examinations: 'exam_id',
    exam_questions: 'exam_question_id',
    schedules: 'schedule_id',
    answers: 'answer_id',
    results: 'result_id',
    exam_attempts: 'attempt_id',       // + ext (attempt/session state for auto-save, resume, monitoring)
    activity_logs: 'log_id',           // Activity Log entity (Exp 6 §2.1)
    notifications: 'notification_id'   // Notification entity (Exp 6 §2.1)
  };

  const iso = (t) => new Date(t).toISOString();
  const round2 = (n) => Math.round(n * 100) / 100;

  // Deterministic PRNG so seeded results are identical after every reset
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ------------------------------------------------------------------------
     Question bank seed: [topic, question, A, B, C, D, correct, difficulty]
     ------------------------------------------------------------------------ */
  const BANK = {
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
  };

  /* ------------------------------------------------------------------------
     Evaluation Component (Exp 7 §Procedural Design 6) — shared "server" logic
     ------------------------------------------------------------------------ */
  function examQuestionIds(db, examId) {
    return db.exam_questions.filter((x) => x.exam_id === examId)
      .sort((a, b) => a.question_order - b.question_order).map((x) => x.question_id);
  }

  function evaluate(db, attempt) {
    const exam = db.examinations.find((e) => e.exam_id === attempt.exam_id);
    const qids = examQuestionIds(db, exam.exam_id);
    let attempted = 0, correct = 0, wrong = 0, score = 0, total = 0;
    qids.forEach((qid) => {
      const q = db.questions.find((x) => x.question_id === qid);
      total += +q.marks;
      const a = db.answers.find((x) => x.exam_id === exam.exam_id && x.student_id === attempt.student_id && x.question_id === qid);
      if (!a || !a.selected_option) return;
      attempted++;
      a.is_correct = a.selected_option === q.correct_option;
      a.marks_obtained = a.is_correct ? +q.marks : (exam.negative_marking ? -q.negative_marks : 0);
      if (a.is_correct) correct++; else wrong++;
      score += a.marks_obtained;
    });
    score = Math.max(0, round2(score));
    const totalMarks = +exam.total_marks || total;
    const row = {
      exam_id: exam.exam_id,
      student_id: attempt.student_id,
      total_questions: qids.length,
      attempted_questions: attempted,
      correct_answers: correct,
      wrong_answers: wrong,
      score,
      percentage: totalMarks ? round2((score / totalMarks) * 100) : 0,
      result_status: score >= +exam.passing_marks ? 'Pass' : 'Fail',
      generated_at: iso(attempt.submitted_at ? Date.parse(attempt.submitted_at) : Date.now())
    };
    const existing = db.results.find((r) => r.exam_id === row.exam_id && r.student_id === row.student_id);
    if (existing) Object.assign(existing, row);
    else { db.seq.results = (db.seq.results || 0) + 1; db.results.push({ result_id: db.seq.results, ...row }); }
    return db.results.find((r) => r.exam_id === row.exam_id && r.student_id === row.student_id);
  }

  // Builds a randomized question/option order for one attempt (FR-07)
  function buildAttemptOrder(db, exam, r) {
    let order = examQuestionIds(db, exam.exam_id);
    if (exam.shuffle_questions) order = shuffle(order, r);
    const option_order = {};
    order.forEach((qid) => { option_order[qid] = exam.shuffle_options ? shuffle(['A', 'B', 'C', 'D'], r) : ['A', 'B', 'C', 'D']; });
    return { question_order: order, option_order };
  }

  /* ------------------------------------------------------------------------
     Seed
     ------------------------------------------------------------------------ */
  function seed() {
    const now = Date.now();
    const db = { version: VERSION, seq: {} };
    Object.keys(PK).forEach((t) => { db[t] = []; db.seq[t] = 0; });
    const add = (table, row) => { db.seq[table]++; const r = { [PK[table]]: db.seq[table], ...row }; db[table].push(r); return r; };

    // Courses
    const cs = add('courses', { course_name: 'Computer Science', description: 'B.Tech Computer Science & Engineering — core CS subjects.', status: 'Active', created_at: iso(now - 220 * DAY) });
    const it = add('courses', { course_name: 'Information Technology', description: 'B.Tech Information Technology.', status: 'Active', created_at: iso(now - 210 * DAY) });
    add('courses', { course_name: 'Electronics & Telecommunication', description: 'B.Tech EXTC — signals, circuits and communication.', status: 'Inactive', created_at: iso(now - 200 * DAY) });

    // Administrators (demo password in README; real backend stores a bcrypt hash)
    add('administrators', { name: 'Dr. Priya Sharma', email: 'admin@evalio.edu', password: 'admin123', status: 'Active', created_at: iso(now - 230 * DAY) });

    // Students
    const people = [
      ['Aarav Mehta', '21CS1047', cs], ['Diya Patel', '21CS1012', cs], ['Rohan Iyer', '21CS1023', cs], ['Ananya Gupta', '21CS1031', cs],
      ['Kabir Singh', '21CS1038', cs], ['Ishita Rao', '21CS1052', cs], ['Vivaan Joshi', '21CS1058', cs], ['Meera Nair', '21CS1063', cs],
      ['Arjun Reddy', '21CS1070', cs], ['Sneha Kulkarni', '21CS1076', cs], ['Aditya Verma', '21CS1081', cs], ['Pooja Desai', '21CS1089', cs],
      ['Rahul Menon', '21IT1005', it], ['Nisha Bhat', '21IT1011', it]
    ];
    const students = people.map(([name, roll, course], i) => add('students', {
      enrollment_no: roll, // + ext — "Student ID" shown on the login/dashboard mock-ups
      name,
      email: name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.') + '@evalio.edu',
      password: 'student123',
      course_id: course.course_id,
      phone: '98' + String(20000000 + i * 1234567).slice(0, 8),
      status: roll === '21CS1089' ? 'Inactive' : 'Active',
      created_at: iso(now - (180 - i) * DAY)
    }));

    // Questions
    const qBySubject = {};
    Object.entries(BANK).forEach(([subject, rows]) => {
      qBySubject[subject] = rows.map(([topic, text, a, b, c, d, correct, difficulty]) => add('questions', {
        course_id: cs.course_id,
        subject, // + ext
        topic,   // + ext — topic-wise analysis on the Performance Analysis mock
        question_text: text, option_a: a, option_b: b, option_c: c, option_d: d,
        correct_option: correct, difficulty, marks: 2, negative_marks: 0.5, status: 'Active'
      }));
    });

    // Examinations
    const mkExam = (o, questions) => {
      const exam = add('examinations', {
        course_id: cs.course_id,
        exam_name: o.name,
        subject: o.subject,                         // + ext
        description: o.description,
        duration: o.duration,
        total_marks: questions.reduce((s, q) => s + q.marks, 0),
        passing_marks: o.passing,
        negative_marking: !!o.negative,
        status: o.status,
        shuffle_questions: o.shuffle !== false,     // + ext (FR-07)
        shuffle_options: o.shuffle !== false,       // + ext (FR-07)
        result_published: !!o.published,           // + ext (FR-14 publish results)
        max_tab_switches: 3,                        // + ext (tab-switch detection)
        created_at: iso(now - 40 * DAY)
      });
      questions.forEach((q, i) => add('exam_questions', { exam_id: exam.exam_id, question_id: q.question_id, question_order: i + 1 }));
      add('schedules', { exam_id: exam.exam_id, start_time: iso(o.start), end_time: iso(o.end), status: 'Scheduled' });
      return exam;
    };
    const ds = mkExam({ name: 'Data Structures Mid-Term', subject: 'Data Structures', description: 'Mid-term examination covering arrays, linked lists, stacks, queues, trees, graphs, sorting and searching.', duration: 40, passing: 16, status: 'Active', published: true, start: now - DAY, end: now + 6 * DAY }, qBySubject['Data Structures']);
    mkExam({ name: 'Database Management Systems', subject: 'Database Management Systems', description: 'Unit test on ER modelling, normalization, SQL, transactions and indexing.', duration: 30, passing: 12, negative: true, status: 'Active', published: true, start: now - DAY, end: now + 6 * DAY }, qBySubject['Database Management Systems']);
    mkExam({ name: 'Operating Systems Quiz', subject: 'Operating Systems', description: 'Quiz on processes, scheduling, memory management, deadlocks and file systems.', duration: 30, passing: 12, status: 'Active', published: false, start: now - DAY, end: now + 6 * DAY }, qBySubject['Operating Systems']);
    const cn = mkExam({ name: 'Computer Networks Unit Test', subject: 'Computer Networks', description: 'Unit test 1 — OSI model, TCP/IP, routing and addressing.', duration: 20, passing: 8, status: 'Completed', published: true, start: now - 17 * DAY, end: now - 16 * DAY }, qBySubject['Computer Networks']);
    const se = mkExam({ name: 'Software Engineering Quiz', subject: 'Software Engineering', description: 'Quiz on SDLC models, requirements, testing and estimation.', duration: 20, passing: 8, status: 'Completed', published: true, start: now - 26 * DAY, end: now - 25 * DAY }, qBySubject['Software Engineering']);
    mkExam({ name: 'Data Structures End-Semester', subject: 'Data Structures', description: 'End-semester examination (full syllabus).', duration: 60, passing: 16, negative: true, status: 'Scheduled', published: false, start: now + 9 * DAY, end: now + 9 * DAY + 3 * 3600e3 }, qBySubject['Data Structures'].filter((q) => q.difficulty !== 'Easy').concat(qBySubject['Data Structures'].filter((q) => q.difficulty === 'Easy').slice(0, 4)));
    const draft = add('examinations', { course_id: cs.course_id, exam_name: 'Operating Systems End-Semester', subject: 'Operating Systems', description: 'Draft — questions still being finalised.', duration: 60, total_marks: 0, passing_marks: 12, negative_marking: false, status: 'Draft', shuffle_questions: true, shuffle_options: true, result_published: false, max_tab_switches: 3, created_at: iso(now - 2 * DAY) });
    void draft;

    // Attempts + answers + results
    const seedAttempt = (exam, student, o) => {
      const r = rng(exam.exam_id * 1000 + student.student_id);
      const { question_order, option_order } = buildAttemptOrder(db, exam, r);
      const started = o.startedAt;
      const answerCount = Math.round(question_order.length * (o.answerFraction ?? 1));
      question_order.slice(0, answerCount).forEach((qid, i) => {
        const q = db.questions.find((x) => x.question_id === qid);
        const wrongs = ['A', 'B', 'C', 'D'].filter((k) => k !== q.correct_option);
        const sel = r() < o.accuracy ? q.correct_option : wrongs[Math.floor(r() * 3)];
        add('answers', { exam_id: exam.exam_id, student_id: student.student_id, question_id: qid, selected_option: sel, is_correct: null, marks_obtained: 0, saved_at: iso(started + (i + 1) * 75e3) });
      });
      const attempt = add('exam_attempts', {
        exam_id: exam.exam_id, student_id: student.student_id,
        started_at: iso(started),
        submitted_at: o.submittedAt ? iso(o.submittedAt) : null,
        status: o.status,
        question_order, option_order,
        marked: o.marked || [],
        current_index: Math.min(answerCount, question_order.length - 1),
        tab_switches: o.tabSwitches || 0,
        last_activity: iso(o.submittedAt || started + answerCount * 75e3),
        simulated: !!o.simulated
      });
      if (o.status !== 'In Progress') evaluate(db, attempt);
      return attempt;
    };

    const cohort = students.filter((s) => s.course_id === cs.course_id && s.status === 'Active');
    cohort.forEach((s, i) => {
      const acc = s.enrollment_no === '21CS1047' ? 0.86 : 0.45 + ((i * 37) % 50) / 100;
      const t1 = now - 17 * DAY + (i * 3) * MIN;
      seedAttempt(cn, s, { startedAt: t1, submittedAt: t1 + (14 + (i % 6)) * MIN, status: 'Submitted', accuracy: acc, answerFraction: i % 4 === 3 ? 0.8 : 1 });
      const t2 = now - 26 * DAY + (i * 2) * MIN;
      seedAttempt(se, s, { startedAt: t2, submittedAt: t2 + (12 + (i % 7)) * MIN, status: i === 7 ? 'Auto-Submitted' : 'Submitted', accuracy: Math.min(0.95, acc + 0.05), answerFraction: i % 5 === 4 ? 0.9 : 1, tabSwitches: i === 7 ? 3 : 0 });
    });
    // Data Structures Mid-Term is live: some submitted, some writing it right now (simulated for Live Monitoring)
    const byRoll = (roll) => students.find((s) => s.enrollment_no === roll);
    [['21CS1052', 0.8], ['21CS1063', 0.62], ['21CS1058', 0.5]].forEach(([roll, acc], i) => {
      const t = now - 5 * 3600e3 - i * 40 * MIN;
      seedAttempt(ds, byRoll(roll), { startedAt: t, submittedAt: t + (28 + i * 4) * MIN, status: 'Submitted', accuracy: acc });
    });
    [['21CS1012', 0.6, 0.55, 0], ['21CS1023', 0.4, 0.7, 1], ['21CS1031', 0.75, 0.3, 0], ['21CS1038', 0.25, 0.65, 2]].forEach(([roll, frac, acc, tabs], i) => {
      seedAttempt(ds, byRoll(roll), { startedAt: now - (8 + i * 5) * MIN, status: 'In Progress', accuracy: acc, answerFraction: frac, tabSwitches: tabs, simulated: true, marked: [] });
    });

    // Notifications
    add('notifications', { title: 'Results published', message: 'Results for Computer Networks Unit Test are now available.', course_id: cs.course_id, type: 'result', created_at: iso(now - 16 * DAY) });
    add('notifications', { title: 'Examination scheduled', message: 'Data Structures End-Semester has been scheduled. Check My Exams for the date and time.', course_id: cs.course_id, type: 'exam', created_at: iso(now - 2 * DAY) });
    add('notifications', { title: 'Examinations now live', message: 'Data Structures Mid-Term, Database Management Systems and Operating Systems Quiz are open until next week.', course_id: cs.course_id, type: 'exam', created_at: iso(now - DAY) });

    // Activity logs
    const admin = db.administrators[0];
    const log = (t, role, user, action, details, exam_id = null) => add('activity_logs', { user_role: role, user_id: user[role === 'admin' ? 'admin_id' : 'student_id'], user_name: user.name, exam_id, action, details, created_at: iso(t) });
    log(now - 3 * DAY, 'admin', admin, 'Exam created', 'Created "Data Structures End-Semester"');
    log(now - 2 * DAY, 'admin', admin, 'Exam scheduled', 'Scheduled "Data Structures End-Semester"');
    log(now - DAY, 'admin', admin, 'Notification sent', 'Examinations now live');
    db.exam_attempts.filter((a) => a.exam_id === ds.exam_id).forEach((a) => {
      const s = students.find((x) => x.student_id === a.student_id);
      log(Date.parse(a.started_at), 'student', s, 'Exam started', 'Started "Data Structures Mid-Term"', ds.exam_id);
      if (a.tab_switches) log(Date.parse(a.started_at) + 4 * MIN, 'student', s, 'Tab switch detected', `Left the examination window (warning ${a.tab_switches} of 3)`, ds.exam_id);
      if (a.submitted_at) log(Date.parse(a.submitted_at), 'student', s, 'Exam submitted', 'Submitted "Data Structures Mid-Term"', ds.exam_id);
    });
    db.activity_logs.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    db.activity_logs.forEach((l, i) => { l.log_id = i + 1; });

    syncStatuses(db);
    return db;
  }

  // Schedule/exam status follows the clock: Scheduled → Active → Completed
  function syncStatuses(db) {
    const now = Date.now();
    db.schedules.forEach((s) => {
      const start = Date.parse(s.start_time), end = Date.parse(s.end_time);
      s.status = now < start ? 'Scheduled' : now <= end ? 'Active' : 'Completed';
      const exam = db.examinations.find((e) => e.exam_id === s.exam_id);
      if (exam && exam.status !== 'Draft') exam.status = s.status;
    });
  }

  // Simulated "live" students should always look live, whenever the demo is opened
  function rebaseSimulation(db) {
    const now = Date.now();
    db.exam_attempts.filter((a) => a.simulated && a.status === 'In Progress').forEach((a, i) => {
      const exam = db.examinations.find((e) => e.exam_id === a.exam_id);
      const age = now - Date.parse(a.started_at);
      if (age > exam.duration * MIN * 0.85 || age < 0) {
        const shift = now - (6 + i * 5) * MIN - Date.parse(a.started_at);
        a.started_at = iso(Date.parse(a.started_at) + shift);
        a.last_activity = iso(now - (i + 1) * 20e3);
        db.answers.filter((x) => x.exam_id === a.exam_id && x.student_id === a.student_id)
          .forEach((x) => { x.saved_at = iso(Math.min(now, Date.parse(x.saved_at) + shift)); });
      }
    });
  }

  function load() {
    let db = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { db = JSON.parse(raw); if (db.version !== VERSION) db = null; }
    } catch (e) { db = null; }
    if (!db) db = seed();
    syncStatuses(db);
    rebaseSimulation(db);
    save(db);
    return db;
  }

  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error('Evalio: could not save mock DB', e); }
  }

  function reset() { localStorage.removeItem(KEY); return load(); }

  window.EvalioDB = { KEY, PK, load, save, reset, evaluate, buildAttemptOrder, examQuestionIds, rng, shuffle, round2 };
})();
