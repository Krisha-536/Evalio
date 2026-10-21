/* ==========================================================================
   Evalio — session handling, role-based access and single-device login
   ========================================================================== */
(function () {
  const KEY = 'evalio.v2.session';
  const DEVICES = 'evalio.v2.device_tokens'; // one live token per user → single-device login

  const readJSON = (store, key) => { try { return JSON.parse(store.getItem(key)); } catch (e) { return null; } };
  const userKey = (s) => `${s.role}:${s.id}`;
  const token = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  // Pages live in /student and /admin; login.html is at the root
  const root = () => (/\/(student|admin)\//.test(location.pathname) ? '../' : '');

  const Auth = {
    get() {
      // Ignore anything under this key that this app did not write (e.g. an older build)
      const valid = (s) => s && s.token && s.id != null && (s.role === 'student' || s.role === 'admin') ? s : null;
      return valid(readJSON(sessionStorage, KEY)) || valid(readJSON(localStorage, KEY));
    },

    start(session, remember) {
      session.token = token();
      const tokens = readJSON(localStorage, DEVICES) || {};
      tokens[userKey(session)] = session.token; // any older session for this user is now invalid
      localStorage.setItem(DEVICES, JSON.stringify(tokens));
      (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session));
      return session;
    },

    clear() {
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
    },

    async logout() {
      const s = Auth.get();
      Auth.clear();
      try { await Api.logout(s); } catch (e) { /* ignore */ }
      location.href = root() + 'login.html';
    },

    isCurrentDevice(s) {
      const tokens = readJSON(localStorage, DEVICES) || {};
      return tokens[userKey(s)] === s.token;
    },

    homeFor(role) {
      return root() + (role === 'admin' ? 'admin/dashboard.html' : 'student/dashboard.html');
    },

    // Call at the top of every protected page: Auth.require('student')
    require(role) {
      const s = Auth.get();
      if (!s) { location.replace(root() + 'login.html?next=' + encodeURIComponent(location.pathname + location.search)); throw new Error('redirect'); }
      if (s.role !== role) { location.replace(Auth.homeFor(s.role)); throw new Error('redirect'); }
      if (!Auth.isCurrentDevice(s)) { Auth.clear(); location.replace(root() + 'login.html?reason=device'); throw new Error('redirect'); }
      window.addEventListener('storage', (e) => {
        if (e.key === DEVICES && !Auth.isCurrentDevice(s)) { Auth.clear(); location.replace(root() + 'login.html?reason=device'); }
      });
      return s;
    }
  };

  window.Auth = Auth;
})();
