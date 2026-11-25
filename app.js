/**
 * Flare Maintenance App — Main PWA Controller (Step 3: Full Request Lifecycle)
 */

(function () {
  const I18N = window.FLARE_I18N;
  const API = window.FLARE_API;
  const FILES = window.FLARE_FILES;

  const WORKFLOW_ORDER = [
    'New', 'Under Review', 'Assigned', 'Inspection',
    'Quotation Submitted', 'GS Review', 'Owner Approval',
    'In Progress', 'Completed', 'Confirmed', 'Closed'
  ];

  const state = {
    session: API.getCachedSession(),
    loginUsers: [],
    selectedLoginUserId: '',
    pinBuffer: '',
    route: 'home', // 'home' | 'requests' | 'new' | 'detail'
    selectedRequestId: null,
    homeTab: 'inbox', // 'inbox' | 'all' | 'paid'
    requests: [],
    actionRequiredCount: 0,
    meta: { branches: [], categories: [], technicians: [] },
    currentDetail: null,
    filters: {
      search: '',
      branchId: '',
      status: '',
      categoryId: '',
      techId: '',
      priority: '',
      paymentStatus: '',
      dateFrom: '',
      dateTo: ''
    },
    newReqDraft: {
      branchId: '',
      categoryId: '',
      equipmentType: '',
      equipmentCode: '',
      priority: 'Normal',
      description: '',
      photos: []
    },
    busy: false
  };

  // --- Utilities ---
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(msg, ms = 3000) {
    const el = document.getElementById('toast-root');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function statusClass(status) {
    return 'badge-' + String(status || '').toLowerCase().replace(/\s+/g, '-');
  }

  function prioClass(prio) {
    return 'prio-' + String(prio || 'normal').toLowerCase();
  }

  function payClass(payStatus) {
    return 'pay-' + String(payStatus || 'not-required').toLowerCase().replace(/\s+/g, '-');
  }

  function formatDateShort(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(I18N.lang === 'ar' ? 'ar-KW' : 'en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function formatKwd(val) {
    if (val === null || val === undefined || val === '') return '—';
    return Number(val).toFixed(3) + ' KWD';
  }

  function getUserDisplayName(userObj) {
    if (!userObj) return '';
    return I18N.lang === 'ar' ? (userObj.nameAr || userObj.nameEn) : (userObj.nameEn || userObj.nameAr);
  }

  function getOpenedByLabel(req) {
    const name = I18N.lang === 'ar' ? (req.createdByNameAr || req.createdByNameEn) : (req.createdByNameEn || req.createdByNameAr);
    const roleLabel = I18N.tMap('jobTitles', req.createdByRoleLabel) !== req.createdByRoleLabel
      ? I18N.tMap('jobTitles', req.createdByRoleLabel)
      : I18N.tMap('roles', req.createdByRoleLabel);
    return `${name} (${roleLabel})`;
  }

  // --- Modal System ---
  function openModal(htmlContent) {
    const modal = document.getElementById('modal-root');
    modal.innerHTML = `<div class="modal-card" onclick="event.stopPropagation()">${htmlContent}</div>`;
    modal.classList.remove('hidden');
    modal.onclick = () => closeModal();
  }

  function openLightbox(src) {
    const modal = document.getElementById('modal-root');
    modal.innerHTML = `<img src="${esc(src)}" class="lightbox-img" referrerpolicy="no-referrer" onclick="event.stopPropagation()" />`;
    modal.classList.remove('hidden');
    modal.onclick = () => closeModal();
  }

  function closeModal() {
    const modal = document.getElementById('modal-root');
    modal.classList.add('hidden');
    modal.innerHTML = '';
  }

  // --- Topbar & Bottom Nav ---
  function renderChrome() {
    const topTitle = document.getElementById('topbar-title');
    const topSub = document.getElementById('topbar-sub');
    const btnLang = document.getElementById('btn-lang-toggle');
    const btnLogout = document.getElementById('btn-logout');
    const btnCounter = document.getElementById('btn-action-counter');
    const lblNeedsAction = document.getElementById('lbl-needs-action');
    const counterNum = document.getElementById('action-counter-num');
    const nav = document.getElementById('bottom-nav');

    btnLang.textContent = I18N.t('langSwitch');
    btnLogout.textContent = I18N.t('logout');
    lblNeedsAction.textContent = I18N.t('needsAction');

    if (!state.session) {
      topTitle.textContent = I18N.t('appTitle');
      topSub.textContent = I18N.t('appSub');
      btnLogout.classList.add('hidden');
      btnCounter.classList.add('hidden');
      nav.classList.add('hidden');
      return;
    }

    topTitle.textContent = getUserDisplayName(state.session);
    let sub = I18N.tMap('roles', state.session.role);
    if (state.session.role === 'Branch Responsible' && state.session.branches && state.session.branches.length > 0) {
      const bNames = state.session.branches.map((b) => I18N.localizedName(b)).join(' · ');
      const jt = state.session.jobTitle ? ` (${I18N.tMap('jobTitles', state.session.jobTitle)})` : '';
      sub = `${bNames}${jt}`;
    }
    topSub.textContent = sub;

    btnLogout.classList.remove('hidden');
    btnCounter.classList.remove('hidden');
    counterNum.textContent = String(state.actionRequiredCount || 0);
    btnCounter.onclick = () => {
      state.homeTab = 'inbox';
      navigate('home');
    };

    const role = state.session.role;
    const navItems = [
      { id: 'home', icon: '🏠', label: I18N.t('home') },
      { id: 'requests', icon: '📋', label: I18N.t('requests') }
    ];
    if (role === 'GS Manager' || role === 'Owner') {
      navItems.push({ id: 'dashboard', icon: '📊', label: I18N.t('dashboard') });
    }
    if (role === 'GS Manager' || role === 'Owner' || role === 'Finance') {
      navItems.push({ id: 'reports', icon: '📑', label: I18N.t('reports') });
    }
    if (role === 'GS Manager') {
      navItems.push({ id: 'admin', icon: '⚙️', label: I18N.t('admin') });
    }

    nav.innerHTML = navItems.map((item) => `
      <button type="button" class="nav-item ${state.route === item.id ? 'active' : ''} ${item.disabled ? 'disabled-phase' : ''}" data-nav="${item.id}" data-disabled="${item.disabled ? '1' : '0'}">
        <span>${item.icon}</span>
        <span>${esc(item.label)}</span>
      </button>
    `).join('');
    nav.classList.remove('hidden');

    nav.querySelectorAll('.nav-item').forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.disabled === '1') {
          showToast(I18N.t('phase4Soon'));
          return;
        }
        navigate(btn.dataset.nav);
      };
    });
  }

  // --- Data Loaders ---
  async function loadLoginUsers() {
    if (!API.isConfigured()) return;
    try {
      const data = await API.call('loginUsers', {});
      state.loginUsers = data.users || [];
    } catch (e) {
      showToast(I18N.formatError(e.message));
    }
  }

  async function refreshRequests() {
    if (!state.session) return;
    try {
      const data = await API.call('listRequests', { filters: state.route === 'requests' ? state.filters : {} });
      state.requests = data.requests || [];
      state.actionRequiredCount = data.actionRequiredCount || 0;
      state.meta = data.meta || { branches: [], categories: [], technicians: [] };
      renderChrome();
    } catch (e) {
      if (e.message === 'UNAUTHORIZED' || e.message === 'SESSION_EXPIRED') {
        state.session = null;
        render();
      }
      showToast(I18N.formatError(e.message));
    }
  }

  async function loadDetail(requestId) {
    try {
      const data = await API.call('getRequestDetail', { requestId });
      state.currentDetail = data;
      render();
    } catch (e) {
      showToast(I18N.formatError(e.message));
    }
  }

  // --- Navigation ---
  function navigate(route, params = {}) {
    state.route = route;
    if (route === 'detail' && params.requestId) {
      state.selectedRequestId = params.requestId;
      state.currentDetail = null;
      window.location.hash = '#/request/' + params.requestId;
      render();
      loadDetail(params.requestId);
      return;
    }
    if (route === 'new') {
      initNewRequestDraft();
    }
    if (route === 'dashboard' || route === 'reports' || route === 'admin') {
      window.location.hash = '#/' + route;
      render();
      if (window.FLARE_EXT) window.FLARE_EXT.load(route);
      return;
    }
    if (route === 'home' || route === 'requests') {
      window.location.hash = '#/' + route;
      render();
      refreshRequests().then(render);
      return;
    }
    render();
  }

  function initNewRequestDraft() {
    const branches = state.meta.branches || [];
    const categories = state.meta.categories || [];
    state.newReqDraft = {
      branchId: branches.length === 1 ? branches[0].branchId : '',
      categoryId: categories.length > 0 ? categories[0].categoryId : '',
      equipmentType: '',
      equipmentCode: '',
      priority: 'Normal',
      description: '',
      photos: []
    };
  }

  // --- Views ---
  function renderLogin() {
    const root = document.getElementById('app-root');
    const configured = API.isConfigured();
    const selectedUser = state.loginUsers.find((u) => u.userId === state.selectedLoginUserId);

    const userOptions = state.loginUsers.map((u) => {
      const roleLabel = I18N.tMap('roles', u.role);
      const branchNames = (u.branches || []).map((b) => I18N.localizedName(b)).join(', ');
      const suffix = branchNames ? ` — ${roleLabel} (${branchNames})` : ` — ${roleLabel}`;
      return `<option value="${esc(u.userId)}" ${u.userId === state.selectedLoginUserId ? 'selected' : ''}>${esc(getUserDisplayName(u) + suffix)}</option>`;
    }).join('');

    const dots = [0, 1, 2, 3, 4, 5].map((idx) =>
      `<span class="pin-dot ${idx < state.pinBuffer.length ? 'filled' : ''}"></span>`
    ).join('');

    root.innerHTML = `
      <div class="login-wrap">
        <div class="card">
          <h2 class="card-title">${esc(I18N.t('loginTitle'))}</h2>
          ${!configured ? `<div class="alert alert-warning">${esc(I18N.t('setupUrlMissing'))}</div>` : ''}
          <div class="form-group">
            <label class="form-label">${esc(I18N.t('selectUser'))}</label>
            <select id="login-user-select" class="form-control">
              <option value="">${esc(I18N.t('chooseUserOption'))}</option>
              ${userOptions}
            </select>
          </div>
          ${selectedUser && !selectedUser.hasPin ? `<div class="alert alert-danger">${esc(I18N.t('pinNotSetWarning'))}</div>` : ''}
          <div class="form-group">
            <label class="form-label" style="text-align:center;">${esc(I18N.t('enterPin'))}</label>
            <div class="pin-dots">${dots}</div>
            <div class="keypad">
              ${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) =>
                `<button type="button" class="key-btn" data-key="${k}">${k}</button>`
              ).join('')}
            </div>
          </div>
          <button id="btn-do-login" type="button" class="btn btn-primary btn-block" ${state.busy || !configured ? 'disabled' : ''}>
            ${state.busy ? esc(I18N.t('loading')) : esc(I18N.t('signIn'))}
          </button>
        </div>
      </div>
    `;

    const sel = document.getElementById('login-user-select');
    sel.onchange = () => {
      state.selectedLoginUserId = sel.value;
      renderLogin();
    };

    root.querySelectorAll('.key-btn').forEach((btn) => {
      btn.onclick = () => {
        const k = btn.dataset.key;
        if (k === 'C') state.pinBuffer = '';
        else if (k === '⌫') state.pinBuffer = state.pinBuffer.slice(0, -1);
        else if (state.pinBuffer.length < 8) state.pinBuffer += k;
        renderLogin();
      };
    });

    document.getElementById('btn-do-login').onclick = submitLogin;
  }

  async function submitLogin() {
    if (!state.selectedLoginUserId || !state.pinBuffer) {
      showToast(I18N.formatError('CREDENTIALS_REQUIRED'));
      return;
    }
    state.busy = true;
    renderLogin();
    try {
      const data = await API.call('login', {
        userId: state.selectedLoginUserId,
        pin: state.pinBuffer
      });
      state.session = data.session;
      API.setSession(data.session);
      state.pinBuffer = '';
      if (data.session.preferredLang) {
        I18N.setLanguage(data.session.preferredLang);
      }
      state.homeTab = 'inbox';
      navigate('home');
    } catch (e) {
      state.pinBuffer = '';
      showToast(I18N.formatError(e.message), 4000);
    } finally {
      state.busy = false;
      render();
    }
  }

  function renderRequestCard(req) {
    const branchName = I18N.localizedName(req.branch);
    const catName = I18N.localizedName(req.category);
    const eqInfo = req.equipmentType ? ` · ${req.equipmentType}${req.equipmentCode ? ' #' + req.equipmentCode : ''}` : '';
    const techsStr = (req.assignedTechs && req.assignedTechs.length > 0)
      ? req.assignedTechs.map((t) => getUserDisplayName(t)).join(', ')
      : I18N.t('notAssigned');

    return `
      <div class="req-card ${req.needsMyAction ? 'needs-action' : ''}" data-req-id="${esc(req.requestId)}">
        <div class="req-card-top">
          <span class="req-id">${esc(req.requestId)}</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <span class="badge ${prioClass(req.priority)}">${esc(I18N.tMap('priorities', req.priority))}</span>
            <span class="badge ${statusClass(req.status)}">${esc(I18N.tMap('statuses', req.status))}</span>
          </div>
        </div>
        <div style="font-weight:700;font-size:14.5px;margin-bottom:4px;">
          ${esc(branchName)} · ${esc(catName)}${esc(eqInfo)}
        </div>
        <div style="font-size:13.5px;color:#334155;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
          ${esc(req.description)}
        </div>
        <div class="req-meta">
          <span>👤 ${esc(getOpenedByLabel(req))}</span>
          <span>🔧 ${esc(techsStr)}</span>
          ${req.paymentStatus && req.paymentStatus !== 'Not Required' ? `<span class="badge ${payClass(req.paymentStatus)}">${esc(I18N.tMap('paymentStatuses', req.paymentStatus))}</span>` : ''}
          ${req.isOverdue ? `<span class="badge prio-safety">⏰ ${esc(I18N.t('overdueBadge'))}</span>` : ''}
        </div>
      </div>
    `;
  }

  function bindRequestCards(container) {
    container.querySelectorAll('.req-card').forEach((card) => {
      card.onclick = () => navigate('detail', { requestId: card.dataset.reqId });
    });
  }

  function renderHome() {
    const root = document.getElementById('app-root');
    const role = state.session.role;
    const all = state.requests || [];
    const openReqs = all.filter((r) => !['Closed', 'Cancelled', 'Rejected'].includes(r.status));
    const overdueReqs = all.filter((r) => r.isOverdue);

    let listToShow = all;
    let tabsHtml = '';

    if (role === 'Branch Responsible') {
      const confirmReqs = all.filter((r) => r.status === 'Completed');
      listToShow = state.homeTab === 'inbox' ? confirmReqs : all;
      tabsHtml = `
        <button id="btn-home-new" class="btn btn-primary btn-block btn-big-cta" style="margin-bottom:14px;">
          ${esc(I18N.t('newRequestBtn'))}
        </button>
        <div class="tabs">
          <button class="tab-btn ${state.homeTab === 'inbox' ? 'active' : ''}" data-tab="inbox">${esc(I18N.t('needsConfirmTab'))} (${confirmReqs.length})</button>
          <button class="tab-btn ${state.homeTab === 'all' ? 'active' : ''}" data-tab="all">${esc(I18N.t('allRequestsTab'))} (${all.length})</button>
        </div>
      `;
    } else if (role === 'GS Manager') {
      const inboxReqs = all.filter((r) => r.needsMyAction);
      listToShow = state.homeTab === 'inbox' ? inboxReqs : all;
      tabsHtml = `
        <div class="kpi-grid">
          <div class="kpi-box"><div class="kpi-val">${inboxReqs.length}</div><div class="kpi-lbl">${esc(I18N.t('inboxTab'))}</div></div>
          <div class="kpi-box"><div class="kpi-val" style="color:var(--danger);">${overdueReqs.length}</div><div class="kpi-lbl">${esc(I18N.t('overdueCount'))}</div></div>
          <div class="kpi-box"><div class="kpi-val">${openReqs.length}</div><div class="kpi-lbl">${esc(I18N.t('openCount'))}</div></div>
        </div>
        <button id="btn-home-new" class="btn btn-outline btn-block" style="margin-bottom:12px;">
          ${esc(I18N.t('newRequestBtn'))}
        </button>
        <div class="tabs">
          <button class="tab-btn ${state.homeTab === 'inbox' ? 'active' : ''}" data-tab="inbox">${esc(I18N.t('inboxTab'))} (${inboxReqs.length})</button>
          <button class="tab-btn ${state.homeTab === 'all' ? 'active' : ''}" data-tab="all">${esc(I18N.t('allRequestsTab'))} (${all.length})</button>
        </div>
      `;
    } else if (role === 'Technician') {
      const myAction = all.filter((r) => r.needsMyAction);
      listToShow = state.homeTab === 'inbox' ? myAction : all;
      tabsHtml = `
        <div class="tabs">
          <button class="tab-btn ${state.homeTab === 'inbox' ? 'active' : ''}" data-tab="inbox">${esc(I18N.t('myTasksTab'))} (${myAction.length})</button>
          <button class="tab-btn ${state.homeTab === 'all' ? 'active' : ''}" data-tab="all">${esc(I18N.t('allRequestsTab'))} (${all.length})</button>
        </div>
      `;
    } else if (role === 'Owner') {
      const pending = all.filter((r) => r.status === 'Owner Approval');
      listToShow = state.homeTab === 'inbox' ? pending : all;
      tabsHtml = `
        <div class="tabs">
          <button class="tab-btn ${state.homeTab === 'inbox' ? 'active' : ''}" data-tab="inbox">${esc(I18N.t('ownerPendingTab'))} (${pending.length})</button>
          <button class="tab-btn ${state.homeTab === 'all' ? 'active' : ''}" data-tab="all">${esc(I18N.t('allRequestsTab'))} (${all.length})</button>
        </div>
      `;
    } else if (role === 'Finance') {
      const pendingPay = all.filter((r) => r.paymentStatus === 'Pending');
      const paidPay = all.filter((r) => r.paymentStatus === 'Paid');
      listToShow = state.homeTab === 'paid' ? paidPay : pendingPay;
      tabsHtml = `
        <div class="tabs">
          <button class="tab-btn ${state.homeTab !== 'paid' ? 'active' : ''}" data-tab="inbox">${esc(I18N.t('financePendingTab'))} (${pendingPay.length})</button>
          <button class="tab-btn ${state.homeTab === 'paid' ? 'active' : ''}" data-tab="paid">${esc(I18N.t('financePaidTab'))} (${paidPay.length})</button>
        </div>
      `;
    }

    root.innerHTML = `
      ${tabsHtml}
      <div id="home-list">
        ${listToShow.length ? listToShow.map(renderRequestCard).join('') : `<div class="card" style="text-align:center;color:var(--text-muted);">${esc(I18N.t('noRequests'))}</div>`}
      </div>
    `;

    const newBtn = document.getElementById('btn-home-new');
    if (newBtn) newBtn.onclick = () => navigate('new');

    root.querySelectorAll('.tab-btn').forEach((tb) => {
      tb.onclick = () => {
        state.homeTab = tb.dataset.tab;
        renderHome();
      };
    });
    bindRequestCards(root);
  }

  function renderNewRequest() {
    const root = document.getElementById('app-root');
    const draft = state.newReqDraft;
    const branches = state.meta.branches || [];
    const categories = state.meta.categories || [];
    const selCat = categories.find((c) => c.categoryId === draft.categoryId);

    root.innerHTML = `
      <div style="margin-bottom:12px;">
        <button id="btn-back-home" class="btn btn-outline btn-sm" type="button">← ${esc(I18N.t('back'))}</button>
      </div>
      <div class="card">
        <h2 class="card-title">${esc(I18N.t('newRequestBtn'))}</h2>

        <div class="form-group">
          <label class="form-label">${esc(I18N.t('branch'))}</label>
          <select id="nr-branch" class="form-control" ${branches.length === 1 ? 'disabled' : ''}>
            <option value="">--</option>
            ${branches.map((b) => `<option value="${esc(b.branchId)}" ${draft.branchId === b.branchId ? 'selected' : ''}>${esc(I18N.localizedName(b))}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">${esc(I18N.t('category'))}</label>
          <select id="nr-category" class="form-control">
            ${categories.map((c) => `<option value="${esc(c.categoryId)}" ${draft.categoryId === c.categoryId ? 'selected' : ''}>${esc(I18N.localizedName(c))}</option>`).join('')}
          </select>
        </div>

        ${selCat && selCat.hasEquipmentSubfields ? `
          <div class="card" style="background:var(--surface-alt);">
            <div class="form-group">
              <label class="form-label">${esc(I18N.t('equipmentType'))}</label>
              <div class="pill-group">
                ${['Rower', 'Ski Erg', 'Bike', 'Other'].map((eq) => `
                  <button type="button" class="pill-option ${draft.equipmentType === eq ? 'selected' : ''}" data-eq="${eq}">${esc(eq)}</button>
                `).join('')}
              </div>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">${esc(I18N.t('equipmentCode'))}</label>
              <input id="nr-eq-code" class="form-control" value="${esc(draft.equipmentCode)}" placeholder="e.g. Rower-04" />
            </div>
          </div>
        ` : ''}

        <div class="form-group">
          <label class="form-label">${esc(I18N.t('priority'))}</label>
          <div class="pill-group">
            ${['Low', 'Normal', 'Urgent', 'Safety'].map((pr) => `
              <button type="button" class="pill-option ${draft.priority === pr ? 'selected' : ''}" data-prio="${pr}">${esc(I18N.tMap('priorities', pr))}</button>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${esc(I18N.t('description'))}</label>
          <textarea id="nr-desc" class="form-control">${esc(draft.description)}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">${esc(I18N.t('beforePhotos'))}</label>
          <label class="btn btn-outline btn-block" style="cursor:pointer;">
            ${esc(I18N.t('pickCameraGallery'))}
            <input id="nr-photos-input" type="file" accept="image/*" multiple style="display:none;" />
          </label>
          <div id="nr-photo-grid" class="photo-grid">
            ${draft.photos.map((p, idx) => `
              <div class="photo-thumb-wrap">
                <img src="${esc(p.previewUrl)}" alt="photo" />
                <button type="button" class="photo-remove-btn" data-rm-photo="${idx}">×</button>
              </div>
            `).join('')}
          </div>
        </div>

        <button id="btn-submit-new-req" type="button" class="btn btn-primary btn-block btn-big-cta" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? esc(I18N.t('loading')) : esc(I18N.t('submitRequest'))}
        </button>
      </div>
    `;

    document.getElementById('btn-back-home').onclick = () => navigate('home');
    document.getElementById('nr-branch').onchange = (e) => { draft.branchId = e.target.value; };
    document.getElementById('nr-category').onchange = (e) => { draft.categoryId = e.target.value; renderNewRequest(); };
    const eqInput = document.getElementById('nr-eq-code');
    if (eqInput) eqInput.oninput = (e) => { draft.equipmentCode = e.target.value; };
    document.getElementById('nr-desc').oninput = (e) => { draft.description = e.target.value; };

    root.querySelectorAll('[data-eq]').forEach((b) => {
      b.onclick = () => { draft.equipmentType = b.dataset.eq; renderNewRequest(); };
    });
    root.querySelectorAll('[data-prio]').forEach((b) => {
      b.onclick = () => { draft.priority = b.dataset.prio; renderNewRequest(); };
    });
    root.querySelectorAll('[data-rm-photo]').forEach((b) => {
      b.onclick = () => { draft.photos.splice(Number(b.dataset.rmPhoto), 1); renderNewRequest(); };
    });

    document.getElementById('nr-photos-input').onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      showToast(I18N.t('compressingImg'));
      for (const f of files) {
        if (draft.photos.length >= 5) break;
        const compressed = await FILES.compressImage(f);
        draft.photos.push(compressed);
      }
      renderNewRequest();
    };

    document.getElementById('btn-submit-new-req').onclick = async () => {
      if (state.busy) return;
      state.busy = true;
      renderNewRequest();
      try {
        const res = await API.call('createRequest', {
          branchId: draft.branchId,
          categoryId: draft.categoryId,
          equipmentType: draft.equipmentType,
          equipmentCode: draft.equipmentCode,
          priority: draft.priority,
          description: draft.description,
          photos: draft.photos.map((p) => ({
            fileName: p.fileName,
            mimeType: p.mimeType,
            base64Data: p.base64Data
          }))
        });
        showToast(I18N.t('requestSent') + ' ' + res.requestId, 4000);
        navigate('detail', { requestId: res.requestId });
      } catch (e) {
        showToast(I18N.formatError(e.message), 4000);
      } finally {
        state.busy = false;
        render();
      }
    };
  }

  function renderRequestsList() {
    const root = document.getElementById('app-root');
    const f = state.filters;
    const branches = state.meta.branches || [];
    const categories = state.meta.categories || [];
    const techs = state.meta.technicians || [];

    root.innerHTML = `
      <div class="card">
        <div class="form-group">
          <input id="flt-search" class="form-control" value="${esc(f.search)}" placeholder="${esc(I18N.t('searchPlaceholder'))}" />
        </div>
        <div class="filters-grid">
          <select id="flt-branch" class="form-control">
            <option value="">${esc(I18N.t('allBranches'))}</option>
            ${branches.map((b) => `<option value="${esc(b.branchId)}" ${f.branchId === b.branchId ? 'selected' : ''}>${esc(I18N.localizedName(b))}</option>`).join('')}
          </select>
          <select id="flt-status" class="form-control">
            <option value="">${esc(I18N.t('allStatuses'))}</option>
            ${Object.keys(I18N.dict.en.statuses).map((st) => `<option value="${esc(st)}" ${f.status === st ? 'selected' : ''}>${esc(I18N.tMap('statuses', st))}</option>`).join('')}
          </select>
          <select id="flt-category" class="form-control">
            <option value="">${esc(I18N.t('allCategories'))}</option>
            ${categories.map((c) => `<option value="${esc(c.categoryId)}" ${f.categoryId === c.categoryId ? 'selected' : ''}>${esc(I18N.localizedName(c))}</option>`).join('')}
          </select>
          <select id="flt-tech" class="form-control">
            <option value="">${esc(I18N.t('allTechs'))}</option>
            ${techs.map((t) => `<option value="${esc(t.userId)}" ${f.techId === t.userId ? 'selected' : ''}>${esc(getUserDisplayName(t))}</option>`).join('')}
          </select>
          <select id="flt-priority" class="form-control">
            <option value="">${esc(I18N.t('allPriorities'))}</option>
            ${['Low', 'Normal', 'Urgent', 'Safety'].map((p) => `<option value="${p}" ${f.priority === p ? 'selected' : ''}>${esc(I18N.tMap('priorities', p))}</option>`).join('')}
          </select>
          <select id="flt-pay" class="form-control">
            <option value="">${esc(I18N.t('allPaymentStatuses'))}</option>
            ${['Not Required', 'Pending', 'Paid'].map((ps) => `<option value="${ps}" ${f.paymentStatus === ps ? 'selected' : ''}>${esc(I18N.tMap('paymentStatuses', ps))}</option>`).join('')}
          </select>
          <input id="flt-from" type="date" class="form-control" value="${esc(f.dateFrom)}" title="${esc(I18N.t('dateFrom'))}" />
          <input id="flt-to" type="date" class="form-control" value="${esc(f.dateTo)}" title="${esc(I18N.t('dateTo'))}" />
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;">
          <button id="btn-apply-filters" class="btn btn-navy btn-sm" type="button">🔍 ${esc(I18N.t('requests'))}</button>
          <button id="btn-clear-filters" class="btn btn-outline btn-sm" type="button">${esc(I18N.t('clearFilters'))}</button>
        </div>
      </div>
      <div>
        ${(state.requests || []).length ? state.requests.map(renderRequestCard).join('') : `<div class="card" style="text-align:center;color:var(--text-muted);">${esc(I18N.t('noRequests'))}</div>`}
      </div>
    `;

    const syncFilter = (id, key, autoRefresh) => {
      document.getElementById(id).onchange = (e) => {
        state.filters[key] = e.target.value;
        if (autoRefresh) refreshRequests().then(renderRequestsList);
      };
    };
    document.getElementById('flt-search').oninput = (e) => { state.filters.search = e.target.value; };
    syncFilter('flt-branch', 'branchId', true);
    syncFilter('flt-status', 'status', true);
    syncFilter('flt-category', 'categoryId', true);
    syncFilter('flt-tech', 'techId', true);
    syncFilter('flt-priority', 'priority', true);
    syncFilter('flt-pay', 'paymentStatus', true);
    syncFilter('flt-from', 'dateFrom', true);
    syncFilter('flt-to', 'dateTo', true);

    document.getElementById('btn-apply-filters').onclick = () => refreshRequests().then(renderRequestsList);
    document.getElementById('btn-clear-filters').onclick = () => {
      state.filters = { search: '', branchId: '', status: '', categoryId: '', techId: '', priority: '', paymentStatus: '', dateFrom: '', dateTo: '' };
      refreshRequests().then(renderRequestsList);
    };
    bindRequestCards(root);
  }

  // --- Request Details & Actions ---
  async function execTransition(payload) {
    if (state.busy) return;
    state.busy = true;
    try {
      const updated = await API.call('transitionRequest', Object.assign({ requestId: state.selectedRequestId }, payload));
      state.currentDetail = updated;
      closeModal();
      showToast(I18N.t('actionDone'));
      render();
      refreshRequests();
    } catch (e) {
      showToast(I18N.formatError(e.message), 4000);
    } finally {
      state.busy = false;
    }
  }

  function renderDetail() {
    const root = document.getElementById('app-root');
    if (!state.currentDetail) {
      root.innerHTML = `<div class="card" style="text-align:center;">${esc(I18N.t('loading'))}</div>`;
      return;
    }

    const detail = state.currentDetail;
    const req = detail.request;
    const quotes = detail.quotations || [];
    const timeline = detail.timeline || [];
    const role = state.session.role;
    const isGS = role === 'GS Manager';
    const isAssignedTech = role === 'Technician' && (req.assignedTechIds || []).includes(state.session.userId);
    const isBranchResp = role === 'Branch Responsible' && (state.session.branchIds || []).includes(req.branchId);
    const isOwner = role === 'Owner';
    const isFinance = role === 'Finance';

    const techsText = (req.assignedTechs && req.assignedTechs.length)
      ? req.assignedTechs.map((t) => getUserDisplayName(t)).join(', ')
      : I18N.t('notAssigned');

    // Build Role & State Action Buttons
    const actions = [];
    if (isGS && req.status === 'New') {
      actions.push(`<button class="btn btn-navy" data-act="startReview">${esc(I18N.t('startReviewBtn'))}</button>`);
    }
    if (isGS && ['New', 'Under Review', 'Assigned'].includes(req.status)) {
      actions.push(`<button class="btn btn-primary" data-act="assignTechs">${esc(I18N.t('assignTechsBtn'))}</button>`);
    }
    if ((isAssignedTech || isGS) && req.status === 'Assigned') {
      actions.push(`<button class="btn btn-primary" data-act="startInspection">${esc(I18N.t('startInspectionBtn'))}</button>`);
    }
    if ((isAssignedTech || isGS) && ['Assigned', 'Inspection'].includes(req.status)) {
      actions.push(`<button class="btn btn-success" data-act="internalRepair">${esc(I18N.t('internalRepairBtn'))}</button>`);
      actions.push(`<button class="btn btn-outline" data-act="saveInspection">${esc(I18N.t('saveInspectionBtn'))}</button>`);
    }
    if ((isAssignedTech || isGS) && ['Assigned', 'Inspection', 'Quotation Submitted'].includes(req.status) && quotes.length < 5) {
      actions.push(`<button class="btn btn-navy" data-act="addQuotation">${esc(I18N.t('addQuotationBtn'))}</button>`);
    }
    if ((isAssignedTech || isGS) && req.status === 'Quotation Submitted' && quotes.length > 0) {
      actions.push(`<button class="btn btn-primary" data-act="sendToGsReview">${esc(I18N.t('sendToGsReviewBtn'))}</button>`);
    }
    if (isOwner && req.status === 'Owner Approval') {
      actions.push(`<button class="btn btn-success" data-act="ownerApprove">${esc(I18N.t('ownerApproveBtn'))}</button>`);
      actions.push(`<button class="btn btn-warning" data-act="ownerRevision">${esc(I18N.t('ownerRevisionBtn'))}</button>`);
      actions.push(`<button class="btn btn-danger" data-act="ownerReject">${esc(I18N.t('ownerRejectBtn'))}</button>`);
    }
    if ((isAssignedTech || isGS) && req.status === 'In Progress') {
      actions.push(`<button class="btn btn-success btn-big-cta" data-act="completeWork">${esc(I18N.t('completeWorkBtn'))}</button>`);
    }
    if ((isBranchResp || isGS) && req.status === 'Completed') {
      actions.push(`<button class="btn btn-success btn-big-cta" data-act="confirmWork">${esc(I18N.t('confirmCompletionBtn'))}</button>`);
    }
    if (isFinance && req.ownerDecision === 'Approved' && req.paymentStatus === 'Pending') {
      actions.push(`<button class="btn btn-primary btn-big-cta" data-act="logPayment">${esc(I18N.t('logPaymentBtn'))}</button>`);
    }
    if (isGS && req.status === 'On Hold') {
      actions.push(`<button class="btn btn-primary" data-act="resume">${esc(I18N.t('resumeBtn'))}</button>`);
    }
    if (isGS && !['Closed', 'Cancelled', 'Rejected', 'On Hold'].includes(req.status)) {
      actions.push(`<button class="btn btn-outline" data-act="hold">${esc(I18N.t('holdBtn'))}</button>`);
    }
    if (isGS && WORKFLOW_ORDER.indexOf(req.status) > 0) {
      actions.push(`<button class="btn btn-outline" data-act="rollback">${esc(I18N.t('rollbackBtn'))}</button>`);
    }
    if ((isGS || (isBranchResp && req.status === 'New')) && !['Closed', 'Cancelled'].includes(req.status)) {
      actions.push(`<button class="btn btn-danger" data-act="cancel">${esc(I18N.t('cancelReqBtn'))}</button>`);
    }
    if (isGS && !['Closed', 'Cancelled', 'Rejected'].includes(req.status)) {
      actions.push(`<button class="btn btn-danger" data-act="reject">${esc(I18N.t('rejectReqBtn'))}</button>`);
    }

    root.innerHTML = `
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <button id="btn-back-list" class="btn btn-outline btn-sm" type="button">← ${esc(I18N.t('back'))}</button>
        <span style="font-size:12.5px;color:var(--text-muted);">${esc(formatDateShort(req.createdAt))}</span>
      </div>

      <div class="card">
        <div class="req-card-top">
          <span class="req-id" style="font-size:18px;">${esc(req.requestId)}</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span class="badge ${prioClass(req.priority)}">${esc(I18N.tMap('priorities', req.priority))}</span>
            <span class="badge ${statusClass(req.status)}">${esc(I18N.tMap('statuses', req.status))}</span>
            ${req.autoConfirmed ? `<span class="badge badge-confirmed">${esc(I18N.t('autoConfirmedBadge'))}</span>` : ''}
          </div>
        </div>
        ${req.holdOrCancelReason ? `<div class="alert alert-warning" style="margin-top:8px;">${esc(req.holdOrCancelReason)}</div>` : ''}
        <p style="font-size:15px;font-weight:600;margin:10px 0;">${esc(req.description)}</p>

        <div class="kv-grid">
          <div class="kv-item">
            <div class="kv-label">${esc(I18N.t('branch'))}</div>
            <div class="kv-value">${esc(I18N.localizedName(req.branch))}</div>
            ${req.branch && req.branch.mapsUrl ? `<a href="${esc(req.branch.mapsUrl)}" target="_blank" rel="noopener" style="font-size:12px;">📍 ${esc(I18N.t('mapsLink'))}</a>` : ''}
          </div>
          <div class="kv-item">
            <div class="kv-label">${esc(I18N.t('category'))}</div>
            <div class="kv-value">${esc(I18N.localizedName(req.category))}${req.equipmentType ? ` · ${esc(req.equipmentType)} (${esc(req.equipmentCode)})` : ''}</div>
          </div>
          <div class="kv-item">
            <div class="kv-label">${esc(I18N.t('openedBy'))}</div>
            <div class="kv-value">${esc(getOpenedByLabel(req))}</div>
          </div>
          <div class="kv-item">
            <div class="kv-label">${esc(I18N.t('assignedTechs'))}</div>
            <div class="kv-value">${esc(techsText)}</div>
          </div>
          <div class="kv-item">
            <div class="kv-label">${esc(I18N.t('stageDuration'))}</div>
            <div class="kv-value">${req.hoursInStage} ${esc(I18N.t('hoursUnit'))} ${req.isOverdue ? `· <span style="color:var(--danger)">${esc(I18N.t('overdueBadge'))}</span>` : ''}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">${esc(I18N.t('beforePhotos'))}</h3>
        <div class="photo-grid">
          ${(req.beforePhotos || []).map((p) => `
            <div class="photo-thumb-wrap">
              <img src="${esc(p.thumbUrl || p.viewUrl)}" referrerpolicy="no-referrer" data-lightbox="${esc(p.thumbUrl || p.viewUrl)}" alt="before" />
            </div>
          `).join('')}
        </div>
        ${req.inspectionNotes ? `<div class="alert alert-info" style="margin-top:12px;margin-bottom:0;"><strong>${esc(I18N.t('inspectionNotes'))}:</strong> ${esc(req.inspectionNotes)}</div>` : ''}
      </div>

      ${quotes.length > 0 || (['Inspection', 'Quotation Submitted', 'GS Review'].includes(req.status) && (isAssignedTech || isGS)) ? `
        <div class="card">
          <h3 class="card-title">
            <span>${esc(I18N.t('quotationsTitle'))}</span>
          </h3>
          <div class="quotes-compare">
            ${quotes.map((q) => `
              <div class="quote-card ${q.status === 'Accepted' ? 'accepted' : (q.status === 'Rejected' ? 'rejected' : (q.gsRecommended ? 'recommended' : ''))}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <strong>${esc(q.vendorName)}</strong>
                  <span class="badge ${q.status === 'Accepted' ? 'badge-closed' : (q.status === 'Rejected' ? 'badge-rejected' : 'badge-gs-review')}">${esc(I18N.tMap('quotationStatuses', q.status))}</span>
                </div>
                ${q.gsRecommended ? `<span class="badge badge-owner-approval" style="align-self:flex-start;">⭐ ${esc(I18N.t('gsRecommendedBadge'))}</span>` : ''}
                <div class="quote-amount">${esc(formatKwd(q.amountKwd))}</div>
                <div style="font-size:13px;">${esc(q.itemsSummary)}</div>
                <div style="font-size:12px;color:var(--text-muted);">${esc(I18N.t('executionDuration'))}: ${esc(q.executionDuration || '—')} · ${esc(I18N.t('warrantyPeriod'))}: ${esc(q.warrantyPeriod || '—')}</div>
                ${q.attachmentUrl ? `<a href="${esc(q.attachmentUrl)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">${esc(I18N.t('viewAttachment'))}</a>` : ''}
                ${q.rejectionReason ? `<div class="alert alert-danger" style="margin:4px 0 0;padding:6px 8px;font-size:12px;">${esc(I18N.t('rejectionReason'))}: ${esc(q.rejectionReason)}</div>` : ''}
                ${isGS && ['Quotation Submitted', 'GS Review'].includes(req.status) && q.status === 'Pending' ? `
                  <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
                    <button class="btn btn-primary btn-sm" data-rec-quote="${esc(q.quotationId)}">${esc(I18N.t('recommendQuoteBtn'))}</button>
                    <button class="btn btn-danger btn-sm" data-rej-quote="${esc(q.quotationId)}">${esc(I18N.t('rejectQuoteBtn'))}</button>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${req.ownerDecision || req.paymentStatus !== 'Not Required' ? `
        <div class="card">
          <h3 class="card-title">${esc(I18N.t('paymentSection'))}</h3>
          <div class="kv-grid">
            ${req.ownerDecision ? `
              <div class="kv-item">
                <div class="kv-label">${esc(I18N.t('ownerDecisionLabel'))}</div>
                <div class="kv-value">${esc(req.ownerDecision)} ${req.ownerNote ? '— ' + esc(req.ownerNote) : ''}</div>
              </div>
            ` : ''}
            <div class="kv-item">
              <div class="kv-label">${esc(I18N.t('paymentStatus'))}</div>
              <div class="kv-value"><span class="badge ${payClass(req.paymentStatus)}">${esc(I18N.tMap('paymentStatuses', req.paymentStatus))}</span></div>
            </div>
            <div class="kv-item">
              <div class="kv-label">${esc(I18N.t('approvedAmount'))}</div>
              <div class="kv-value">${esc(formatKwd(req.financeApprovedAmount))}</div>
            </div>
            ${req.paymentDate ? `
              <div class="kv-item">
                <div class="kv-label">${esc(I18N.t('paymentDate'))}</div>
                <div class="kv-value">${esc(req.paymentDate)}</div>
              </div>
            ` : ''}
          </div>
          ${req.invoiceUrl ? `<div style="margin-top:10px;"><a href="${esc(req.invoiceUrl)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">📄 ${esc(I18N.t('viewAttachment'))}</a></div>` : ''}
        </div>
      ` : ''}

      ${(req.afterPhotos && req.afterPhotos.length > 0) ? `
        <div class="card">
          <h3 class="card-title">${esc(I18N.t('afterPhotos'))}</h3>
          <div class="photo-grid">
            ${req.afterPhotos.map((p) => `
              <div class="photo-thumb-wrap">
                <img src="${esc(p.thumbUrl || p.viewUrl)}" referrerpolicy="no-referrer" data-lightbox="${esc(p.thumbUrl || p.viewUrl)}" alt="after" />
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${actions.length > 0 ? `
        <div class="card">
          <h3 class="card-title">${esc(I18N.t('actionsTitle'))}</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${actions.join('')}
          </div>
        </div>
      ` : ''}

      <div class="card">
        <h3 class="card-title">${esc(I18N.t('timelineTitle'))}</h3>
        <div class="timeline-list">
          ${timeline.map((ev) => {
            const actorName = I18N.lang === 'ar' ? (ev.actorNameAr || ev.actorNameEn) : (ev.actorNameEn || ev.actorNameAr);
            return `
              <div class="timeline-item">
                <div style="font-weight:700;font-size:13.5px;">
                  ${esc(actorName)} · <span style="color:var(--primary);">${esc(ev.fromStatus ? `${ev.fromStatus} → ${ev.toStatus}` : ev.toStatus)}</span>
                </div>
                <div style="font-size:12px;color:var(--text-muted);">${esc(formatDateShort(ev.timestamp))}${ev.durationInPrevStageHours ? ` · ${ev.durationInPrevStageHours} ${esc(I18N.t('hoursUnit'))}` : ''}</div>
                ${ev.note ? `<div style="font-size:13px;margin-top:3px;">${esc(ev.note)}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    document.getElementById('btn-back-list').onclick = () => navigate('home');
    root.querySelectorAll('[data-lightbox]').forEach((img) => {
      img.onclick = () => openLightbox(img.dataset.lightbox);
    });

    // Quotation card buttons
    root.querySelectorAll('[data-rec-quote]').forEach((b) => {
      b.onclick = () => execTransition({ action: 'RECOMMEND_TO_OWNER', quotationId: b.dataset.recQuote });
    });
    root.querySelectorAll('[data-rej-quote]').forEach((b) => {
      b.onclick = () => openReasonModal(I18N.t('rejectQuoteBtn'), true, (reason) => {
        execTransition({ action: 'REJECT_QUOTATION', quotationId: b.dataset.rejQuote, rejectionReason: reason });
      });
    });

    // Action Bar bindings
    root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.onclick = () => handleDetailAction(btn.dataset.act, detail);
    });
  }

  function openReasonModal(title, required, onConfirm) {
    openModal(`
      <h3 class="card-title">${esc(title)}</h3>
      <div class="form-group">
        <label class="form-label">${esc(required ? I18N.t('reasonRequiredLabel') : I18N.t('noteOptionalLabel'))}</label>
        <textarea id="mdl-reason" class="form-control"></textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="mdl-ok" class="btn btn-primary" style="flex:1;" type="button">${esc(I18N.t('submitAction'))}</button>
        <button id="mdl-cancel" class="btn btn-outline" type="button">${esc(I18N.t('cancel'))}</button>
      </div>
    `);
    document.getElementById('mdl-cancel').onclick = closeModal;
    document.getElementById('mdl-ok').onclick = () => {
      const val = document.getElementById('mdl-reason').value.trim();
      if (required && !val) {
        showToast(I18N.formatError('REASON_REQUIRED'));
        return;
      }
      onConfirm(val);
    };
  }

  function handleDetailAction(act, detail) {
    const req = detail.request;
    if (act === 'startReview') {
      execTransition({ action: 'START_REVIEW' });
    } else if (act === 'assignTechs') {
      const techs = detail.technicians || [];
      openModal(`
        <h3 class="card-title">${esc(I18N.t('assignTechsBtn'))}</h3>
        <div class="form-group">
          <label class="form-label">${esc(I18N.t('selectTechsPrompt'))}</label>
          ${techs.map((t) => `
            <label style="display:flex;align-items:center;gap:8px;padding:8px 0;font-weight:600;">
              <input type="checkbox" class="chk-tech" value="${esc(t.userId)}" ${(req.assignedTechIds || []).includes(t.userId) ? 'checked' : ''} style="width:20px;height:20px;" />
              <span>${esc(getUserDisplayName(t))}</span>
            </label>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;">
          <button id="mdl-assign-ok" class="btn btn-primary" style="flex:1;" type="button">${esc(I18N.t('submitAction'))}</button>
          <button id="mdl-assign-cancel" class="btn btn-outline" type="button">${esc(I18N.t('cancel'))}</button>
        </div>
      `);
      document.getElementById('mdl-assign-cancel').onclick = closeModal;
      document.getElementById('mdl-assign-ok').onclick = () => {
        const selected = Array.from(document.querySelectorAll('.chk-tech:checked')).map((el) => el.value);
        if (!selected.length) { showToast(I18N.t('selectTechsPrompt')); return; }
        execTransition({ action: 'ASSIGN_TECHS', techIds: selected });
      };
    } else if (act === 'startInspection') {
      execTransition({ action: 'START_INSPECTION' });
    } else if (act === 'internalRepair') {
      openReasonModal(I18N.t('internalRepairBtn'), false, (note) => {
        execTransition({ action: 'INSPECTION_INTERNAL', inspectionNotes: note, note });
      });
    } else if (act === 'saveInspection') {
      openModal(`
        <h3 class="card-title">${esc(I18N.t('saveInspectionBtn'))}</h3>
        <div class="form-group">
          <label class="form-label">${esc(I18N.t('inspectionNotes'))}</label>
          <textarea id="mdl-insp-notes" class="form-control">${esc(req.inspectionNotes || '')}</textarea>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="mdl-insp-ok" class="btn btn-primary" style="flex:1;" type="button">${esc(I18N.t('submitAction'))}</button>
          <button id="mdl-insp-cancel" class="btn btn-outline" type="button">${esc(I18N.t('cancel'))}</button>
        </div>
      `);
      document.getElementById('mdl-insp-cancel').onclick = closeModal;
      document.getElementById('mdl-insp-ok').onclick = () => {
        execTransition({ action: 'SAVE_INSPECTION_NOTES', inspectionNotes: document.getElementById('mdl-insp-notes').value.trim(), needsPurchase: true });
      };
    } else if (act === 'addQuotation') {
      let quoteAtt = null;
      openModal(`
        <h3 class="card-title">${esc(I18N.t('addQuotationBtn'))}</h3>
        <div class="form-group"><label class="form-label">${esc(I18N.t('vendorName'))}</label><input id="qt-vendor" class="form-control" /></div>
        <div class="form-group"><label class="form-label">${esc(I18N.t('amountKwd'))}</label><input id="qt-amount" type="number" step="0.001" min="0" class="form-control" /></div>
        <div class="form-group"><label class="form-label">${esc(I18N.t('itemsSummary'))}</label><textarea id="qt-items" class="form-control"></textarea></div>
        <div class="form-group"><label class="form-label">${esc(I18N.t('executionDuration'))}</label><input id="qt-dur" class="form-control" /></div>
        <div class="form-group"><label class="form-label">${esc(I18N.t('warrantyPeriod'))}</label><input id="qt-war" class="form-control" /></div>
        <div class="form-group">
          <label class="form-label">${esc(I18N.t('quoteAttachment'))}</label>
          <input id="qt-file" type="file" accept="image/*,application/pdf" class="form-control" />
        </div>
        <div style="display:flex;gap:8px;">
          <button id="qt-ok" class="btn btn-primary" style="flex:1;" type="button">${esc(I18N.t('submitAction'))}</button>
          <button id="qt-cancel" class="btn btn-outline" type="button">${esc(I18N.t('cancel'))}</button>
        </div>
      `);
      document.getElementById('qt-cancel').onclick = closeModal;
      document.getElementById('qt-file').onchange = async (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) quoteAtt = await FILES.readAttachment(f);
      };
      document.getElementById('qt-ok').onclick = () => {
        execTransition({
          action: 'ADD_QUOTATION',
          vendorName: document.getElementById('qt-vendor').value.trim(),
          amountKwd: Number(document.getElementById('qt-amount').value),
          itemsSummary: document.getElementById('qt-items').value.trim(),
          executionDuration: document.getElementById('qt-dur').value.trim(),
          warrantyPeriod: document.getElementById('qt-war').value.trim(),
          attachment: quoteAtt
        });
      };
    } else if (act === 'sendToGsReview') {
      execTransition({ action: 'SEND_TO_GS_REVIEW' });
    } else if (act === 'ownerApprove') {
      openReasonModal(I18N.t('ownerApproveBtn'), false, (note) => execTransition({ action: 'OWNER_DECISION', decision: 'Approved', note }));
    } else if (act === 'ownerRevision') {
      openReasonModal(I18N.t('ownerRevisionBtn'), true, (note) => execTransition({ action: 'OWNER_DECISION', decision: 'Revision Requested', note }));
    } else if (act === 'ownerReject') {
      openReasonModal(I18N.t('ownerRejectBtn'), true, (note) => execTransition({ action: 'OWNER_DECISION', decision: 'Rejected', note }));
    } else if (act === 'completeWork') {
      const afterPhotos = [];
      openModal(`
        <h3 class="card-title">${esc(I18N.t('completeWorkBtn'))}</h3>
        <div class="form-group">
          <label class="form-label">${esc(I18N.t('afterPhotos'))}</label>
          <input id="cw-photos" type="file" accept="image/*" multiple class="form-control" />
          <div id="cw-preview" class="photo-grid"></div>
        </div>
        <div class="form-group">
          <label class="form-label">${esc(I18N.t('noteOptionalLabel'))}</label>
          <textarea id="cw-note" class="form-control"></textarea>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="cw-ok" class="btn btn-success" style="flex:1;" type="button">${esc(I18N.t('submitAction'))}</button>
          <button id="cw-cancel" class="btn btn-outline" type="button">${esc(I18N.t('cancel'))}</button>
        </div>
      `);
      document.getElementById('cw-cancel').onclick = closeModal;
      document.getElementById('cw-photos').onchange = async (e) => {
        showToast(I18N.t('compressingImg'));
        for (const f of Array.from(e.target.files || [])) {
          if (afterPhotos.length >= 5) break;
          afterPhotos.push(await FILES.compressImage(f));
        }
        document.getElementById('cw-preview').innerHTML = afterPhotos.map((p) => `<div class="photo-thumb-wrap"><img src="${esc(p.previewUrl)}" /></div>`).join('');
      };
      document.getElementById('cw-ok').onclick = () => {
        if (!afterPhotos.length) { showToast(I18N.formatError('AFTER_PHOTO_REQUIRED')); return; }
        execTransition({
          action: 'COMPLETE_WORK',
          photos: afterPhotos.map((p) => ({ fileName: p.fileName, mimeType: p.mimeType, base64Data: p.base64Data })),
          note: document.getElementById('cw-note').value.trim()
        });
      };
    } else if (act === 'confirmWork') {
      openReasonModal(I18N.t('confirmCompletionBtn'), false, (note) => execTransition({ action: 'CONFIRM_COMPLETION', note }));
    } else if (act === 'logPayment') {
      let invFile = null;
      const today = new Date().toISOString().substring(0, 10);
      openModal(`
        <h3 class="card-title">${esc(I18N.t('logPaymentBtn'))}</h3>
        <div class="form-group"><label class="form-label">${esc(I18N.t('approvedAmount'))}</label><input id="pay-amt" type="number" step="0.001" value="${esc(req.financeApprovedAmount || '')}" class="form-control" /></div>
        <div class="form-group"><label class="form-label">${esc(I18N.t('paymentDate'))}</label><input id="pay-date" type="date" value="${today}" class="form-control" /></div>
        <div class="form-group"><label class="form-label">${esc(I18N.t('invoiceAttachment'))}</label><input id="pay-file" type="file" accept="image/*,application/pdf" class="form-control" /></div>
        <div class="form-group"><label class="form-label">${esc(I18N.t('noteOptionalLabel'))}</label><input id="pay-note" class="form-control" /></div>
        <div style="display:flex;gap:8px;">
          <button id="pay-ok" class="btn btn-primary" style="flex:1;" type="button">${esc(I18N.t('submitAction'))}</button>
          <button id="pay-cancel" class="btn btn-outline" type="button">${esc(I18N.t('cancel'))}</button>
        </div>
      `);
      document.getElementById('pay-cancel').onclick = closeModal;
      document.getElementById('pay-file').onchange = async (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) invFile = await FILES.readAttachment(f);
      };
      document.getElementById('pay-ok').onclick = () => {
        if (!invFile) { showToast(I18N.formatError('INVOICE_ATTACHMENT_REQUIRED')); return; }
        execTransition({
          action: 'LOG_PAYMENT',
          approvedAmount: Number(document.getElementById('pay-amt').value),
          paymentDate: document.getElementById('pay-date').value,
          invoiceFile: invFile,
          note: document.getElementById('pay-note').value.trim()
        });
      };
    } else if (act === 'hold') {
      openReasonModal(I18N.t('holdBtn'), true, (note) => execTransition({ action: 'HOLD_REQUEST', note }));
    } else if (act === 'resume') {
      execTransition({ action: 'RESUME_REQUEST' });
    } else if (act === 'cancel') {
      openReasonModal(I18N.t('cancelReqBtn'), true, (note) => execTransition({ action: 'CANCEL_REQUEST', note }));
    } else if (act === 'reject') {
      openReasonModal(I18N.t('rejectReqBtn'), true, (note) => execTransition({ action: 'REJECT_REQUEST', note }));
    } else if (act === 'rollback') {
      const curIdx = WORKFLOW_ORDER.indexOf(req.status);
      const earlier = WORKFLOW_ORDER.slice(0, curIdx > 0 ? curIdx : 1);
      openModal(`
        <h3 class="card-title">${esc(I18N.t('rollbackBtn'))}</h3>
        <div class="form-group">
          <label class="form-label">${esc(I18N.t('targetStage'))}</label>
          <select id="rb-stage" class="form-control">
            ${earlier.map((st) => `<option value="${esc(st)}">${esc(I18N.tMap('statuses', st))}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${esc(I18N.t('reasonRequiredLabel'))}</label>
          <textarea id="rb-reason" class="form-control"></textarea>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="rb-ok" class="btn btn-warning" style="flex:1;" type="button">${esc(I18N.t('submitAction'))}</button>
          <button id="rb-cancel" class="btn btn-outline" type="button">${esc(I18N.t('cancel'))}</button>
        </div>
      `);
      document.getElementById('rb-cancel').onclick = closeModal;
      document.getElementById('rb-ok').onclick = () => {
        const note = document.getElementById('rb-reason').value.trim();
        if (!note) { showToast(I18N.formatError('REASON_REQUIRED')); return; }
        execTransition({ action: 'ROLLBACK_STAGE', targetStatus: document.getElementById('rb-stage').value, note });
      };
    }
  }

  // --- Main Render ---
  function render() {
    I18N.applyDirection();
    renderChrome();
    if (!state.session) {
      renderLogin();
      return;
    }
    if (state.route === 'new') renderNewRequest();
    else if (state.route === 'detail') renderDetail();
    else if (state.route === 'requests') renderRequestsList();
    else if (['dashboard', 'reports', 'admin'].includes(state.route) && window.FLARE_EXT) window.FLARE_EXT.render(state.route);
    else renderHome();
  }

  // Shared helpers for the Dashboard / Reports / Admin module (ext.js)
  window.FLARE_APP = {
    state, esc, showToast, openModal, closeModal, navigate, render,
    formatKwd, formatDateShort, statusClass, refreshRequests
  };

  // --- Global Events & Boot ---
  document.getElementById('btn-lang-toggle').onclick = async () => {
    const nextLang = I18N.lang === 'ar' ? 'en' : 'ar';
    I18N.setLanguage(nextLang);
    render();
    if (state.session && API.isConfigured()) {
      try {
        await API.call('setLanguage', { lang: nextLang });
        state.session.preferredLang = nextLang;
        API.setSession(state.session);
      } catch (ignored) {}
    }
  };

  document.getElementById('btn-logout').onclick = async () => {
    try { await API.call('logout', {}); } catch (ignored) {}
    API.clearSession();
    state.session = null;
    state.requests = [];
    state.currentDetail = null;
    loadLoginUsers().then(render);
  };

  // Keyboard support for PIN entry on desktop
  window.addEventListener('keydown', (e) => {
    if (state.session || document.activeElement.tagName === 'SELECT') return;
    if (/^\d$/.test(e.key) && state.pinBuffer.length < 8) {
      state.pinBuffer += e.key;
      renderLogin();
    } else if (e.key === 'Backspace' && state.pinBuffer.length > 0) {
      state.pinBuffer = state.pinBuffer.slice(0, -1);
      renderLogin();
    } else if (e.key === 'Enter' && state.pinBuffer.length >= 4) {
      submitLogin();
    }
  });

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Boot
  (async function boot() {
    I18N.applyDirection();
    render();
    if (!state.session) {
      await loadLoginUsers();
      render();
    } else {
      const hash = window.location.hash || '';
      if (hash.startsWith('#/request/')) {
        const rid = hash.replace('#/request/', '').trim();
        if (rid) {
          navigate('detail', { requestId: rid });
          return;
        }
      }
      await refreshRequests();
      render();
    }
  })();
})();
