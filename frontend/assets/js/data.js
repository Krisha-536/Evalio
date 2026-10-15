/* =========================================================
   Evalio – seed data
   Tables and field names follow the Exp 7 Data Design
   (Student, Administrator, Course, Question, Examination,
   Exam Question, Answer, Result, Schedule) plus the Activity
   Log and Notification entities from Exp 6 §2.1.
   This is only used until the MySQL backend is connected.
   ========================================================= */
const Seed = (() => {
  const VERSION = 3;

  // [topic, question_text, option_a, option_b, option_c, option_d, correct_option, difficulty]
  const BANK = {
    'Data Structures': {
      marks: 2, rows: [
        ['Arrays and Linked Lists', 'What is the time complexity of accessing an element of an array by its index?', 'O(1)', 'O(n)', 'O(log n)', 'O(n log n)', 'A', 'Easy'],
        ['Arrays and Linked Lists', 'Which type of linked list allows traversal in both directions?', 'Singly linked list', 'Doubly linked list', 'Circular singly linked list', 'None of these', 'B', 'Easy'],
        ['Arrays and Linked Lists', 'Inserting a new node at the head of a singly linked list takes:', 'O(n)', 'O(log n)', 'O(1)', 'O(n²)', 'C', 'Easy'],
        ['Arrays and Linked Lists', 'Which of the following is a disadvantage of static arrays compared to linked lists?', 'Random access', 'Fixed size', 'Cache friendliness', 'Less memory per element', 'B', 'Medium'],
        ['Stacks and Queues', 'Which data structure follows the Last In, First Out (LIFO) principle?', 'Queue', 'Stack', 'Linked List', 'Binary Tree', 'B', 'Easy'],
        ['Stacks and Queues', 'Which data structure is used to implement Breadth First Search?', 'Stack', 'Queue', 'Heap', 'Trie', 'B', 'Easy'],
        ['Stacks and Queues', 'What is the postfix form of the expression A + B * C?', 'A B C * +', 'A B + C *', '+ A * B C', 'A * B C +', 'A', 'Medium'],
        ['Stacks and Queues', 'In an array-based circular queue of size n (one slot kept empty), the queue is full when:', '(rear + 1) % n == front', 'rear == front', 'front == 0', 'rear == n - 1', 'A', 'Hard'],
        ['Trees', 'What is the maximum number of nodes in a binary tree of height h (root at height 0)?', '2^h', '2^(h+1) - 1', '2h', 'h²', 'B', 'Medium'],
        ['Trees', 'An inorder traversal of a Binary Search Tree visits the keys in:', 'Random order', 'Ascending sorted order', 'Level order', 'Reverse insertion order', 'B', 'Easy'],
        ['Trees', 'What is the worst-case search time in an unbalanced BST with n nodes?', 'O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'C', 'Medium'],
        ['Trees', 'In an AVL tree, the balance factor of every node must be in the set:', '{-1, 0, 1}', '{0, 1, 2}', '{-2, -1, 0, 1, 2}', '{0}', 'A', 'Medium'],
        ['Trees', 'How many edges does a tree with n nodes have?', 'n', 'n - 1', 'n + 1', '2n', 'B', 'Easy'],
        ['Graphs', "Dijkstra's shortest path algorithm may give wrong results when the graph has:", 'Directed edges', 'Negative edge weights', 'Disconnected components', 'Cycles', 'B', 'Medium'],
        ['Graphs', 'An iterative Depth First Search is implemented using a:', 'Queue', 'Stack', 'Min-heap', 'Hash table', 'B', 'Easy'],
        ['Graphs', 'What is the space complexity of an adjacency matrix for a graph with V vertices?', 'O(V)', 'O(E)', 'O(V²)', 'O(V + E)', 'C', 'Easy'],
        ['Graphs', 'A topological ordering exists only for:', 'Undirected graphs', 'Directed acyclic graphs', 'Complete graphs', 'Weighted graphs', 'B', 'Medium'],
        ['Sorting and Searching', 'Binary search can be applied only when the array is:', 'Sorted', 'Unsorted', 'Of even length', 'Free of duplicates', 'A', 'Easy'],
        ['Sorting and Searching', 'Which sorting algorithm has a worst-case time complexity of O(n log n)?', 'Quick sort', 'Merge sort', 'Bubble sort', 'Insertion sort', 'B', 'Medium'],
        ['Sorting and Searching', 'Which of the following sorting algorithms is stable?', 'Quick sort', 'Heap sort', 'Merge sort', 'Selection sort', 'C', 'Hard']
      ]
    },
    'Database Management Systems': {
      marks: 2, rows: [
        ['ER Model', 'In an ER diagram, a weak entity set is represented by a:', 'Double rectangle', 'Ellipse', 'Diamond', 'Dashed ellipse', 'A', 'Easy'],
        ['ER Model', 'A relationship that involves exactly two entity sets is called:', 'Unary', 'Binary', 'Ternary', 'N-ary', 'B', 'Easy'],
        ['ER Model', 'A minimal set of attributes that uniquely identifies a tuple is a:', 'Super key', 'Candidate key', 'Foreign key', 'Composite attribute', 'B', 'Medium'],
        ['Normalization', 'A relation is in 2NF if it is in 1NF and has no:', 'Transitive dependency', 'Partial dependency', 'Multivalued dependency', 'Join dependency', 'B', 'Medium'],
        ['Normalization', 'In BCNF, the determinant of every non-trivial functional dependency must be a:', 'Super key', 'Foreign key', 'Non-prime attribute', 'Composite attribute', 'A', 'Hard'],
        ['Normalization', 'Third Normal Form (3NF) eliminates:', 'Partial dependencies', 'Transitive dependencies', 'Repeating groups', 'Multivalued dependencies', 'B', 'Medium'],
        ['SQL', 'Which command removes all rows from a table but keeps its structure?', 'DROP', 'TRUNCATE', 'ALTER', 'REVOKE', 'B', 'Easy'],
        ['SQL', 'Which SQL clause is used to filter groups created by GROUP BY?', 'WHERE', 'HAVING', 'ORDER BY', 'DISTINCT', 'B', 'Easy'],
        ['SQL', 'Which join returns all rows from the left table even without a match?', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'CROSS JOIN', 'B', 'Easy'],
        ['SQL', 'Which of the following is a Data Control Language (DCL) command?', 'GRANT', 'SELECT', 'UPDATE', 'CREATE', 'A', 'Medium'],
        ['Transactions', "The 'I' in ACID properties stands for:", 'Integrity', 'Isolation', 'Indexing', 'Inheritance', 'B', 'Easy'],
        ['Transactions', 'Which protocol guarantees conflict serializability?', 'Two-phase locking', 'Round robin', 'First come first serve', 'Paging', 'A', 'Hard'],
        ['Transactions', 'Reading data written by an uncommitted transaction is called a:', 'Phantom read', 'Dirty read', 'Lost update', 'Deadlock', 'B', 'Medium'],
        ['Indexing', 'Leaf nodes of a B+ tree are linked together mainly to support:', 'Range queries', 'Hashing', 'Encryption', 'Normalization', 'A', 'Medium'],
        ['Indexing', 'A primary index is built on the:', 'Non-key field', 'Ordering key field', 'Any random field', 'Foreign key only', 'B', 'Hard']
      ]
    },
    'Operating Systems': {
      marks: 2, rows: [
        ['Processes', 'A process in the ready state is waiting for:', 'I/O completion', 'The CPU', 'Memory allocation', 'A signal', 'B', 'Easy'],
        ['Processes', 'In UNIX, what does fork() return to the child process?', '0', 'The child PID', 'The parent PID', '-1', 'A', 'Medium'],
        ['Processes', 'Threads belonging to the same process share the:', 'Stack', 'Registers', 'Address space', 'Program counter', 'C', 'Medium'],
        ['CPU Scheduling', 'Which scheduling algorithm can lead to starvation?', 'Round Robin', 'FCFS', 'Shortest Job First', 'None of these', 'C', 'Medium'],
        ['CPU Scheduling', 'Round Robin scheduling is primarily designed for:', 'Batch systems', 'Time-sharing systems', 'Real-time systems only', 'Embedded systems', 'B', 'Easy'],
        ['CPU Scheduling', 'The convoy effect is associated with which algorithm?', 'FCFS', 'SJF', 'Round Robin', 'Priority', 'A', 'Medium'],
        ['Memory Management', 'Thrashing occurs when a system spends most of its time:', 'Executing user code', 'Paging', 'Writing to disk cache', 'Handling interrupts', 'B', 'Medium'],
        ['Memory Management', "Belady's anomaly can occur with which page replacement algorithm?", 'LRU', 'Optimal', 'FIFO', 'LFU', 'C', 'Hard'],
        ['Memory Management', 'Paging eliminates:', 'Internal fragmentation', 'External fragmentation', 'Both types', 'Neither type', 'B', 'Medium'],
        ['Deadlocks', 'Which of the following is NOT a necessary condition for deadlock?', 'Mutual exclusion', 'Hold and wait', 'Preemption', 'Circular wait', 'C', 'Medium'],
        ['Deadlocks', "The Banker's algorithm is used for deadlock:", 'Prevention', 'Avoidance', 'Detection', 'Recovery', 'B', 'Medium'],
        ['Deadlocks', 'If a resource allocation graph with single-instance resources contains a cycle, then:', 'There is no deadlock', 'A deadlock exists', 'Starvation exists', 'A livelock exists', 'B', 'Hard'],
        ['File Systems', 'Which file allocation method suffers from external fragmentation?', 'Contiguous', 'Linked', 'Indexed', 'None', 'A', 'Medium'],
        ['File Systems', 'A UNIX inode stores:', 'The file name', 'File metadata and block pointers', 'The directory tree', 'Boot code', 'B', 'Medium'],
        ['File Systems', 'Which of the following is a disk scheduling algorithm?', 'SCAN', 'LRU', 'Optimal', 'Round Robin', 'A', 'Easy']
      ]
    },
    'Computer Networks': {
      marks: 5, rows: [
        ['OSI Model', 'How many layers are there in the OSI reference model?', '5', '6', '7', '4', 'C', 'Easy'],
        ['OSI Model', 'Which OSI layer is responsible for routing packets?', 'Data Link', 'Network', 'Transport', 'Session', 'B', 'Easy'],
        ['OSI Model', 'Encryption and data compression belong to which OSI layer?', 'Application', 'Presentation', 'Session', 'Transport', 'B', 'Medium'],
        ['TCP/IP', 'How many steps are there in the TCP connection handshake?', '2', '3', '4', '1', 'B', 'Easy'],
        ['TCP/IP', 'Which of the following protocols is connectionless?', 'TCP', 'UDP', 'FTP', 'SMTP', 'B', 'Easy'],
        ['TCP/IP', 'What is the default port number for HTTPS?', '80', '21', '443', '25', 'C', 'Easy'],
        ['Routing', 'OSPF is an example of a:', 'Distance vector protocol', 'Link state protocol', 'Path vector protocol', 'Static routing protocol', 'B', 'Medium'],
        ['Routing', 'The count-to-infinity problem is associated with:', 'Link state routing', 'Distance vector routing', 'Flooding', 'Hierarchical routing', 'B', 'Hard'],
        ['Data Link Layer', 'CSMA/CD is used in:', 'Ethernet', 'Wi-Fi', 'Token Ring', 'Bluetooth', 'A', 'Medium'],
        ['Data Link Layer', 'What is the size of a MAC address?', '32 bits', '48 bits', '64 bits', '128 bits', 'B', 'Easy']
      ]
    },
    'Software Engineering': {
      marks: 4, rows: [
        ['SDLC Models', 'Which software process model is risk-driven?', 'Waterfall', 'Spiral', 'V-model', 'Big bang', 'B', 'Easy'],
        ['SDLC Models', 'In which model are phases carried out strictly one after another?', 'Waterfall', 'Agile', 'Spiral', 'Incremental', 'A', 'Easy'],
        ['SDLC Models', 'A Scrum sprint typically lasts:', '1–4 weeks', '6 months', '1 day', '1 year', 'A', 'Easy'],
        ['Testing', 'White-box testing is based on:', 'Requirements only', 'Internal code structure', 'User interface', 'User manuals', 'B', 'Easy'],
        ['Testing', 'Testing the interaction between modules is called:', 'Unit testing', 'Integration testing', 'System testing', 'Acceptance testing', 'B', 'Easy'],
        ['Testing', 'Cyclomatic complexity measures the number of:', 'Lines of code', 'Linearly independent paths', 'Function points', 'Defects', 'B', 'Medium'],
        ['Estimation', 'The Basic COCOMO effort equation for an organic project is:', '2.4 (KLOC)^1.05', '3.0 (KLOC)^1.12', '3.6 (KLOC)^1.20', '2.5 (KLOC)^0.38', 'A', 'Medium'],
        ['Estimation', 'Function points measure the:', 'Size of source code', 'Functionality delivered to the user', 'Defect density', 'Team size', 'B', 'Easy'],
        ['Requirements', '"The system shall respond within 2 seconds" is an example of a:', 'Functional requirement', 'Non-functional requirement', 'Domain requirement', 'User story', 'B', 'Medium'],
        ['Requirements', 'SRS stands for:', 'Software Requirement Specification', 'System Resource Schedule', 'Software Review Summary', 'Standard Release Specification', 'A', 'Easy']
      ]
    }
  };

  const STUDENTS = [
    // name, enrollment_no, course_id, phone, status, ability (only used to simulate past attempts)
    ['Aarav Mehta', '21CS1047', 1, '9820011047', 'Active', .86],
    ['Diya Sharma', '21CS1012', 1, '9820011012', 'Active', .78],
    ['Rohan Iyer', '21CS1033', 1, '9820011033', 'Active', .62],
    ['Ananya Kulkarni', '21CS1005', 1, '9820011005', 'Active', .91],
    ['Kabir Singh', '21CS1058', 1, '9820011058', 'Active', .48],
    ['Isha Patil', '21CS1021', 1, '9820011021', 'Active', .7],
    ['Vihaan Reddy', '21CS1064', 1, '9820011064', 'Active', .55],
    ['Meera Nair', '21CS1039', 1, '9820011039', 'Active', .82],
    ['Arjun Desai', '21CS1002', 1, '9820011002', 'Active', .4],
    ['Saanvi Joshi', '21CS1070', 1, '9820011070', 'Active', .74],
    ['Aditya Rao', '21IT1015', 2, '9820021015', 'Active', .66],
    ['Priya Menon', '21IT1027', 2, '9820021027', 'Active', .8],
    ['Neel Shah', '21EC1009', 3, '9820031009', 'Inactive', .6]
  ];

  function build(now) {
    const DAY = 864e5, HR = 36e5, MIN = 6e4;
    const iso = t => new Date(t).toISOString();
    const rand = EV.rng(20261015);
    const db = {
      version: VERSION,
      admins: [], students: [], courses: [], questions: [], examinations: [], exam_questions: [],
      schedules: [], answers: [], results: [], attempts: [], activity_logs: [], notifications: []
    };
    const seq = {};
    const add = (table, pk, row) => { seq[table] = (seq[table] || 0) + 1; const r = { [pk]: seq[table], ...row }; db[table].push(r); return r; };

    // ---- Administrator ----
    add('admins', 'admin_id', { name: 'Prof. Neha Kapoor', email: 'admin@evalio.edu', password: 'admin123', status: 'Active', created_at: iso(now - 200 * DAY) });

    // ---- Courses ----
    [
      ['Computer Science', 'B.Tech Computer Science & Engineering – core CS subjects including data structures, DBMS, OS, networks and software engineering.', 'Active'],
      ['Information Technology', 'B.Tech Information Technology – programming, web technologies and information systems.', 'Active'],
      ['Electronics & Telecommunication', 'B.Tech EXTC – signals, communication systems and embedded systems.', 'Active'],
      ['Mechanical Engineering', 'B.Tech Mechanical – thermodynamics, machine design and manufacturing.', 'Inactive']
    ].forEach(([course_name, description, status], i) =>
      add('courses', 'course_id', { course_name, description, status, created_at: iso(now - (180 - i * 5) * DAY) }));

    // ---- Students ----
    const ability = {};
    STUDENTS.forEach(([name, enrollment_no, course_id, phone, status, ab], i) => {
      const s = add('students', 'student_id', {
        name, enrollment_no, email: name.toLowerCase().replace(/\s+/g, '.') + '@evalio.edu',
        password: 'student123', course_id, phone, status, created_at: iso(now - (150 - i) * DAY)
      });
      ability[s.student_id] = ab;
    });

    // ---- Question bank ----
    const bySubject = {};
    Object.entries(BANK).forEach(([subject, { marks, rows }]) => {
      bySubject[subject] = rows.map(([topic, question_text, a, b, c, d, correct_option, difficulty]) =>
        add('questions', 'question_id', {
          course_id: 1, subject, topic, question_text,
          option_a: a, option_b: b, option_c: c, option_d: d, correct_option, difficulty,
          marks, negative_marks: marks / 4, status: 'Active', created_at: iso(now - 90 * DAY)
        }));
    });

    // ---- Examinations + Exam Questions + Schedules ----
    const examDefs = [
      { exam_name: 'Data Structures Mid-Term', subject: 'Data Structures', description: 'Mid-semester assessment covering arrays, linked lists, stacks, queues, trees, graphs, sorting and searching.', duration: 40, passing_marks: 16, negative_marking: false, result_mode: 'instant', qs: bySubject['Data Structures'], win: [now - 2 * DAY, now + 5 * DAY] },
      { exam_name: 'Database Management Systems', subject: 'Database Management Systems', description: 'Unit assessment on ER modelling, normalization, SQL, transactions and indexing.', duration: 45, passing_marks: 12, negative_marking: true, result_mode: 'instant', qs: bySubject['Database Management Systems'], win: [now - DAY, now + 6 * DAY] },
      { exam_name: 'Operating Systems Quiz', subject: 'Operating Systems', description: 'Quiz on processes, CPU scheduling, memory management, deadlocks and file systems.', duration: 30, passing_marks: 12, negative_marking: false, result_mode: 'manual', qs: bySubject['Operating Systems'], win: [now - 3 * HR, now + 3 * DAY] },
      { exam_name: 'Computer Networks Unit Test', subject: 'Computer Networks', description: 'Unit test on the OSI model, TCP/IP, routing and the data link layer.', duration: 30, passing_marks: 20, negative_marking: false, result_mode: 'instant', qs: bySubject['Computer Networks'], win: [now - 17 * DAY, now - 17 * DAY + 3 * HR] },
      { exam_name: 'Software Engineering Quiz', subject: 'Software Engineering', description: 'Quiz on process models, testing, estimation and requirements.', duration: 25, passing_marks: 16, negative_marking: false, result_mode: 'instant', qs: bySubject['Software Engineering'], win: [now - 26 * DAY, now - 26 * DAY + 3 * HR] },
      { exam_name: 'Algorithms Weekly Quiz', subject: 'Data Structures', description: 'Short weekly practice quiz on trees, graphs and sorting.', duration: 15, passing_marks: 8, negative_marking: true, result_mode: 'instant', qs: bySubject['Data Structures'].filter(q => ['Trees', 'Graphs', 'Sorting and Searching'].includes(q.topic)).slice(0, 10), win: [now + 3 * DAY, now + 3 * DAY + 2 * HR] },
      { exam_name: 'Operating Systems End-Term', subject: 'Operating Systems', description: 'End-semester examination (draft – questions still being finalised).', duration: 60, passing_marks: 12, negative_marking: true, result_mode: 'manual', qs: bySubject['Operating Systems'], win: null, draft: true }
    ];

    const exams = examDefs.map(def => {
      const exam = add('examinations', 'exam_id', {
        course_id: 1, exam_name: def.exam_name, subject: def.subject, description: def.description,
        duration: def.duration, total_marks: EV.sum(def.qs.map(q => q.marks)), passing_marks: def.passing_marks,
        negative_marking: def.negative_marking, status: def.draft ? 'Draft' : 'Scheduled',
        shuffle_questions: !def.draft, shuffle_options: !def.draft, allow_review: true,
        result_mode: def.result_mode, result_published: def.result_mode === 'instant',
        max_tab_switches: 3, created_at: iso(now - 30 * DAY)
      });
      def.qs.forEach((q, i) => add('exam_questions', 'exam_question_id', { exam_id: exam.exam_id, question_id: q.question_id, question_order: i + 1 }));
      if (def.win) {
        const [start, end] = def.win;
        add('schedules', 'schedule_id', { exam_id: exam.exam_id, start_time: iso(start), end_time: iso(end), status: now < start ? 'Scheduled' : now > end ? 'Completed' : 'Active' });
        exam.status = now < start ? 'Scheduled' : now > end ? 'Completed' : 'Active';
      }
      return { exam, def };
    });

    const log = (user_role, user_id, activity_type, details, exam_id, t) =>
      add('activity_logs', 'log_id', { user_role, user_id, exam_id, activity_type, details, logged_at: iso(t) });
    const notify = (recipient_role, recipient_id, title, message, link, t, is_read = false) =>
      add('notifications', 'notification_id', { recipient_role, recipient_id, title, message, link, is_read, created_at: iso(t) });

    /** Simulates a finished attempt so analytics have realistic history. */
    function simulate(exam, qs, student_id, startT) {
      const ab = ability[student_id];
      const factor = { Easy: 1.05, Medium: .88, Hard: .62 };
      const selections = {};
      qs.forEach(q => {
        if (rand() < .06) return; // left unattempted
        if (rand() < ab * factor[q.difficulty]) selections[q.question_id] = q.correct_option;
        else selections[q.question_id] = EV.shuffle(EV.OPTIONS.filter(o => o !== q.correct_option), rand)[0];
      });
      const { graded, result } = EV.evaluate(exam, qs, selections);
      const time_taken = Math.round(exam.duration * 60 * (.55 + rand() * .4));
      graded.forEach((g, i) => {
        if (!g.selected_option) return;
        add('answers', 'answer_id', { exam_id: exam.exam_id, student_id, question_id: g.question_id, selected_option: g.selected_option, is_correct: g.is_correct, marks_obtained: g.marks_obtained, saved_at: iso(startT + (time_taken * 1000 * (i + 1)) / qs.length) });
      });
      const endT = startT + time_taken * 1000;
      add('attempts', 'attempt_id', { exam_id: exam.exam_id, student_id, started_at: iso(startT), last_activity: iso(endT), submitted_at: iso(endT), status: 'submitted', question_order: qs.map(q => q.question_id), option_order: {}, responses: selections, marked: {}, current_index: 0, tab_switches: rand() < .2 ? 1 : 0, simulated: true });
      add('results', 'result_id', { exam_id: exam.exam_id, student_id, ...result, time_taken, generated_at: iso(endT) });
      log('student', student_id, 'EXAM_START', `Started ${exam.exam_name}`, exam.exam_id, startT);
      log('student', student_id, 'EXAM_SUBMIT', `Submitted ${exam.exam_name} – ${result.score}/${exam.total_marks}`, exam.exam_id, endT);
    }

    const csStudents = db.students.filter(s => s.course_id === 1 && s.status === 'Active').map(s => s.student_id);
    const [ds, dbms, os, cn, se] = exams;

    // Completed exams: everyone in the course attempted them
    [cn, se].forEach(({ exam, def }) => csStudents.forEach((sid, i) => simulate(exam, def.qs, sid, def.win[0] + (20 + i * 4) * MIN)));
    // Active exams: a few students already submitted
    [9, 10].forEach((sid, i) => simulate(ds.exam, ds.def.qs, sid, now - (30 + i * 50) * HR));
    [4, 8, 2].forEach((sid, i) => simulate(dbms.exam, dbms.def.qs, sid, now - (6 + i * 3) * HR));
    [2, 4, 5, 6].forEach((sid, i) => simulate(os.exam, os.def.qs, sid, now - (150 - i * 20) * MIN));

    // Live, in-progress attempts (drive the Live Monitoring screen)
    [[3, ds], [5, ds], [6, ds], [7, ds], [10, dbms], [8, os]].forEach(([sid, { exam, def }], i) => {
      const started = now - (6 + i * 4) * MIN;
      const answeredCount = Math.floor(def.qs.length * (.15 + rand() * .5));
      const responses = {};
      def.qs.slice(0, answeredCount).forEach(q => { responses[q.question_id] = EV.OPTIONS[Math.floor(rand() * 4)]; });
      add('attempts', 'attempt_id', { exam_id: exam.exam_id, student_id: sid, started_at: iso(started), last_activity: iso(now - rand() * 2 * MIN), submitted_at: null, status: 'in_progress', question_order: def.qs.map(q => q.question_id), option_order: {}, responses, marked: {}, current_index: answeredCount, tab_switches: i === 2 ? 2 : i === 4 ? 1 : 0, simulated: true });
      log('student', sid, 'EXAM_START', `Started ${exam.exam_name}`, exam.exam_id, started);
      if (i === 2) {
        log('student', sid, 'TAB_SWITCH', 'Left the examination window (1/3)', exam.exam_id, started + 3 * MIN);
        log('student', sid, 'TAB_SWITCH', 'Left the examination window (2/3)', exam.exam_id, started + 7 * MIN);
      }
    });

    // Logins / admin actions
    log('admin', 1, 'LOGIN', 'Signed in', null, now - 5 * HR);
    log('admin', 1, 'EXAM_CREATED', 'Created examination "Algorithms Weekly Quiz"', exams[5].exam.exam_id, now - 4 * HR);
    log('admin', 1, 'EXAM_SCHEDULED', 'Scheduled "Algorithms Weekly Quiz"', exams[5].exam.exam_id, now - 4 * HR + 5 * MIN);
    log('student', 1, 'LOGIN', 'Signed in', null, now - 20 * HR);
    log('student', 7, 'LOGIN_FAILED', 'Invalid password', null, now - 2 * HR);

    // ---- Notifications ----
    csStudents.forEach(sid => {
      notify('student', sid, 'New examination scheduled', 'Algorithms Weekly Quiz opens in 3 days. Duration: 15 minutes.', 'exams.html', now - 4 * HR);
      notify('student', sid, 'Operating Systems Quiz is live', 'The quiz is open now and closes in 3 days.', 'exams.html', now - 3 * HR);
      notify('student', sid, 'Results published', 'Your Software Engineering Quiz result is now available.', 'results.html', now - 25 * DAY, true);
    });
    notify('admin', 1, 'Results awaiting publication', 'Operating Systems Quiz has submissions that are not yet published.', 'results.html', now - HR);
    notify('admin', 1, 'Tab-switch alert', 'Isha Patil switched tabs twice during Data Structures Mid-Term.', 'monitor.html', now - 10 * MIN);

    return db;
  }

  return { VERSION, build };
})();
