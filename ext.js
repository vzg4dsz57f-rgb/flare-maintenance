/**
 * Flare Maintenance App — Dashboard, Reports (monthly / yearly) and Admin screens.
 * Loaded after app.js and uses the helpers it exposes on window.FLARE_APP.
 *
 * Report wording is deliberately formal in both languages (it is printed, exported and emailed),
 * independent of the playful Egyptian Arabic used in the rest of the Arabic interface.
 */
(function () {
  const I18N = window.FLARE_I18N;
  const API = window.FLARE_API;
  const APP = window.FLARE_APP;
  const esc = APP.esc;

  const kwNow = new Date(Date.now() + 3 * 3600000);
  const ext = {
    dashboard: null,
    report: null,
    repType: 'month',
    repYear: kwNow.getUTCFullYear(),
    repMonth: kwNow.getUTCMonth() + 1,
    repLang: I18N.lang,
    admin: null,
    adminTab: 'users',
    loading: false
  };

  const MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  };

  // Formal report vocabulary (kept in sync with REPORT_TEXT in backend/Reports.gs)
  const REP = {
    en: {
      monthly: 'Monthly Maintenance Report', yearly: 'Annual Maintenance Report',
      summary: 'Summary', opened: 'Requests opened', closed: 'Requests closed', openNow: 'Still open', overdue: 'Overdue (SLA)', cancelled: 'Cancelled / rejected',
      approvedCost: 'Approved cost (KWD)', paidCost: 'Paid (KWD)', avgClose: 'Avg. time to close (hrs)',
      quotes: 'Quotations', accepted: 'Accepted', rejected: 'Rejected', pending: 'Pending',
      byBranch: 'By Branch', branch: 'Branch', fixed: 'Completed Repairs', request: 'Request', item: 'Item', tech: 'Technician', cost: 'Cost (KWD)', date: 'Closed on',
      vendor: 'Vendor', amount: 'Amount (KWD)', status: 'Status', reason: 'Rejection reason',
      byCategory: 'By Category', category: 'Category', count: 'Requests', byTech: 'By Technician', assigned: 'Assigned', recurring: 'Recurring Faults', times: 'Times',
      monthByMonth: 'Month by Month', month: 'Month', topCost: 'Highest Cost Items', topCount: 'Most Frequent Items', branchCompare: 'Branch Comparison',
      none: 'No data for this period.', generated: 'Generated', chartRequests: 'Requests opened per month', chartCost: 'Approved cost per month (KWD)'
    },
    ar: {
      monthly: 'تقرير الصيانة الشهري', yearly: 'تقرير الصيانة السنوي',
      summary: 'الملخص', opened: 'الطلبات المفتوحة خلال الفترة', closed: 'الطلبات المقفلة', openNow: 'ما زالت مفتوحة', overdue: 'متأخرة عن المدة المحددة', cancelled: 'ملغاة / مرفوضة',
      approvedCost: 'التكلفة المعتمدة (د.ك)', paidCost: 'المدفوع (د.ك)', avgClose: 'متوسط وقت الإقفال (ساعة)',
      quotes: 'عروض الأسعار', accepted: 'مقبولة', rejected: 'مرفوضة', pending: 'قيد المراجعة',
      byBranch: 'حسب الفرع', branch: 'الفرع', fixed: 'الأعمال المنجزة', request: 'الطلب', item: 'البند', tech: 'الفني', cost: 'التكلفة (د.ك)', date: 'تاريخ الإقفال',
      vendor: 'المورد', amount: 'المبلغ (د.ك)', status: 'الحالة', reason: 'سبب الرفض',
      byCategory: 'حسب التصنيف', category: 'التصنيف', count: 'عدد الطلبات', byTech: 'حسب الفني', assigned: 'المعيّنة', recurring: 'الأعطال المتكررة', times: 'عدد المرات',
      monthByMonth: 'مقارنة الشهور', month: 'الشهر', topCost: 'الأعلى تكلفة', topCount: 'الأكثر تكراراً', branchCompare: 'مقارنة الفروع',
      none: 'لا توجد بيانات لهذه الفترة.', generated: 'تاريخ الإصدار', chartRequests: 'الطلبات المفتوحة لكل شهر', chartCost: 'التكلفة المعتمدة لكل شهر (د.ك)'
    }
  };

  function root() { return document.getElementById('app-root'); }
  function nm(obj, base, lang) {
    const ar = (lang || I18N.lang) === 'ar';
    return ar ? (obj[base + 'Ar'] || obj[base + 'En'] || '') : (obj[base + 'En'] || obj[base + 'Ar'] || '');
  }
  function num3(v) { return Number(v || 0).toFixed(3); }
  function loadingCard() {
    return `<div class="card" style="text-align:center;color:var(--text-muted);">${esc(I18N.t('loading'))}</div>`;
  }
  function role() { return APP.state.session ? APP.state.session.role : ''; }

  // -------------------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------------------
  async function loadDashboard() {
    ext.loading = true; renderDashboard();
    try { ext.dashboard = await API.call('getDashboard', {}); }
    catch (e) { APP.showToast(I18N.formatError(e.message)); }
    ext.loading = false; renderDashboard();
  }

  function bar(value, max, color) {
    const pct = max > 0 && value > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
    return `<div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color};"></div></div>`;
  }

  function renderDashboard() {
    if (APP.state.route !== 'dashboard') return;
    const d = ext.dashboard;
    if (!d) { root().innerHTML = loadingCard(); return; }
    const k = d.kpi;
    const maxOpen = Math.max(1, ...d.openByBranch.map((b) => b.open));
    const monthName = MONTHS[I18N.lang][d.month.month - 1] + ' ' + d.month.year;

    root().innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h2 class="page-title">${esc(I18N.t('dashTitle'))}</h2>
        <button id="dash-refresh" class="btn btn-outline btn-sm" type="button">${esc(I18N.t('refresh'))}</button>
      </div>
      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-val">${k.open}</div><div class="kpi-lbl">${esc(I18N.t('kpiOpen'))}</div></div>
        <div class="kpi-box"><div class="kpi-val" style="color:var(--danger);">${k.overdue}</div><div class="kpi-lbl">${esc(I18N.t('kpiOverdue'))}</div></div>
        <div class="kpi-box"><div class="kpi-val" style="color:var(--purple);">${k.awaitingOwner}</div><div class="kpi-lbl">${esc(I18N.t('kpiAwaitOwner'))}</div></div>
        <div class="kpi-box"><div class="kpi-val" style="color:var(--warning);">${k.pendingPayment}</div><div class="kpi-lbl">${esc(I18N.t('kpiPendingPay'))}</div></div>
        <div class="kpi-box"><div class="kpi-val" style="color:var(--info);">${k.awaitingBranchConfirm}</div><div class="kpi-lbl">${esc(I18N.t('kpiAwaitConfirm'))}</div></div>
        <div class="kpi-box"><div class="kpi-val">${k.unassigned}</div><div class="kpi-lbl">${esc(I18N.t('kpiUnassigned'))}</div></div>
      </div>

      <div class="card">
        <h3 class="card-title">${esc(I18N.t('thisMonth'))} — ${esc(monthName)}</h3>
        <div class="kv-grid">
          <div class="kv-item"><div class="kv-label">${esc(REP[I18N.lang].opened)}</div><div class="kv-value">${d.month.opened}</div></div>
          <div class="kv-item"><div class="kv-label">${esc(REP[I18N.lang].closed)}</div><div class="kv-value">${d.month.closed}</div></div>
          <div class="kv-item"><div class="kv-label">${esc(REP[I18N.lang].approvedCost)}</div><div class="kv-value">${num3(d.month.approvedCost)}</div></div>
          <div class="kv-item"><div class="kv-label">${esc(REP[I18N.lang].paidCost)}</div><div class="kv-value">${num3(d.month.paidCost)}</div></div>
          <div class="kv-item"><div class="kv-label">${esc(REP[I18N.lang].avgClose)}</div><div class="kv-value">${d.month.avgCloseHours}</div></div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">${esc(I18N.t('openByBranchTitle'))}</h3>
        ${d.openByBranch.map((b) => `
          <div class="bar-row">
            <div class="bar-label">${esc(nm(b, 'name'))}</div>
            ${bar(b.open, maxOpen, 'var(--primary)')}
            <div class="bar-num">${b.open}${b.overdue ? ` <span style="color:var(--danger);">(${b.overdue}⏰)</span>` : ''}</div>
          </div>`).join('')}
      </div>

      <div class="card">
        <h3 class="card-title">${esc(I18N.t('recurringTitle'))}</h3>
        ${d.recurring.length ? d.recurring.map((r) => `
          <div class="list-row"><div><strong>${esc(r.label)}</strong><div class="muted-sm">${esc(nm(r, 'branchName'))}</div></div><span class="badge prio-urgent">× ${r.count}</span></div>`).join('')
          : `<div class="muted-sm">${esc(I18N.t('noData'))}</div>`}
      </div>
    `;
    document.getElementById('dash-refresh').onclick = loadDashboard;
  }

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------
  async function loadReport() {
    ext.loading = true; renderReports();
    try {
      ext.report = await API.call('getReport', { type: ext.repType, year: ext.repYear, month: ext.repMonth });
    } catch (e) { APP.showToast(I18N.formatError(e.message)); }
    ext.loading = false; renderReports();
  }

  function periodTitle(rep, lang) {
    const T = REP[lang];
    if (rep.period.type === 'year') return `${T.yearly} — ${rep.period.year}`;
    return `${T.monthly} — ${MONTHS[lang][rep.period.month - 1]} ${rep.period.year}`;
  }

  /** Report as plain tables in one language — shared by the screen, the PDF print and the Excel export. */
  function reportTables(rep, lang) {
    const T = REP[lang];
    const t = rep.totals;
    const tables = [];
    tables.push({ title: T.summary, headers: [T.summary, ''], rows: [
      [T.opened, t.opened], [T.closed, t.closed], [T.openNow, t.openNow], [T.overdue, t.overdue], [T.cancelled, t.cancelled],
      [T.approvedCost, t.approvedCost], [T.paidCost, t.paidCost], [T.avgClose, t.avgCloseHours],
      [`${T.quotes} — ${T.accepted}`, t.quotesAccepted], [`${T.quotes} — ${T.rejected}`, t.quotesRejected], [`${T.quotes} — ${T.pending}`, t.quotesPending]
    ] });
    tables.push({ title: rep.period.type === 'year' ? T.branchCompare : T.byBranch,
      headers: [T.branch, T.opened, T.closed, T.openNow, T.overdue, T.cancelled, T.approvedCost, T.paidCost, T.avgClose],
      rows: rep.branches.map((b) => [nm(b, 'name', lang), b.opened, b.closed, b.openNow, b.overdue, b.cancelled, b.approvedCost, b.paidCost, b.avgCloseHours]) });
    if (rep.monthly && rep.monthly.length) {
      tables.push({ title: T.monthByMonth, headers: [T.month, T.opened, T.closed, T.approvedCost, T.paidCost],
        rows: rep.monthly.map((m) => [MONTHS[lang][m.month - 1], m.opened, m.closed, m.approvedCost, m.paidCost]) });
    }
    tables.push({ title: T.fixed, headers: [T.request, T.branch, T.category, T.item, T.date, T.tech, T.cost],
      rows: rep.fixedItems.map((f) => [f.requestId, nm(f, 'branchName', lang), nm(f, 'categoryName', lang),
        (f.equipment ? f.equipment + ' — ' : '') + f.description, String(f.closedAt || '').substring(0, 10),
        lang === 'ar' ? f.techNamesAr : f.techNamesEn, f.cost]) });
    tables.push({ title: T.quotes, headers: [T.request, T.branch, T.vendor, T.amount, T.status, T.reason],
      rows: rep.quotations.map((q) => [q.requestId, nm(q, 'branchName', lang), q.vendorName, q.amountKwd,
        q.status === 'Accepted' ? T.accepted : (q.status === 'Rejected' ? T.rejected : T.pending), q.rejectionReason]) });
    tables.push({ title: T.byCategory, headers: [T.category, T.count, T.approvedCost],
      rows: rep.byCategory.map((c) => [nm(c, 'name', lang), c.count, c.cost]) });
    tables.push({ title: T.byTech, headers: [T.tech, T.assigned, T.closed],
      rows: rep.byTechnician.map((x) => [nm(x, 'name', lang), x.assigned, x.closed]) });
    tables.push({ title: T.recurring, headers: [T.item, T.branch, T.times, T.approvedCost],
      rows: rep.recurring.map((r) => [r.label, nm(r, 'branchName', lang), r.count, r.cost]) });
    if (rep.period.type === 'year') {
      tables.push({ title: T.topCost, headers: [T.item, T.branch, T.approvedCost, T.times],
        rows: rep.topByCost.map((r) => [r.label, nm(r, 'branchName', lang), r.cost, r.count]) });
      tables.push({ title: T.topCount, headers: [T.item, T.branch, T.times, T.approvedCost],
        rows: rep.topByCount.map((r) => [r.label, nm(r, 'branchName', lang), r.count, r.cost]) });
    }
    return tables;
  }

  function tableHtml(tb, lang) {
    if (!tb.rows.length) return `<p class="muted-sm">${esc(REP[lang].none)}</p>`;
    return `<div class="table-wrap"><table class="rep-table">
      <thead><tr>${tb.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${tb.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c === 0 ? '0' : c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function monthlyChart(rep, lang, field, title, color) {
    const max = Math.max(0, ...rep.monthly.map((m) => Number(m[field]) || 0));
    return `<div class="rep-section"><h4>${esc(title)}</h4><div class="col-chart">
      ${rep.monthly.map((m) => {
        const v = Number(m[field]) || 0;
        const h = max > 0 ? Math.round((v / max) * 100) : 0;
        return `<div class="col-item"><div class="col-val">${field === 'opened' ? v : (v ? v.toFixed(0) : '')}</div>
          <div class="col-bar-wrap"><div class="col-bar" style="height:${h}%;background:${color};"></div></div>
          <div class="col-lbl">${esc(MONTHS[lang][m.month - 1].substring(0, 3))}</div></div>`;
      }).join('')}
    </div></div>`;
  }

  function reportBodyHtml(rep, lang) {
    const T = REP[lang];
    const tables = reportTables(rep, lang);
    let html = `<div class="rep-doc" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">
      <div class="rep-head"><div class="rep-brand">Flare Fitness</div><h2>${esc(periodTitle(rep, lang))}</h2>
      <div class="muted-sm">${esc(T.generated)}: ${esc(String(rep.generatedAt).substring(0, 10))}</div></div>`;
    tables.forEach((tb, idx) => {
      html += `<div class="rep-section"><h4>${esc(tb.title)}</h4>${tableHtml(tb, lang)}</div>`;
      if (idx === 1 && rep.monthly && rep.monthly.length) {
        html += monthlyChart(rep, lang, 'opened', T.chartRequests, '#ea580c');
        html += monthlyChart(rep, lang, 'approvedCost', T.chartCost, '#0f172a');
      }
    });
    return html + '</div>';
  }

  function renderReports() {
    if (APP.state.route !== 'reports') return;
    const years = [];
    for (let y = kwNow.getUTCFullYear(); y >= 2025; y--) years.push(y);
    const canEmail = role() === 'GS Manager';

    root().innerHTML = `
      <div class="card no-print">
        <div class="tabs" style="margin-bottom:10px;">
          <button class="tab-btn ${ext.repType === 'month' ? 'active' : ''}" data-rtype="month">${esc(I18N.t('repMonthly'))}</button>
          <button class="tab-btn ${ext.repType === 'year' ? 'active' : ''}" data-rtype="year">${esc(I18N.t('repYearly'))}</button>
        </div>
        <div class="filters-grid">
          <select id="rep-year" class="form-control">${years.map((y) => `<option value="${y}" ${y === ext.repYear ? 'selected' : ''}>${y}</option>`).join('')}</select>
          ${ext.repType === 'month' ? `<select id="rep-month" class="form-control">${MONTHS[I18N.lang].map((n, i) => `<option value="${i + 1}" ${i + 1 === ext.repMonth ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}
          <select id="rep-lang" class="form-control">
            <option value="ar" ${ext.repLang === 'ar' ? 'selected' : ''}>${esc(I18N.t('repLangAr'))}</option>
            <option value="en" ${ext.repLang === 'en' ? 'selected' : ''}>${esc(I18N.t('repLangEn'))}</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button id="rep-excel" class="btn btn-success btn-sm" type="button" ${ext.report ? '' : 'disabled'}>${esc(I18N.t('exportExcel'))}</button>
          <button id="rep-pdf" class="btn btn-navy btn-sm" type="button" ${ext.report ? '' : 'disabled'}>${esc(I18N.t('exportPdf'))}</button>
          ${canEmail ? `<button id="rep-email" class="btn btn-outline btn-sm" type="button" ${ext.report ? '' : 'disabled'}>${esc(I18N.t('emailReport'))}</button>` : ''}
        </div>
        <div class="muted-sm" style="margin-top:8px;">${esc(I18N.t('repHint'))}</div>
      </div>
      <div id="rep-out" class="card rep-card">${ext.report && !ext.loading ? reportBodyHtml(ext.report, ext.repLang) : loadingCard()}</div>
    `;

    root().querySelectorAll('[data-rtype]').forEach((b) => {
      b.onclick = () => { ext.repType = b.dataset.rtype; ext.report = null; loadReport(); };
    });
    document.getElementById('rep-year').onchange = (e) => { ext.repYear = Number(e.target.value); ext.report = null; loadReport(); };
    const mSel = document.getElementById('rep-month');
    if (mSel) mSel.onchange = (e) => { ext.repMonth = Number(e.target.value); ext.report = null; loadReport(); };
    document.getElementById('rep-lang').onchange = (e) => { ext.repLang = e.target.value; renderReports(); };
    document.getElementById('rep-pdf').onclick = () => window.print();
    document.getElementById('rep-excel').onclick = exportExcel;
    const em = document.getElementById('rep-email');
    if (em) em.onclick = emailReport;
  }

  function reportFileName(rep) {
    const p = rep.period;
    const label = p.type === 'year' ? String(p.year) : `${p.year}-${String(p.month).padStart(2, '0')}`;
    return `Flare_Maintenance_${p.type === 'year' ? 'Annual' : 'Monthly'}_Report_${label}`;
  }

  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX_LOAD_FAILED')));
      s.onerror = () => reject(new Error('XLSX_LOAD_FAILED'));
      document.head.appendChild(s);
    });
  }

  function tablesToAoa(rep, lang) {
    const aoa = [['Flare Fitness'], [periodTitle(rep, lang)], []];
    reportTables(rep, lang).forEach((tb) => {
      aoa.push([tb.title]);
      aoa.push(tb.headers);
      tb.rows.forEach((r) => aoa.push(r));
      aoa.push([]);
    });
    return aoa;
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  async function exportExcel() {
    const rep = ext.report;
    if (!rep) return;
    const base = reportFileName(rep);
    try {
      const XLSX = await loadSheetJs();
      const wb = XLSX.utils.book_new();
      const wsAr = XLSX.utils.aoa_to_sheet(tablesToAoa(rep, 'ar'));
      wsAr['!views'] = [{ rightToLeft: true }];
      const wsEn = XLSX.utils.aoa_to_sheet(tablesToAoa(rep, 'en'));
      [wsAr, wsEn].forEach((ws) => { ws['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 40 }, { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 14 }]; });
      XLSX.utils.book_append_sheet(wb, wsAr, 'عربي');
      XLSX.utils.book_append_sheet(wb, wsEn, 'English');
      wb.Workbook = { Views: [{ RTL: false }] };
      XLSX.writeFile(wb, base + '.xlsx');
    } catch (e) {
      // No internet for the Excel library -> fall back to a CSV that Excel opens (UTF-8 with BOM for Arabic).
      const csv = tablesToAoa(rep, ext.repLang).map((r) => r.map((c) => `"${String(c === undefined || c === null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), base + '.csv');
      APP.showToast(I18N.t('excelFallback'), 5000);
    }
  }

  async function emailReport() {
    const btn = document.getElementById('rep-email');
    btn.disabled = true;
    try {
      const res = await API.call('emailReportNow', { type: ext.repType, year: ext.repYear, month: ext.repMonth });
      APP.showToast(res.sent ? I18N.t('emailSent') : I18N.t(res.reason === 'NO_RECIPIENTS' ? 'emailNoRecipients' : 'emailFailed'), 5000);
    } catch (e) { APP.showToast(I18N.formatError(e.message)); }
    btn.disabled = false;
  }

  // -------------------------------------------------------------------------
  // Admin (GS Manager)
  // -------------------------------------------------------------------------
  async function loadAdmin() {
    ext.loading = true; renderAdmin();
    try { ext.admin = await API.call('adminGetAll', {}); }
    catch (e) { APP.showToast(I18N.formatError(e.message)); }
    ext.loading = false; renderAdmin();
  }

  function userName(id) {
    const u = (ext.admin.users || []).find((x) => x.userId === id);
    return u ? nm(u, 'name') : id;
  }

  function renderAdmin() {
    if (APP.state.route !== 'admin') return;
    const a = ext.admin;
    if (!a) { root().innerHTML = loadingCard(); return; }

    let body = '';
    if (ext.adminTab === 'users') {
      const order = ['GS Manager', 'Owner', 'Finance', 'Technician', 'Branch Responsible'];
      const users = a.users.slice().sort((x, y) => order.indexOf(x.role) - order.indexOf(y.role));
      body = `<button id="adm-add" class="btn btn-primary btn-block" style="margin-bottom:12px;" type="button">${esc(I18N.t('addUser'))}</button>` +
        users.map((u) => `
          <div class="card list-card ${u.isActive ? '' : 'is-inactive'}">
            <div>
              <strong>${esc(nm(u, 'name'))}</strong>
              <div class="muted-sm">${esc(I18N.tMap('roles', u.role))}${u.jobTitle ? ' · ' + esc(I18N.tMap('jobTitles', u.jobTitle)) : ''}</div>
              <div class="muted-sm">${u.email ? esc(u.email) : ''}${u.email && u.phone ? ' · ' : ''}${u.phone ? esc(u.phone) : ''}</div>
              <div style="margin-top:4px;">
                <span class="badge ${u.hasPin ? 'pay-paid' : 'pay-pending'}">${esc(I18N.t(u.hasPin ? 'hasPin' : 'noPin'))}</span>
                ${u.isActive ? '' : `<span class="badge prio-low">${esc(I18N.t('inactive'))}</span>`}
              </div>
            </div>
            <button class="btn btn-outline btn-sm" data-edit-user="${esc(u.userId)}" type="button">${esc(I18N.t('edit'))}</button>
          </div>`).join('');
    } else if (ext.adminTab === 'branches') {
      body = `<button id="adm-add" class="btn btn-primary btn-block" style="margin-bottom:12px;" type="button">${esc(I18N.t('addBranch'))}</button>` +
        a.branches.map((b) => `
          <div class="card ${b.status === 'Active' ? '' : 'is-inactive'}">
            <div class="list-row" style="border:none;padding:0;">
              <div>
                <strong>${esc(nm(b, 'name'))}</strong>
                ${b.status === 'Active' ? '' : ` <span class="badge prio-low">${esc(I18N.t('inactive'))}</span>`}
                <div class="muted-sm">📍 ${esc(b.locationText || '—')}</div>
                ${b.mapsUrl ? `<a class="muted-sm" href="${esc(b.mapsUrl)}" target="_blank" rel="noopener noreferrer">${esc(I18N.t('mapsLink'))}</a>` : ''}
              </div>
              <button class="btn btn-outline btn-sm" data-edit-branch="${esc(b.branchId)}" type="button">${esc(I18N.t('edit'))}</button>
            </div>
            <div class="resp-box">
              <div class="muted-sm" style="margin-bottom:4px;">${esc(I18N.t('responsiblesTitle'))} (${b.responsibles.length})</div>
              ${b.responsibles.length ? b.responsibles.map((r) => `
                <div class="person-row">
                  <div><strong>${esc(userName(r.userId))}</strong> <span class="badge badge-in-progress">${esc(I18N.tMap('jobTitles', r.jobTitle))}</span></div>
                  <button class="btn btn-outline btn-sm" data-remove-person="${esc(b.branchId)}|${esc(r.userId)}" type="button" title="${esc(I18N.t('removeFromBranch'))}">✕</button>
                </div>`).join('')
                : `<div class="muted-sm">${esc(I18N.t('branchPeopleNone'))}</div>`}
              <button class="btn btn-primary btn-sm btn-block" style="margin-top:10px;" data-add-person="${esc(b.branchId)}" type="button">${esc(I18N.t('addBranchPerson'))}</button>
              <button class="btn btn-outline btn-sm btn-block" style="margin-top:6px;" data-resp-branch="${esc(b.branchId)}" type="button">${esc(I18N.t('manageResponsibles'))}</button>
            </div>
          </div>`).join('');
    } else {
      body = `<button id="adm-add" class="btn btn-primary btn-block" style="margin-bottom:12px;" type="button">${esc(I18N.t('addCategory'))}</button>` +
        a.categories.map((c) => `
          <div class="card list-card ${c.isActive ? '' : 'is-inactive'}">
            <div><strong>${esc(nm(c, 'name'))}</strong>
              <div class="muted-sm">${esc(c.nameEn)} · ${esc(c.nameAr)}${c.isActive ? '' : ' · ' + esc(I18N.t('inactive'))}</div></div>
            <button class="btn btn-outline btn-sm" data-edit-cat="${esc(c.categoryId)}" type="button">${esc(I18N.t('edit'))}</button>
          </div>`).join('');
    }

    root().innerHTML = `
      <div class="tabs">
        <button class="tab-btn ${ext.adminTab === 'users' ? 'active' : ''}" data-atab="users">${esc(I18N.t('admUsers'))} (${a.users.length})</button>
        <button class="tab-btn ${ext.adminTab === 'branches' ? 'active' : ''}" data-atab="branches">${esc(I18N.t('admBranches'))} (${a.branches.length})</button>
        <button class="tab-btn ${ext.adminTab === 'categories' ? 'active' : ''}" data-atab="categories">${esc(I18N.t('admCategories'))} (${a.categories.length})</button>
      </div>
      ${body}
    `;

    root().querySelectorAll('[data-atab]').forEach((b) => { b.onclick = () => { ext.adminTab = b.dataset.atab; renderAdmin(); }; });
    const add = document.getElementById('adm-add');
    if (add) add.onclick = () => (ext.adminTab === 'users' ? openUserForm(null) : ext.adminTab === 'branches' ? openBranchForm(null) : openCategoryForm(null));
    root().querySelectorAll('[data-edit-user]').forEach((b) => { b.onclick = () => openUserForm(a.users.find((u) => u.userId === b.dataset.editUser)); });
    root().querySelectorAll('[data-edit-branch]').forEach((b) => { b.onclick = () => openBranchForm(a.branches.find((x) => x.branchId === b.dataset.editBranch)); });
    root().querySelectorAll('[data-resp-branch]').forEach((b) => { b.onclick = () => openResponsiblesForm(a.branches.find((x) => x.branchId === b.dataset.respBranch)); });
    root().querySelectorAll('[data-add-person]').forEach((b) => { b.onclick = () => openBranchPersonForm(a.branches.find((x) => x.branchId === b.dataset.addPerson)); });
    root().querySelectorAll('[data-remove-person]').forEach((b) => {
      b.onclick = () => {
        const [branchId, userId] = b.dataset.removePerson.split('|');
        const br = a.branches.find((x) => x.branchId === branchId);
        if (!window.confirm(I18N.t('removeFromBranch') + ': ' + userName(userId) + ' ؟')) return;
        submitAdmin('adminSetBranchResponsibles', { branchId, responsibles: br.responsibles.filter((r) => r.userId !== userId) });
      };
    });
    root().querySelectorAll('[data-edit-cat]').forEach((b) => { b.onclick = () => openCategoryForm(a.categories.find((x) => x.categoryId === b.dataset.editCat)); });
  }

  function field(id, label, value, attrs) {
    return `<div class="form-group"><label class="form-label" for="${id}">${esc(label)}</label>
      <input id="${id}" class="form-control" value="${esc(value === undefined || value === null ? '' : value)}" ${attrs || ''} /></div>`;
  }
  function formButtons() {
    return `<div style="display:flex;gap:8px;margin-top:6px;">
      <button id="frm-save" class="btn btn-primary" style="flex:1;" type="button">${esc(I18N.t('save'))}</button>
      <button id="frm-cancel" class="btn btn-outline" type="button">${esc(I18N.t('cancel'))}</button></div>`;
  }
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

  async function submitAdmin(action, payload) {
    const btn = document.getElementById('frm-save');
    if (btn) btn.disabled = true;
    try {
      await API.call(action, payload);
      APP.closeModal();
      APP.showToast(I18N.t('saved'));
      await loadAdmin();
      APP.refreshRequests();
    } catch (e) {
      APP.showToast(I18N.formatError(e.message), 4500);
      if (btn) btn.disabled = false;
    }
  }

  function openUserForm(u) {
    const a = ext.admin;
    const cur = u || { role: 'Branch Responsible', jobTitle: 'Branch Manager', isActive: true };
    APP.openModal(`
      <h3 class="card-title">${esc(I18N.t(u ? 'edit' : 'addUser'))}</h3>
      ${field('u-nameAr', I18N.t('nameAr'), cur.nameAr, 'dir="rtl"')}
      ${field('u-nameEn', I18N.t('nameEn'), cur.nameEn, 'dir="ltr"')}
      <div class="form-group"><label class="form-label" for="u-role">${esc(I18N.t('roleLabel'))}</label>
        <select id="u-role" class="form-control">${a.roles.map((r) => `<option value="${esc(r)}" ${r === cur.role ? 'selected' : ''}>${esc(I18N.tMap('roles', r))}</option>`).join('')}</select></div>
      <div class="form-group" id="u-jt-wrap"><label class="form-label" for="u-jobTitle">${esc(I18N.t('jobTitleLabel'))}</label>
        <select id="u-jobTitle" class="form-control">${a.jobTitles.map((j) => `<option value="${esc(j)}" ${j === cur.jobTitle ? 'selected' : ''}>${esc(I18N.tMap('jobTitles', j))}</option>`).join('')}</select></div>
      ${field('u-email', I18N.t('emailLabel'), cur.email, 'type="email" dir="ltr" autocomplete="off"')}
      ${field('u-phone', I18N.t('phoneLabel'), cur.phone, 'type="tel" dir="ltr" autocomplete="off"')}
      ${field('u-pin', I18N.t(u && u.hasPin ? 'pinChange' : 'pinNew'), '', 'type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" dir="ltr"')}
      <div class="muted-sm" style="margin:-6px 0 10px;">${esc(I18N.t('pinHint'))}</div>
      <label class="check-row"><input id="u-active" type="checkbox" ${cur.isActive ? 'checked' : ''} /> ${esc(I18N.t('active'))}</label>
      ${formButtons()}
    `);
    const syncJt = () => { document.getElementById('u-jt-wrap').style.display = val('u-role') === 'Branch Responsible' ? '' : 'none'; };
    document.getElementById('u-role').onchange = syncJt;
    syncJt();
    document.getElementById('frm-cancel').onclick = APP.closeModal;
    document.getElementById('frm-save').onclick = () => {
      const pin = val('u-pin');
      if (pin && !/^\d{4,8}$/.test(pin)) { APP.showToast(I18N.formatError('PIN_INVALID_FORMAT')); return; }
      submitAdmin('adminSaveUser', {
        userId: u ? u.userId : '', nameAr: val('u-nameAr'), nameEn: val('u-nameEn'), role: val('u-role'), jobTitle: val('u-jobTitle'),
        email: val('u-email'), phone: val('u-phone'), isActive: document.getElementById('u-active').checked, pin
      });
    };
  }

  function openBranchForm(b) {
    const cur = b || { status: 'Active' };
    APP.openModal(`
      <h3 class="card-title">${esc(I18N.t(b ? 'edit' : 'addBranch'))}</h3>
      ${field('b-nameAr', I18N.t('nameAr'), cur.nameAr, 'dir="rtl"')}
      ${field('b-nameEn', I18N.t('nameEn'), cur.nameEn, 'dir="ltr"')}
      ${field('b-loc', I18N.t('locationLabel'), cur.locationText)}
      ${field('b-maps', I18N.t('mapsUrlLabel'), cur.mapsUrl, 'type="url" dir="ltr" placeholder="https://maps.app.goo.gl/..."')}
      ${field('b-budget', I18N.t('budgetLabel'), cur.monthlyBudgetKwd, 'type="number" min="0" step="0.001" dir="ltr"')}
      <label class="check-row"><input id="b-active" type="checkbox" ${cur.status === 'Active' ? 'checked' : ''} /> ${esc(I18N.t('active'))}</label>
      ${formButtons()}
    `);
    document.getElementById('frm-cancel').onclick = APP.closeModal;
    document.getElementById('frm-save').onclick = () => submitAdmin('adminSaveBranch', {
      branchId: b ? b.branchId : '', nameAr: val('b-nameAr'), nameEn: val('b-nameEn'), locationText: val('b-loc'), mapsUrl: val('b-maps'),
      monthlyBudgetKwd: val('b-budget'), status: document.getElementById('b-active').checked ? 'Active' : 'Inactive'
    });
  }

  function openResponsiblesForm(b) {
    const a = ext.admin;
    const candidates = a.users.filter((u) => u.role === 'Branch Responsible' && u.isActive);
    const current = {};
    b.responsibles.forEach((r) => { current[r.userId] = r.jobTitle; });
    APP.openModal(`
      <h3 class="card-title">${esc(I18N.t('responsiblesTitle'))} — ${esc(nm(b, 'name'))}</h3>
      <div class="muted-sm" style="margin-bottom:10px;">${esc(I18N.t('responsiblesHint'))}</div>
      ${candidates.length ? candidates.map((u) => `
        <div class="resp-row">
          <label class="check-row" style="flex:1;margin:0;"><input type="checkbox" data-resp-user="${esc(u.userId)}" ${current[u.userId] !== undefined ? 'checked' : ''} /> ${esc(nm(u, 'name'))}</label>
          <select class="form-control" style="max-width:150px;" data-resp-title="${esc(u.userId)}">
            ${a.jobTitles.map((j) => `<option value="${esc(j)}" ${(current[u.userId] || u.jobTitle) === j ? 'selected' : ''}>${esc(I18N.tMap('jobTitles', j))}</option>`).join('')}
          </select>
        </div>`).join('') : `<div class="alert alert-warning">${esc(I18N.t('noBranchUsers'))}</div>`}
      <div class="muted-sm" style="margin:10px 0;">${esc(I18N.t('reloginNote'))}</div>
      ${formButtons()}
    `);
    document.getElementById('frm-cancel').onclick = APP.closeModal;
    document.getElementById('frm-save').onclick = () => {
      const list = [];
      document.querySelectorAll('[data-resp-user]').forEach((cb) => {
        if (cb.checked) {
          const sel = document.querySelector(`[data-resp-title="${cb.dataset.respUser}"]`);
          list.push({ userId: cb.dataset.respUser, jobTitle: sel ? sel.value : '' });
        }
      });
      submitAdmin('adminSetBranchResponsibles', { branchId: b.branchId, responsibles: list });
    };
  }

  /** Add a new manager / assistant manager (or coach / supervisor) straight into one branch. */
  function openBranchPersonForm(b) {
    const a = ext.admin;
    APP.openModal(`
      <h3 class="card-title">${esc(I18N.t('addBranchPersonTitle'))} ${esc(nm(b, 'name'))}</h3>
      ${field('p-nameAr', I18N.t('nameAr'), '', 'dir="rtl"')}
      ${field('p-nameEn', I18N.t('nameEn'), '', 'dir="ltr"')}
      <div class="form-group"><label class="form-label" for="p-jobTitle">${esc(I18N.t('jobTitleLabel'))}</label>
        <select id="p-jobTitle" class="form-control">${a.jobTitles.map((j) => `<option value="${esc(j)}">${esc(I18N.tMap('jobTitles', j))}</option>`).join('')}</select></div>
      ${field('p-phone', I18N.t('phoneLabel'), '', 'type="tel" dir="ltr" autocomplete="off"')}
      ${field('p-email', I18N.t('emailLabel'), '', 'type="email" dir="ltr" autocomplete="off"')}
      ${field('p-pin', I18N.t('pinRequiredNew'), '', 'type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" dir="ltr"')}
      <div class="muted-sm" style="margin:-6px 0 10px;">${esc(I18N.t('pinHint'))}</div>
      ${formButtons()}
    `);
    document.getElementById('frm-cancel').onclick = APP.closeModal;
    document.getElementById('frm-save').onclick = async () => {
      const pin = val('p-pin');
      if (!val('p-nameAr') || !val('p-nameEn')) { APP.showToast(I18N.formatError('NAME_REQUIRED')); return; }
      if (!/^\d{4,8}$/.test(pin)) { APP.showToast(I18N.formatError('PIN_INVALID_FORMAT')); return; }
      const btn = document.getElementById('frm-save');
      btn.disabled = true;
      try {
        const jobTitle = val('p-jobTitle');
        const created = await API.call('adminSaveUser', {
          nameAr: val('p-nameAr'), nameEn: val('p-nameEn'), role: 'Branch Responsible', jobTitle,
          phone: val('p-phone'), email: val('p-email'), isActive: true, pin
        });
        await API.call('adminSetBranchResponsibles', {
          branchId: b.branchId,
          responsibles: b.responsibles.concat([{ userId: created.userId, jobTitle }])
        });
        APP.closeModal();
        APP.showToast(I18N.t('saved'));
        await loadAdmin();
      } catch (e) {
        APP.showToast(I18N.formatError(e.message), 4500);
        btn.disabled = false;
      }
    };
  }

  function openCategoryForm(c) {
    const cur = c || { isActive: true, hasEquipmentSubfields: false, sortOrder: (ext.admin.categories.length + 1) };
    APP.openModal(`
      <h3 class="card-title">${esc(I18N.t(c ? 'edit' : 'addCategory'))}</h3>
      ${field('c-nameAr', I18N.t('nameAr'), cur.nameAr, 'dir="rtl"')}
      ${field('c-nameEn', I18N.t('nameEn'), cur.nameEn, 'dir="ltr"')}
      ${field('c-sort', I18N.t('sortOrderLabel'), cur.sortOrder, 'type="number" min="1" dir="ltr"')}
      <label class="check-row"><input id="c-equip" type="checkbox" ${cur.hasEquipmentSubfields ? 'checked' : ''} /> ${esc(I18N.t('hasEquipLabel'))}</label>
      <label class="check-row"><input id="c-active" type="checkbox" ${cur.isActive ? 'checked' : ''} /> ${esc(I18N.t('active'))}</label>
      ${formButtons()}
    `);
    document.getElementById('frm-cancel').onclick = APP.closeModal;
    document.getElementById('frm-save').onclick = () => submitAdmin('adminSaveCategory', {
      categoryId: c ? c.categoryId : '', nameAr: val('c-nameAr'), nameEn: val('c-nameEn'), sortOrder: val('c-sort'),
      hasEquipmentSubfields: document.getElementById('c-equip').checked, isActive: document.getElementById('c-active').checked
    });
  }

  // -------------------------------------------------------------------------
  // Public API used by app.js
  // -------------------------------------------------------------------------
  window.FLARE_EXT = {
    load(route) {
      if (route === 'dashboard') loadDashboard();
      else if (route === 'reports') loadReport();
      else if (route === 'admin') loadAdmin();
    },
    render(route) {
      const r = role();
      const allowed = (route === 'dashboard' && (r === 'GS Manager' || r === 'Owner')) ||
        (route === 'reports' && (r === 'GS Manager' || r === 'Owner' || r === 'Finance')) ||
        (route === 'admin' && r === 'GS Manager');
      if (!allowed) { APP.navigate('home'); return; }
      if (route === 'dashboard') renderDashboard();
      else if (route === 'reports') renderReports();
      else renderAdmin();
    },
    _test: { reportTables, reportBodyHtml, tablesToAoa, periodTitle }
  };
})();
