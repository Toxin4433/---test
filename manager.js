import { getSupabase, getActiveUserProfile, callAdminApi } from './auth.js';

(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STATUS = {
    new: { label: 'Новая', cls: 'status-new' },
    progress: { label: 'В работе', cls: 'status-progress' },
    waiting: { label: 'Ожидает клиента', cls: 'status-waiting' },
    done: { label: 'Завершена', cls: 'status-done' },
    cancelled: { label: 'Отменена', cls: 'status-cancelled' }
  };
  const TYPE = { quote: 'Расчёт стоимости', sample: 'Запрос образца', custom: 'Изготовление' };
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fmtDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date); };
  const fmtDateTime = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date); };

  let supabase = null;
  let currentProfile = null;
  let requests = [];
  let employees = [];
  let activeRequestId = null;
  let toastTimer = null;

  const toast = message => {
    const node = $('#managerToast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3000);
  };
  const setLoginStatus = (message, isError = false) => {
    const node = $('#staffLoginStatus');
    node.textContent = message;
    node.classList.toggle('is-error', isError);
  };
  const statusBadge = status => { const item = STATUS[status] || STATUS.new; return `<span class="status-pill ${item.cls}">${item.label}</span>`; };

  function switchView(view) {
    if (view === 'employees' && currentProfile?.role !== 'admin') return;
    $$('[data-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === view));
    $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    $('#pageTitle').textContent = view === 'overview' ? 'Обзор заявок' : view === 'samples' ? 'Запросы образцов' : view === 'employees' ? 'Сотрудники' : 'Все заявки';
    $('#managerSidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'employees' && currentProfile?.role === 'admin') loadEmployees().catch(error => toast(error.message));
  }

  function visibleRequests(mode = 'all') {
    const q = ($('#requestSearch')?.value || '').trim().toLowerCase();
    const status = $('#statusFilter')?.value || 'all';
    const type = mode === 'samples' ? 'sample' : ($('#typeFilter')?.value || 'all');
    return requests.filter(request => {
      if (status !== 'all' && request.status !== status) return false;
      if (type !== 'all' && request.type !== type) return false;
      const haystack = [request.code, request.client?.name, request.client?.company, request.client?.phone, request.client?.email, request.client?.city, ...request.items.map(item => item.name)].join(' ').toLowerCase();
      return !q || haystack.includes(q);
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function renderMetrics() {
    $('#metricTotal').textContent = String(requests.length);
    $('#metricNew').textContent = String(requests.filter(item => item.status === 'new').length);
    $('#metricProgress').textContent = String(requests.filter(item => item.status === 'progress').length);
    $('#metricSamples').textContent = String(requests.filter(item => item.type === 'sample').length);
    $('#sidebarRequestCount').textContent = String(requests.length);
  }

  function renderRecent() {
    const recent = [...requests].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
    $('#recentList').innerHTML = recent.map(request => `<article class="recent-row" tabindex="0" role="button" data-open-request="${safe(request.id)}">
      <div><span class="recent-title">${safe(request.client.company || request.client.name || 'Без названия')}</span><span class="recent-sub">${safe(request.code)} · ${safe(TYPE[request.type] || 'Запрос')}</span></div>
      <div class="recent-right"><span class="recent-date">${fmtDate(request.date)}</span>${statusBadge(request.status)}</div>
    </article>`).join('') || '<p class="no-results">В вашей рабочей области пока нет заявок.</p>';
  }

  function renderTable() {
    const list = visibleRequests();
    $('#requestTableBody').innerHTML = list.map(request => `<tr data-open-request="${safe(request.id)}">
      <td><span class="request-code">${safe(request.code)}</span>${request.priority === 'high' ? '<span class="client-sub">Высокий приоритет</span>' : ''}</td>
      <td><span class="client-name">${safe(request.client.company || request.client.name || 'Не указан')}</span><span class="client-sub">${safe(request.client.name || '')}</span></td>
      <td><span class="type-tag">${safe(TYPE[request.type] || 'Запрос')}</span></td>
      <td><span class="table-date">${fmtDate(request.date)}</span></td>
      <td>${statusBadge(request.status)}</td>
      <td><button class="row-open" type="button" data-open-request="${safe(request.id)}">Открыть →</button></td>
    </tr>`).join('');
    $('#noResults').hidden = list.length > 0;
  }

  function renderSamples() {
    const list = requests.filter(request => request.type === 'sample').sort((a, b) => new Date(b.date) - new Date(a.date));
    $('#sampleSummary').innerHTML = list.map(request => `<article class="sample-card" tabindex="0" data-open-request="${safe(request.id)}">
      <span class="section-kicker">${safe(request.code)} · ${fmtDate(request.date)}</span>
      <h3>${safe(request.items.map(item => item.name).join(', ') || 'Образцы продукции')}</h3>
      <p>${safe(request.client.company || request.client.name || 'Клиент не указан')} · ${safe(STATUS[request.status]?.label || 'Новая')}</p>
    </article>`).join('') || '<div class="manager-card">Пока нет запросов образцов в доступной вам области.</div>';
  }

  function render() { renderMetrics(); renderRecent(); renderTable(); renderSamples(); }

  function closeDetail() {
    $('#requestDetail').classList.remove('open');
    $('#requestDetail').setAttribute('aria-hidden', 'true');
    $('#detailBackdrop').hidden = true;
    activeRequestId = null;
  }

  function openDetail(id) {
    const request = requests.find(item => item.id === id);
    if (!request) return;
    activeRequestId = id;
    $('#detailNumber').textContent = request.code;
    const client = request.client || {};
    const itemsMarkup = request.items.map(item => `<div class="detail-item"><b>${safe(item.name)} · ${safe(item.quantity || 1)} ${safe(item.unit || 'шт.')}</b><small>${safe(item.description || '')}${item.details ? `\n${safe(item.details)}` : ''}</small></div>`).join('') || '<p>Позиции не указаны</p>';
    const attachmentMarkup = (request.attachments || []).map(file => `<div class="detail-pair"><span>Файл</span><b>${safe(file.name || 'Приложение')} · ${safe(Math.round((Number(file.size_bytes) || 0) / 1024))} КБ</b></div>`).join('') || '<p style="font-size:9px;color:#91a0a5">Нет приложений</p>';
    const assignmentMarkup = currentProfile.role === 'admin' ? `<div class="detail-field" style="margin-top:12px"><label for="detailAssignee">Ответственный менеджер</label><select id="detailAssignee"><option value="">Не назначена</option>${employees.filter(person => person.role === 'manager' && person.is_active).map(person => `<option value="${safe(person.id)}" ${request.assigned_to === person.id ? 'selected' : ''}>${safe(person.full_name || person.email)}</option>`).join('')}</select></div>` : `<p style="font-size:8px;color:#758991;margin:10px 0 0">Заявка назначена вам. Переназначить её может только администратор.</p>`;
    $('#detailContent').innerHTML = `
      <div class="detail-block"><h3>КЛИЕНТ</h3>
        <div class="detail-pair"><span>Контакт</span><b>${safe(client.name || 'Не указан')}</b></div>
        <div class="detail-pair"><span>Компания</span><b>${safe(client.company || 'Не указана')}</b></div>
        <div class="detail-pair"><span>Телефон</span><b>${safe(client.phone || 'Не указан')}</b></div>
        <div class="detail-pair"><span>Email</span><b>${safe(client.email || 'Не указан')}</b></div>
        <div class="detail-pair"><span>Город</span><b>${safe(client.city || 'Не указан')}</b></div>
        <div class="detail-pair"><span>ИНН</span><b>${safe(client.inn || 'Не указан')}</b></div>
      </div>
      <div class="detail-block"><h3>СОСТАВ ЗАПРОСА</h3><div class="detail-items">${itemsMarkup}</div></div>
      <div class="detail-block"><h3>КОММЕНТАРИЙ КЛИЕНТА</h3><p style="font-size:10px;line-height:1.7;color:#607780;white-space:pre-wrap">${safe(request.comment || 'Не указан')}</p></div>
      <div class="detail-block"><h3>ПРИЛОЖЕННЫЕ ФАЙЛЫ</h3>${attachmentMarkup}<p style="font-size:8px;color:#9b845f;line-height:1.5">В этой версии в CRM сохраняются только метаданные файлов, не сами документы.</p></div>
      <div class="detail-block"><h3>ОБРАБОТКА ЗАЯВКИ</h3>
        <div class="detail-controls">
          <div class="detail-field"><label for="detailStatus">Статус</label><select id="detailStatus">${Object.entries(STATUS).map(([key, value]) => `<option value="${key}" ${request.status === key ? 'selected' : ''}>${value.label}</option>`).join('')}</select></div>
          <div class="detail-field"><label for="detailPriority">Приоритет</label><select id="detailPriority"><option value="normal" ${request.priority !== 'high' ? 'selected' : ''}>Обычный</option><option value="high" ${request.priority === 'high' ? 'selected' : ''}>Высокий</option></select></div>
        </div>
        ${assignmentMarkup}
        <div class="detail-field" style="margin-top:12px"><label for="detailNote">Внутренняя заметка менеджера</label><textarea id="detailNote" placeholder="Например: перезвонить, уточнить параметры, подготовить образец…">${safe(request.note || '')}</textarea></div>
        <button type="button" class="detail-save" id="saveRequestChanges">Сохранить изменения в CRM</button>
        <div class="detail-links">${client.phone ? `<a href="tel:${safe(client.phone.replace(/[^+\d]/g, ''))}">Позвонить</a>` : ''}${client.email ? `<a href="mailto:${safe(client.email)}">Написать email</a>` : ''}</div>
      </div>`;
    $('#requestDetail').classList.add('open');
    $('#requestDetail').setAttribute('aria-hidden', 'false');
    $('#detailBackdrop').hidden = false;
  }

  async function loadOrders() {
    const { data, error } = await supabase.rpc('get_staff_orders');
    if (error) throw error;
    requests = (data || []).map(row => ({
      id: row.id,
      code: row.order_number,
      date: row.created_at,
      type: row.type,
      status: row.status,
      priority: row.priority,
      client: { name: row.customer_name, company: row.company, phone: row.phone, email: row.email, city: row.city, inn: row.inn },
      items: Array.isArray(row.items) ? row.items : [],
      comment: row.comment || '',
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      note: row.manager_note || '',
      assigned_to: row.assigned_to
    }));
    render();
  }

  async function loadEmployees() {
    if (currentProfile.role !== 'admin') return;
    $('#employeeList').innerHTML = '<p class="no-results">Загружаем сотрудников…</p>';
    const result = await callAdminApi(supabase, 'GET');
    employees = result.users || [];
    const rows = employees.map(person => `<div class="employee-row">
      <div class="employee-person"><span class="employee-avatar">${safe((person.full_name || person.email || 'С').slice(0, 1).toUpperCase())}</span><div><b>${safe(person.full_name || 'Без имени')}</b><small>${safe(person.email)}</small></div></div>
      <span class="employee-role">${person.role === 'admin' ? 'Администратор' : 'Менеджер'}</span>
      <span class="employee-state ${person.is_active ? 'is-active' : 'is-disabled'}">${person.is_active ? 'Активен' : 'Отключён'}</span>
      ${person.role === 'manager' ? `<button type="button" class="employee-toggle" data-toggle-employee="${safe(person.id)}" data-next-active="${person.is_active ? 'false' : 'true'}">${person.is_active ? 'Отключить' : 'Включить'}</button>` : '<span class="employee-protected">Защищён</span>'}
    </div>`).join('');
    $('#employeeList').innerHTML = rows || '<p class="no-results">Сотрудников пока нет.</p>';
  }

  async function refreshAll() {
    try {
      await loadOrders();
      if (currentProfile.role === 'admin' && !$('#employeesView').classList.contains('active')) {
        // Refresh the list only when it has already been opened at least once.
      }
      toast('Заявки обновлены из CRM.');
    } catch (error) {
      toast(error.message || 'Не удалось загрузить заявки.');
      if (/сессия|доступ|прав/i.test(error.message || '')) await signOut();
    }
  }

  async function saveRequestChanges() {
    const request = requests.find(item => item.id === activeRequestId);
    if (!request) return;
    const saveButton = $('#saveRequestChanges');
    saveButton.disabled = true;
    saveButton.textContent = 'Сохраняем…';
    try {
      const payload = {
        p_order_id: request.id,
        p_status: $('#detailStatus').value,
        p_priority: $('#detailPriority').value,
        p_manager_note: $('#detailNote').value.trim(),
        p_assigned_to: currentProfile.role === 'admin' ? ($('#detailAssignee').value || null) : null
      };
      const { error } = await supabase.rpc('staff_update_order', payload);
      if (error) throw error;
      closeDetail();
      await loadOrders();
      toast('Изменения сохранены в CRM.');
    } catch (error) {
      toast(error.message || 'Не удалось сохранить изменения.');
    } finally {
      if ($('#saveRequestChanges')) { $('#saveRequestChanges').disabled = false; $('#saveRequestChanges').textContent = 'Сохранить изменения в CRM'; }
    }
  }

  async function createManager(event) {
    event.preventDefault();
    const form = $('#createManagerForm');
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    const status = $('#createManagerStatus');
    button.disabled = true;
    status.textContent = 'Создаём учётную запись…';
    try {
      const result = await callAdminApi(supabase, 'POST', {
        full_name: String(values.get('full_name') || '').trim(),
        email: String(values.get('email') || '').trim(),
        password: String(values.get('password') || '')
      });
      form.reset();
      status.textContent = `Создан аккаунт менеджера ${result.user.email}. Передайте сотруднику начальный пароль безопасным способом.`;
      await loadEmployees();
      toast('Менеджер добавлен.');
    } catch (error) {
      status.textContent = error.message || 'Не удалось создать менеджера.';
    } finally { button.disabled = false; }
  }

  async function toggleEmployee(id, isActive) {
    try {
      await callAdminApi(supabase, 'PATCH', { id, is_active: isActive });
      await loadEmployees();
      toast(isActive ? 'Доступ менеджера включён.' : 'Доступ менеджера отключён.');
    } catch (error) { toast(error.message || 'Не удалось изменить доступ.'); }
  }

  async function signOut() {
    closeDetail();
    if (supabase) await supabase.auth.signOut();
    $('#managerApp').hidden = true;
    $('#managerAuthGate').hidden = false;
    currentProfile = null;
    requests = [];
    setLoginStatus('Вы вышли из рабочего кабинета.');
  }

  async function activateStaff(context) {
    currentProfile = context.profile;
    const isAdmin = currentProfile.role === 'admin';
    if (!isAdmin && currentProfile.role !== 'manager') throw new Error('Это клиентский аккаунт. Для него предназначен личный кабинет клиента.');
    $('#managerAuthGate').hidden = true;
    $('#managerApp').hidden = false;
    $('#staffName').textContent = currentProfile.full_name || context.user.email;
    $('#staffAvatar').textContent = (currentProfile.full_name || context.user.email || 'С').slice(0, 1).toUpperCase();
    $('#staffRoleLabel').textContent = isAdmin ? 'Администратор' : 'Менеджер';
    $('#staffRoleChip').innerHTML = `<i></i> ${isAdmin ? 'АДМИНИСТРАТОР' : 'МЕНЕДЖЕР'}`;
    $('#accessScopeText').textContent = isAdmin
      ? 'Вы видите все заявки, можете назначать их менеджерам и управлять учётными записями сотрудников.'
      : 'Вы видите только заявки, назначенные вашей учётной записи. Чужие заявки и внутренние данные других менеджеров недоступны.';
    $$('[data-admin-only]').forEach(node => { node.hidden = !isAdmin; });
    if (isAdmin) $('#employeesView').hidden = false;
    $('#todayLabel').textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date());
    $('#weekdayLabel').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(new Date()).toLocaleUpperCase('ru-RU');
    await refreshAll();
    if (isAdmin) { try { await loadEmployees(); } catch (error) { toast(`Заявки доступны, но список сотрудников не загрузился: ${error.message}`); } }
  }

  $('#staffLoginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    button.disabled = true;
    setLoginStatus('Проверяем учётную запись…');
    try {
      supabase = supabase || await getSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email: String(values.get('email') || '').trim(), password: String(values.get('password') || '') });
      if (error) throw error;
      const context = await getActiveUserProfile(supabase);
      if (!context) throw new Error('Не удалось получить профиль пользователя.');
      if (!['admin', 'manager'].includes(context.profile.role)) {
        await supabase.auth.signOut();
        throw new Error('У этой учётной записи нет прав сотрудника. Используйте личный кабинет клиента.');
      }
      await activateStaff(context);
      form.reset();
    } catch (error) {
      setLoginStatus(error.message || 'Не удалось выполнить вход.', true);
    } finally { button.disabled = false; }
  });

  document.addEventListener('click', async event => {
    const nav = event.target.closest('[data-view]');
    if (nav) { switchView(nav.dataset.view); return; }
    const go = event.target.closest('[data-go-view]');
    if (go) { switchView(go.dataset.goView); return; }
    const open = event.target.closest('[data-open-request]');
    if (open) {
      const requestedId = open.dataset.openRequest;
      try { await loadOrders(); openDetail(requestedId); }
      catch (error) { toast(error.message || 'Не удалось проверить доступ к заявке.'); }
      return;
    }
    const toggle = event.target.closest('[data-toggle-employee]');
    if (toggle) { await toggleEmployee(toggle.dataset.toggleEmployee, toggle.dataset.nextActive === 'true'); return; }
    if (event.target.id === 'detailBackdrop' || event.target.id === 'detailClose') { closeDetail(); return; }
    if (event.target.id === 'saveRequestChanges') { await saveRequestChanges(); return; }
    if (event.target.id === 'refreshOrders' || event.target.id === 'quickRefresh') { await refreshAll(); return; }
    if (event.target.id === 'refreshEmployees') { await loadEmployees().then(() => toast('Список сотрудников обновлён.')).catch(error => toast(error.message)); return; }
    if (event.target.id === 'staffLogout') { await signOut(); return; }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeDetail();
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open-request]')) {
      event.preventDefault();
      openDetail(event.target.dataset.openRequest);
    }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && currentProfile) refreshAll(); });
  window.addEventListener('focus', () => { if (currentProfile) refreshAll(); });
  $('#createManagerForm').addEventListener('submit', createManager);
  $('#requestSearch').addEventListener('input', renderTable);
  $('#statusFilter').addEventListener('change', renderTable);
  $('#typeFilter').addEventListener('change', renderTable);
  $('#sidebarToggle').addEventListener('click', () => $('#managerSidebar').classList.toggle('open'));
  $('#exportCsv').addEventListener('click', () => {
    const rows = [['Номер', 'Дата', 'Тип', 'Статус', 'Приоритет', 'Компания', 'Контакт', 'Телефон', 'Email', 'Город', 'Позиции', 'Комментарий']];
    visibleRequests().forEach(request => rows.push([
      request.code, fmtDateTime(request.date), TYPE[request.type], STATUS[request.status]?.label,
      request.priority === 'high' ? 'Высокий' : 'Обычный', request.client.company, request.client.name,
      request.client.phone, request.client.email, request.client.city,
      request.items.map(item => `${item.name} — ${item.quantity} ${item.unit || 'шт.'}`).join('; '), request.comment
    ]));
    const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'nr-crm-requests.csv'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('CSV подготовлен.');
  });

  (async () => {
    try {
      supabase = await getSupabase();
      const context = await getActiveUserProfile(supabase);
      if (context) {
        if (!['admin', 'manager'].includes(context.profile.role)) {
          await supabase.auth.signOut();
          setLoginStatus('Клиентский аккаунт не имеет доступа к кабинету сотрудников.');
          return;
        }
        await activateStaff(context);
      }
    } catch (error) {
      setLoginStatus(error.message || 'Не удалось подключиться к тестовой CRM.', true);
    }
  })();
})();
