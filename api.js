/**
 * Flare Maintenance App — JSON API Client for Google Apps Script Web App
 */

window.FLARE_API = {
  getBaseUrl() {
    return (window.FLARE_CONFIG && window.FLARE_CONFIG.APP_SCRIPT_URL || '').trim();
  },

  isConfigured() {
    return this.getBaseUrl().length > 0;
  },

  getToken() {
    return localStorage.getItem('flare_session_token') || '';
  },

  setSession(session) {
    if (session && session.token) {
      localStorage.setItem('flare_session_token', session.token);
      localStorage.setItem('flare_session_user', JSON.stringify(session));
    }
  },

  getCachedSession() {
    try {
      const raw = localStorage.getItem('flare_session_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  clearSession() {
    localStorage.removeItem('flare_session_token');
    localStorage.removeItem('flare_session_user');
    this.cacheClear();
  },

  // --- Small local cache so screens appear instantly and refresh in the background ---
  cacheGet(key) {
    try { const raw = localStorage.getItem('flare_cache_' + key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  },
  cacheSet(key, value) {
    try { localStorage.setItem('flare_cache_' + key, JSON.stringify(value)); } catch (e) { /* storage full or blocked: ignore */ }
  },
  cacheClear() {
    try {
      Object.keys(localStorage).filter((k) => k.indexOf('flare_cache_') === 0 && k !== 'flare_cache_loginUsers').forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
  },

  _pending: 0,
  _busy(delta) {
    this._pending = Math.max(0, this._pending + delta);
    const bar = document.getElementById('net-bar');
    if (bar) bar.classList.toggle('on', this._pending > 0);
  },

  async call(action, payload = {}) {
    const url = this.getBaseUrl();
    if (!url) {
      throw new Error('SETUP_URL_MISSING');
    }

    this._busy(1);
    try {
      return await this._send(url, action, payload);
    } finally {
      this._busy(-1);
    }
  },

  async _send(url, action, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action,
        payload,
        token: this.getToken()
      })
    });

    if (!res.ok) {
      throw new Error('HTTP_' + res.status);
    }

    const json = await res.json();
    if (!json.ok) {
      if (json.error === 'UNAUTHORIZED' || json.error === 'SESSION_EXPIRED') {
        this.clearSession();
      }
      throw new Error(json.error || 'UNKNOWN_ERROR');
    }
    return json.data;
  }
};
