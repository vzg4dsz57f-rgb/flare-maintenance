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
  },

  async call(action, payload = {}) {
    const url = this.getBaseUrl();
    if (!url) {
      throw new Error('SETUP_URL_MISSING');
    }

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
