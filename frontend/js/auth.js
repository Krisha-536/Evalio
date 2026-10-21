/* ==========================================================================
   Evalio — session handling and role-based access
   --------------------------------------------------------------------------
   TODO (backend): single-device login (SRS 7.8 / Features › Security).
   Enforce it on the server once the real backend exists — store one active
   session token per user, invalidate older ones on every new login, check it
   in every API call, and push a "signed out elsewhere" event (e.g. Supabase
   Realtime) so the old tab redirects to login.html. Not done in the frontend
   mock because a browser-only version is unreliable across devices.
   ========================================================================== */
(function () {
  const KEY = 'evalio.v2.session';

  const readJSON = (store, key) => { try { return JSON.parse(store.getItem(key)); } catch (e) { return null; } };
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

    homeFor(role) {
      return root() + (role === 'admin' ? 'admin/dashboard.html' : 'student/dashboard.html');
    },

    // Call at the top of every protected page: Auth.require('student')
    require(role) {
      const s = Auth.get();
      if (!s) { location.replace(root() + 'login.html?next=' + encodeURIComponent(location.pathname + location.search)); throw new Error('redirect'); }
      if (s.role !== role) { location.replace(Auth.homeFor(s.role)); throw new Error('redirect'); }
      return s;
    }
  };

  window.Auth = Auth;
})();
