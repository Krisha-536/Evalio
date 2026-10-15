/* =========================================================
   Evalio – shared layout (navigation, notifications, toasts,
   confirm dialogs). Pages call Layout.student() / Layout.admin().
   ========================================================= */
const Layout = (() => {
  const brand = href => `<a class="ev-brand" href="${href}"><span class="ev-logo">E</span><span>Evalio</span></a>`;

  const STUDENT_LINKS = [
    ['dashboard', 'Dashboard', 'dashboard.html'],
    ['exams', 'My Exams', 'exams.html'],
    ['results', 'Results', 'results.html']
  ];

  const ADMIN_LINKS = [
    ['Overview', [
      ['dashboard', 'Dashboard', 'bi-grid-1x2', 'dashboard.html'],
      ['monitor', 'Live Monitoring', 'bi-broadcast', 'monitor.html', true]
    ]],
    ['Manage', [
      ['students', 'Students', 'bi-people', 'students.html'],
      ['courses', 'Courses', 'bi-journal-bookmark', 'courses.html'],
      ['questions', 'Question Bank', 'bi-patch-question', 'questions.html'],
      ['exams', 'Examinations', 'bi-file-earmark-text', 'exams.html'],
      ['schedule', 'Schedules', 'bi-calendar-event', 'schedule.html']
    ]],
    ['Evaluate', [
      ['results', 'Results', 'bi-award', 'results.html'],
      ['reports', 'Reports & Analytics', 'bi-bar-chart-line', 'reports.html'],
      ['logs', 'Activity Logs', 'bi-shield-check', 'logs.html']
    ]]
  ];

  /* ---------- Notifications dropdown ---------- */
  function bellHtml() {
    return `
      <div class="dropdown">
        <button class="btn btn-light btn-icon ev-bell" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-label="Notifications">
          <i class="bi bi-bell"></i><span class="count d-none" id="ev-bell-count"></span>
        </button>
        <div class="dropdown-menu dropdown-menu-end ev-notif-menu">
          <div class="head"><b class="ev-ink" style="font-size:.85rem">Notifications</b>
            <button class="btn btn-link btn-sm p-0 text-decoration-none" id="ev-mark-all">Mark all as read</button></div>
          <div class="list" id="ev-notif-list"></div>
        </div>
      </div>`;
  }

  function renderNotifications(session) {
    const list = document.getElementById('ev-notif-list');
    if (!list) return;
    const items = Notify.forUser(session);
    const unread = items.filter(n => !n.is_read).length;
    const badge = document.getElementById('ev-bell-count');
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.classList.toggle('d-none', !unread);
    list.innerHTML = items.length ? items.slice(0, 20).map(n => `
      <a class="ev-notif ${n.is_read ? '' : 'unread'}" href="${EV.esc(n.link || '#')}" data-id="${n.notification_id}">
        <span class="ic"><i class="bi ${iconFor(n.title)}"></i></span>
        <span><div class="t">${EV.esc(n.title)}</div><div class="m">${EV.esc(n.message)}</div><div class="time">${EV.timeAgo(n.created_at)}</div></span>
      </a>`).join('') : '<div class="ev-empty py-4"><i class="bi bi-bell-slash"></i>No notifications yet</div>';
    list.querySelectorAll('.ev-notif').forEach(a => a.addEventListener('click', () => Notify.markRead(+a.dataset.id)));
  }
  function iconFor(title) {
    const t = title.toLowerCase();
    if (t.includes('result')) return 'bi-award';
    if (t.includes('tab') || t.includes('alert')) return 'bi-exclamation-triangle';
    if (t.includes('live')) return 'bi-broadcast';
    return 'bi-calendar-event';
  }
  function bindNotifications(session) {
    renderNotifications(session);
    document.getElementById('ev-mark-all').addEventListener('click', () => { Notify.markAllRead(session); renderNotifications(session); });
  }

  /* ---------- Student layout ---------- */
  function student(active) {
    const s = Auth.require('student');
    if (!s) return null;
    const st = s.user;
    const links = STUDENT_LINKS.map(([k, label, href]) => `<a href="${href}" class="${k === active ? 'active' : ''}">${label}</a>`).join('');
    document.getElementById('app-nav').innerHTML = `
      <nav class="ev-topnav">
        <div class="inner">
          ${brand('dashboard.html')}
          <div class="links">${links}</div>
          <div class="d-flex align-items-center gap-3">
            ${bellHtml()}
            <div class="dropdown">
              <a href="#" class="ev-user" data-bs-toggle="dropdown">
                <span class="ev-avatar">${EV.initials(st.name)}</span>
                <span class="meta"><div class="name">${EV.esc(st.name)}</div><div class="sub">Student ID: ${EV.esc(st.enrollment_no)}</div></span>
              </a>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><span class="dropdown-item-text small text-muted">${EV.esc(st.email)}<br>${EV.esc(Exams.courseName(st.course_id))}</span></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="results.html"><i class="bi bi-clock-history me-2"></i>Exam history</a></li>
                <li><a class="dropdown-item text-danger" href="#" id="ev-logout"><i class="bi bi-box-arrow-right me-2"></i>Log out</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div class="ev-mobile-links">${links}</div>
      </nav>`;
    document.getElementById('ev-logout').addEventListener('click', e => { e.preventDefault(); Auth.logout(); });
    bindNotifications(s);
    return st;
  }

  /* ---------- Admin layout ---------- */
  function admin(active, crumb) {
    const s = Auth.require('admin');
    if (!s) return null;
    const ad = s.user;
    const live = DB.count('attempts', a => a.status === 'in_progress');
    const nav = ADMIN_LINKS.map(([group, items]) => `
      <div class="group">${group}</div>
      ${items.map(([k, label, icon, href, isLive]) => `
        <a class="ev-side-link ${k === active ? 'active' : ''}" href="${href}"><i class="bi ${icon}"></i>${label}${isLive && live ? '<span class="live" title="Students currently writing"></span>' : ''}</a>`).join('')}
    `).join('');
    document.getElementById('app-nav').innerHTML = `
      <aside class="offcanvas-lg offcanvas-start ev-sidebar" tabindex="-1" id="ev-sidebar">
        <div class="brand-row justify-content-between">${brand('dashboard.html')}
          <button type="button" class="btn-close d-lg-none" data-bs-dismiss="offcanvas" data-bs-target="#ev-sidebar" aria-label="Close"></button></div>
        <div class="nav-wrap">${nav}</div>
        <div class="foot"><span class="ev-chip neutral"><i class="bi bi-shield-lock"></i>Administrator</span></div>
      </aside>`;
    document.getElementById('app-topbar').innerHTML = `
      <header class="ev-admin-top">
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-light btn-icon d-lg-none" data-bs-toggle="offcanvas" data-bs-target="#ev-sidebar" aria-label="Menu"><i class="bi bi-list"></i></button>
          <div class="ev-crumb">Admin <i class="bi bi-chevron-right mx-1" style="font-size:.65rem"></i> <b>${EV.esc(crumb)}</b></div>
        </div>
        <div class="d-flex align-items-center gap-3">
          ${bellHtml()}
          <div class="dropdown">
            <a href="#" class="ev-user" data-bs-toggle="dropdown">
              <span class="ev-avatar">${EV.initials(ad.name)}</span>
              <span class="meta d-none d-sm-block"><div class="name">${EV.esc(ad.name)}</div><div class="sub">Administrator</div></span>
            </a>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><span class="dropdown-item-text small text-muted">${EV.esc(ad.email)}</span></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item" href="#" id="ev-reset-data"><i class="bi bi-arrow-counterclockwise me-2"></i>Reset demo data</a></li>
              <li><a class="dropdown-item text-danger" href="#" id="ev-logout"><i class="bi bi-box-arrow-right me-2"></i>Log out</a></li>
            </ul>
          </div>
        </div>
      </header>`;
    document.getElementById('ev-logout').addEventListener('click', e => { e.preventDefault(); Auth.logout(); });
    document.getElementById('ev-reset-data').addEventListener('click', async e => {
      e.preventDefault();
      if (await confirm({ title: 'Reset demo data?', body: 'All changes made in this browser will be replaced with the original sample data. You will need to sign in again.', okText: 'Reset data', okClass: 'btn-danger' })) {
        DB.reset(); Auth.clear(); location.href = '../index.html';
      }
    });
    bindNotifications(s);
    return ad;
  }

  /* ---------- Toasts ---------- */
  function toast(message, type = 'success') {
    let box = document.querySelector('.ev-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ev-toasts'; document.body.appendChild(box); }
    const icons = { success: 'bi-check-circle-fill', danger: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
    const el = document.createElement('div');
    el.className = `ev-toast ${type}`;
    el.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${EV.esc(message)}</span>`;
    box.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
  }

  /* ---------- Confirm dialog (returns Promise<boolean>) ---------- */
  function confirm({ title, body, okText = 'Confirm', okClass = 'btn-primary', cancelText = 'Cancel' }) {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="modal fade" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">
          <div class="modal-body p-4">
            <h5 class="mb-2">${EV.esc(title)}</h5>
            <div class="text-muted" style="font-size:.875rem">${body}</div>
            <div class="d-flex justify-content-end gap-2 mt-4">
              <button class="btn btn-light" data-act="no">${EV.esc(cancelText)}</button>
              <button class="btn ${okClass}" data-act="yes">${EV.esc(okText)}</button>
            </div>
          </div></div></div></div>`;
      const el = wrap.firstElementChild;
      document.body.appendChild(el);
      const m = new bootstrap.Modal(el);
      let answer = false;
      el.querySelector('[data-act="yes"]').onclick = () => { answer = true; m.hide(); };
      el.querySelector('[data-act="no"]').onclick = () => m.hide();
      el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(answer); });
      m.show();
    });
  }

  /** Small helper: render an empty-state row/table body. */
  const empty = (text, icon = 'bi-inbox') => `<div class="ev-empty"><i class="bi ${icon}"></i>${EV.esc(text)}</div>`;

  return { student, admin, toast, confirm, empty, brand };
})();
