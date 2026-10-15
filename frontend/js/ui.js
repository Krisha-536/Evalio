/* ==========================================================================
   Evalio — shared UI: layouts (student top nav, admin sidebar), formatting,
   toasts, confirm dialogs and a reusable form modal.
   ========================================================================== */
(function () {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const UI = {
    esc,
    param: (name) => new URLSearchParams(location.search).get(name),
    initials: (name) => String(name || '?').replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase(),

    fmtDate: (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'),
    fmtTime: (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'),
    fmtDateTime: (d) => (d ? `${UI.fmtDate(d)}, ${UI.fmtTime(d)}` : '—'),
    fmtClock(ms) {
      ms = Math.max(0, ms); const t = Math.floor(ms / 1000);
      const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
      const p = (n) => String(n).padStart(2, '0');
      return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
    },
    fmtDuration(ms) {
      const t = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
      return h ? `${h} h ${m} min` : m ? `${m} min ${s} s` : `${s} s`;
    },
    relTime(d) {
      const s = Math.round((Date.now() - new Date(d)) / 1000);
      if (s < 10) return 'just now';
      if (s < 60) return `${s}s ago`;
      if (s < 3600) return `${Math.floor(s / 60)} min ago`;
      if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
      if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
      return UI.fmtDate(d);
    },
    num: (n) => (Math.round(n * 100) / 100).toString(),
    toLocalInput(d) {
      const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
      return x.toISOString().slice(0, 16);
    },

    badge(status) {
      const map = {
        Active: 'success live', Inactive: 'neutral', Draft: 'neutral', Scheduled: 'primary', Completed: 'neutral',
        Pass: 'success', Fail: 'danger', Passed: 'success', Failed: 'danger',
        'In Progress': 'warning live', Submitted: 'success', 'Auto-Submitted': 'warning', 'Not Started': 'neutral',
        Published: 'success', Pending: 'warning', Missed: 'danger',
        Easy: 'success', Medium: 'warning', Hard: 'danger'
      };
      const cls = map[status] || 'neutral';
      const dot = /live/.test(cls) ? '<span class="dot"></span>' : '';
      return `<span class="ev-badge ${cls}">${dot}${esc(status)}</span>`;
    },
    pctBadge(p) {
      const cls = p >= 75 ? 'success' : p >= 40 ? 'warning' : 'danger';
      return `<span class="ev-badge ${cls}">${Math.round(p)}%</span>`;
    },
    empty: (text, icon = 'inbox') => `<div class="ev-empty"><i class="bi bi-${icon}"></i>${esc(text)}</div>`,
    skeleton: (h = 120) => `<div class="ev-skel" style="height:${h}px"></div>`,

    toast(message, type = 'success') {
      let box = document.querySelector('.ev-toasts');
      if (!box) { box = document.createElement('div'); box.className = 'ev-toasts'; document.body.appendChild(box); }
      const icon = { success: 'check-circle-fill', danger: 'x-circle-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' }[type] || 'info-circle-fill';
      const el = document.createElement('div');
      el.className = `ev-toast ${type}`;
      el.innerHTML = `<i class="bi bi-${icon}"></i><span>${esc(message)}</span>`;
      box.appendChild(el);
      setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
    },

    // Promise<boolean>
    confirm({ title = 'Are you sure?', body = '', okText = 'Confirm', okClass = 'btn-primary', cancelText = 'Cancel' } = {}) {
      return new Promise((resolve) => {
        const el = document.createElement('div');
        el.className = 'modal fade'; el.tabIndex = -1;
        el.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content">
          <div class="modal-body p-4"><h5 class="modal-title mb-2">${esc(title)}</h5><div class="text-muted small">${body}</div></div>
          <div class="modal-footer border-0 pt-0 px-4 pb-4"><button class="btn btn-light" data-bs-dismiss="modal">${esc(cancelText)}</button>
          <button class="btn ${okClass}" data-ok>${esc(okText)}</button></div></div></div>`;
        document.body.appendChild(el);
        const m = new bootstrap.Modal(el);
        let ok = false;
        el.querySelector('[data-ok]').onclick = () => { ok = true; m.hide(); };
        el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(ok); });
        m.show();
      });
    },

    /* Reusable add/edit form in a modal.
       fields: [{ name, label, type, options:[{value,label}], required, col, min, max, step, placeholder, help, rows }]
       onSubmit(values) may throw — the message is shown inside the modal. */
    formModal({ title, fields, values = {}, submitText = 'Save', size = '', onSubmit }) {
      const el = document.createElement('div');
      el.className = 'modal fade'; el.tabIndex = -1;
      const input = (f) => {
        const v = values[f.name] ?? f.default ?? '';
        const req = f.required ? 'required' : '';
        const attrs = `name="${f.name}" id="f_${f.name}" ${req} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} ${f.pattern ? `pattern="${f.pattern}"` : ''}`;
        if (f.type === 'select') return `<select class="form-select" ${attrs}>${f.placeholder ? `<option value="">${esc(f.placeholder)}</option>` : ''}${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
        if (f.type === 'textarea') return `<textarea class="form-control" rows="${f.rows || 3}" ${attrs}>${esc(v)}</textarea>`;
        if (f.type === 'checkbox') return `<div class="form-check form-switch mt-1"><input class="form-check-input" type="checkbox" ${attrs} ${v ? 'checked' : ''}><label class="form-check-label small" for="f_${f.name}">${esc(f.checkLabel || f.label)}</label></div>`;
        return `<input class="form-control" type="${f.type || 'text'}" value="${esc(v)}" ${attrs}>`;
      };
      el.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable ${size}"><form class="modal-content" novalidate>
        <div class="modal-header px-4"><h5 class="modal-title">${esc(title)}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body px-4"><div class="alert alert-danger small py-2 d-none" data-err></div><div class="row g-3">
        ${fields.map((f) => `<div class="col-md-${f.col || 12}">${f.type === 'checkbox' && !f.showLabel ? '' : `<label class="form-label" for="f_${f.name}">${esc(f.label)}${f.required ? ' <span class="text-danger">*</span>' : ''}</label>`}${input(f)}${f.help ? `<div class="form-text">${esc(f.help)}</div>` : ''}<div class="invalid-feedback">${esc(f.invalid || 'Please fill this in correctly.')}</div></div>`).join('')}
        </div></div>
        <div class="modal-footer px-4"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">${esc(submitText)}</button></div>
      </form></div>`;
      document.body.appendChild(el);
      const m = new bootstrap.Modal(el);
      const form = el.querySelector('form');
      const err = el.querySelector('[data-err]');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('d-none');
        if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
        const out = {};
        fields.forEach((f) => {
          const node = form.elements[f.name];
          if (f.type === 'checkbox') out[f.name] = node.checked;
          else if (f.type === 'number') out[f.name] = node.value === '' ? null : +node.value;
          else out[f.name] = node.value.trim();
        });
        const btn = form.querySelector('[type=submit]');
        btn.disabled = true;
        try { await onSubmit(out); m.hide(); }
        catch (ex) { err.textContent = ex.message; err.classList.remove('d-none'); }
        finally { btn.disabled = false; }
      });
      el.addEventListener('hidden.bs.modal', () => el.remove());
      m.show();
      return { modal: m, form };
    },

    /* ---------------- Notifications bell (both roles) ---------------- */
    async bell(session, mount) {
      const key = `evalio_read_${session.role}_${session.id}`;
      let read = [];
      try { read = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { read = []; }
      const items = await Api.notifications(session);
      const unread = items.filter((n) => !read.includes(n.notification_id)).length;
      mount.innerHTML = `<div class="dropdown">
        <button class="btn btn-light btn-icon ev-bell" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-label="Notifications"><i class="bi bi-bell"></i>${unread ? `<span class="count">${unread}</span>` : ''}</button>
        <div class="dropdown-menu dropdown-menu-end ev-notif-menu">
          <div class="px-3 py-2 border-bottom d-flex justify-content-between align-items-center"><b class="text-ink small">Notifications</b><span class="small text-muted">${items.length}</span></div>
          ${items.length ? items.slice(0, 15).map((n) => `<div class="ev-notif-item ${read.includes(n.notification_id) ? '' : 'unread'}">
            <div class="d-flex justify-content-between gap-2"><span class="t">${esc(n.title)}</span><span class="text-muted" style="font-size:.7rem;white-space:nowrap">${UI.relTime(n.created_at)}</span></div>
            <div class="text-muted mt-1">${esc(n.message)}</div></div>`).join('') : UI.empty('No notifications yet', 'bell')}
        </div></div>`;
      mount.querySelector('.dropdown').addEventListener('shown.bs.dropdown', () => {
        localStorage.setItem(key, JSON.stringify(items.map((n) => n.notification_id)));
        const c = mount.querySelector('.count'); if (c) c.remove();
      });
    },

    /* ---------------- Student layout (top navigation, as in the mock-ups) ---------------- */
    studentNav(session, active) {
      const links = [['dashboard', 'Dashboard', 'dashboard.html'], ['exams', 'My Exams', 'exams.html'], ['results', 'Results', 'results.html']];
      const el = document.getElementById('ev-nav');
      el.className = 'ev-topnav no-print';
      el.innerHTML = `<div class="container-xl"><div class="inner">
          <a href="dashboard.html" class="ev-brand"><span class="ev-logo">E</span>Evalio</a>
          <nav class="links">${links.map(([k, l, h]) => `<a href="${h}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}</nav>
          <div class="d-flex align-items-center gap-2 ms-auto ms-md-0">
            <div data-bell></div>
            <div class="dropdown">
              <button class="ev-user" data-bs-toggle="dropdown">
                <span class="ev-avatar">${esc(UI.initials(session.name))}</span>
                <span class="d-none d-sm-block"><span class="name d-block">${esc(session.name)}</span><span class="meta">Student ID: ${esc(session.enrollment_no)}</span></span>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li class="px-3 py-2 small"><div class="fw-bold text-ink">${esc(session.name)}</div><div class="text-muted">${esc(session.email)}</div><div class="text-muted">${esc(session.course_name || '')}</div></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="results.html"><i class="bi bi-graph-up me-2"></i>My performance</a></li>
                <li><button class="dropdown-item text-danger" data-logout><i class="bi bi-box-arrow-right me-2"></i>Log out</button></li>
              </ul>
            </div>
          </div>
        </div></div>
        <div class="ev-mobile-links">${links.map(([k, l, h]) => `<a href="${h}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}</div>`;
      el.querySelector('[data-logout]').onclick = () => Auth.logout();
      UI.bell(session, el.querySelector('[data-bell]'));
    },

    /* ---------------- Admin layout (sidebar + top bar) ---------------- */
    adminShell(session, active, title) {
      const groups = [
        ['Overview', [['dashboard', 'Dashboard', 'grid-1x2', 'dashboard.html']]],
        ['Management', [
          ['students', 'Students', 'people', 'students.html'],
          ['courses', 'Courses', 'journal-bookmark', 'courses.html'],
          ['questions', 'Question Bank', 'collection', 'questions.html'],
          ['exams', 'Examinations', 'file-earmark-text', 'exams.html'],
          ['schedule', 'Schedule', 'calendar-event', 'schedule.html']
        ]],
        ['Monitoring', [
          ['monitor', 'Live Monitoring', 'broadcast', 'monitor.html'],
          ['activity', 'Activity Logs', 'shield-check', 'activity.html']
        ]],
        ['Results', [
          ['results', 'Results', 'award', 'results.html'],
          ['reports', 'Reports & Analytics', 'bar-chart-line', 'reports.html'],
          ['notifications', 'Notifications', 'megaphone', 'notifications.html']
        ]]
      ];
      const side = document.getElementById('ev-sidebar');
      side.innerHTML = `<a href="dashboard.html" class="ev-brand"><span class="ev-logo">E</span>Evalio <span class="ev-chip ms-1">Admin</span></a>
        ${groups.map(([g, items]) => `<div class="ev-side-label">${g}</div>${items.map(([k, l, i, h]) => `<a class="ev-side-link ${k === active ? 'active' : ''}" href="${h}"><i class="bi bi-${i}"></i>${l}${k === 'monitor' ? '<span class="ev-badge warning live" data-live-count hidden><span class="dot"></span></span>' : ''}</a>`).join('')}`).join('')}
        <div class="mt-auto pt-4 px-2"><button class="btn btn-light btn-sm w-100" data-reset><i class="bi bi-arrow-counterclockwise me-1"></i>Reset demo data</button></div>`;
      side.querySelector('[data-reset]').onclick = async () => {
        if (await UI.confirm({ title: 'Reset demo data?', body: 'All changes made in this browser (students, questions, attempts, results) will be replaced by the original sample data.', okText: 'Reset', okClass: 'btn-danger' })) {
          await Api.resetDemo(); location.reload();
        }
      };
      const backdrop = document.createElement('div');
      backdrop.className = 'ev-side-backdrop';
      document.body.appendChild(backdrop);
      const toggle = (open) => { side.classList.toggle('open', open); backdrop.classList.toggle('open', open); };
      backdrop.onclick = () => toggle(false);

      const top = document.getElementById('ev-topbar');
      top.innerHTML = `<button class="btn btn-light btn-icon d-lg-none" data-menu aria-label="Menu"><i class="bi bi-list"></i></button>
        <span class="title">${esc(title)}</span>
        <div class="ms-auto d-flex align-items-center gap-2">
          <div data-bell></div>
          <div class="dropdown">
            <button class="ev-user" data-bs-toggle="dropdown"><span class="ev-avatar">${esc(UI.initials(session.name))}</span>
              <span class="d-none d-sm-block"><span class="name d-block">${esc(session.name)}</span><span class="meta">Administrator</span></span></button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li class="px-3 py-2 small"><div class="fw-bold text-ink">${esc(session.name)}</div><div class="text-muted">${esc(session.email)}</div></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item text-danger" data-logout><i class="bi bi-box-arrow-right me-2"></i>Log out</button></li>
            </ul>
          </div>
        </div>`;
      top.querySelector('[data-menu]').onclick = () => toggle(true);
      top.querySelector('[data-logout]').onclick = () => Auth.logout();
      UI.bell(session, top.querySelector('[data-bell]'));
      Api.adminOverview().then((o) => {
        const b = side.querySelector('[data-live-count]');
        if (o.counts.in_progress) { b.hidden = false; b.innerHTML = `<span class="dot"></span>${o.counts.in_progress}`; }
      });
    },

    /* ---------------- Exports (FR-18) ---------------- */
    exportExcel(filename, sheets) {
      // sheets: { 'Sheet name': [ {col: value, ...}, ... ] }
      if (!window.XLSX) { UI.toast('Excel library failed to load — check your internet connection.', 'danger'); return; }
      const wb = XLSX.utils.book_new();
      Object.entries(sheets).forEach(([name, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name.slice(0, 31)));
      XLSX.writeFile(wb, filename);
    },

    // Sets Chart.js defaults to match the theme (call once on pages with charts)
    chartDefaults() {
      if (!window.Chart) return;
      Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
      Chart.defaults.font.size = 11;
      Chart.defaults.color = '#6b7280';
      Chart.defaults.borderColor = '#eef0f4';
      Chart.defaults.plugins.legend.labels.boxWidth = 10;
      Chart.defaults.plugins.legend.labels.boxHeight = 10;
      Chart.defaults.plugins.tooltip.backgroundColor = '#1e1b4b';
      Chart.defaults.plugins.tooltip.padding = 10;
      Chart.defaults.plugins.tooltip.cornerRadius = 8;
    },
    COLORS: { primary: '#4f46e5', primarySoft: '#c7cbfe', violet: '#7c3aed', success: '#16a34a', danger: '#dc2626', warning: '#d97706', neutral: '#94a3b8' }
  };

  window.UI = UI;
})();
