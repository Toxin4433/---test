import { getSupabase, getActiveUserProfile, formatOrderStatus } from './auth.js';

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const typeLabel = value => ({ quote: 'Расчёт стоимости', sample: 'Запрос образца', custom: 'Изготовление' })[value] || 'Запрос';
const dateLabel = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};

const authPanel = $('#accountAuthPanel');
const dashboard = $('#customerDashboard');
const statusBox = $('#accountStatus');
const loginForm = $('#customerLoginForm');
const signupForm = $('#customerSignupForm');
const resetForm = $('#passwordResetForm');
let supabase;

function showMessage(message, isError = false) {
  statusBox.textContent = message;
  statusBox.hidden = !message;
  statusBox.classList.toggle('is-error', isError);
}

function setAuthMode(mode) {
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.classList.toggle('active', button.dataset.authMode === mode));
  loginForm.hidden = mode !== 'login';
  signupForm.hidden = mode !== 'signup';
  resetForm.hidden = true;
  $('#authHeading').textContent = mode === 'signup' ? 'Создать аккаунт' : 'Войти в аккаунт';
  $('#authIntro').textContent = mode === 'signup'
    ? 'Регистрация добровольная. Для отправки заявки она не нужна.'
    : 'Войдите, чтобы посмотреть свои заявки. Для входа сотрудника используйте отдельный портал.';
  $('#forgotPasswordButton').hidden = mode !== 'login';
  showMessage('');
}

function renderOrders(orders) {
  const target = $('#customerOrders');
  if (!orders?.length) {
    target.innerHTML = '<div class="crm-empty">Пока нет заявок, привязанных к вашему аккаунту.<br>Новый запрос можно оформить в Центре заказов после входа.</div>';
    return;
  }
  target.innerHTML = orders.map(order => {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsMarkup = items.map(item => `<li>${escapeHtml(item.name || 'Позиция')} — ${escapeHtml(item.quantity || 1)} ${escapeHtml(item.unit || 'шт.')}</li>`).join('');
    return `<article class="customer-order-card">
      <div class="customer-order-top"><strong>${escapeHtml(order.order_number)}</strong><span class="crm-status-pill">${escapeHtml(formatOrderStatus(order.status))}</span></div>
      <p>${escapeHtml(typeLabel(order.type))} · ${escapeHtml(dateLabel(order.created_at))}</p>
      <ul class="customer-order-items">${itemsMarkup || '<li>Состав заявки не указан</li>'}</ul>
      ${order.comment ? `<p><b>Ваш комментарий:</b> ${escapeHtml(order.comment)}</p>` : ''}
    </article>`;
  }).join('');
}

async function loadDashboard() {
  const context = await getActiveUserProfile(supabase);
  if (!context) {
    dashboard.hidden = true;
    authPanel.hidden = false;
    return;
  }
  if (context.profile.role !== 'customer') {
    await supabase.auth.signOut();
    throw new Error('Это не клиентский аккаунт. Для сотрудников предусмотрен отдельный вход: «Для сотрудников».');
  }
  authPanel.hidden = true;
  dashboard.hidden = false;
  $('#customerName').textContent = context.profile.full_name || context.user.email || 'клиент';
  $('#customerEmail').textContent = context.profile.email || context.user.email || '';
  $('#customerOrders').innerHTML = '<div class="crm-loading">Загружаем ваши заявки…</div>';
  const { data, error } = await supabase.rpc('get_my_orders');
  if (error) throw error;
  renderOrders(data || []);
  showMessage('');
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    showMessage('Выполняем вход…');
    const values = new FormData(loginForm);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(values.get('email') || '').trim(),
      password: String(values.get('password') || '')
    });
    if (error) throw error;
    await loadDashboard();
  } catch (error) {
    showMessage(error.message || 'Не удалось войти.', true);
  } finally { button.disabled = false; }
});

signupForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!signupForm.reportValidity()) return;
  const values = new FormData(signupForm);
  const password = String(values.get('password') || '');
  if (password !== String(values.get('password_confirm') || '')) {
    showMessage('Пароли не совпадают.', true);
    return;
  }
  const button = signupForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    showMessage('Создаём клиентский аккаунт…');
    const { data, error } = await supabase.auth.signUp({
      email: String(values.get('email') || '').trim(),
      password,
      options: { data: { full_name: String(values.get('full_name') || '').trim() } }
    });
    if (error) throw error;
    if (data.session) {
      await loadDashboard();
    } else {
      setAuthMode('login');
      showMessage('Аккаунт создан. Проверьте почту и подтвердите адрес, затем войдите с паролем. До подтверждения вход может быть недоступен — это зависит от настроек тестового проекта Supabase.');
    }
  } catch (error) {
    showMessage(error.message || 'Не удалось создать аккаунт.', true);
  } finally { button.disabled = false; }
});

$('#forgotPasswordButton').addEventListener('click', async () => {
  const email = String(loginForm.elements.namedItem('email')?.value || '').trim();
  if (!email) { showMessage('Сначала укажите email в форме входа.', true); return; }
  try {
    showMessage('Отправляем письмо для восстановления…');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}?reset=1`
    });
    if (error) throw error;
    showMessage('Письмо для восстановления отправлено, если такой аккаунт существует. Проверьте почту.');
  } catch (error) { showMessage(error.message || 'Не удалось отправить письмо.', true); }
});

resetForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!resetForm.reportValidity()) return;
  try {
    const password = String(new FormData(resetForm).get('password') || '');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    window.history.replaceState({}, '', window.location.pathname);
    setAuthMode('login');
    showMessage('Пароль обновлён. Теперь войдите с новым паролем.');
    await supabase.auth.signOut();
  } catch (error) { showMessage(error.message || 'Не удалось обновить пароль.', true); }
});

$('#customerLogout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  dashboard.hidden = true;
  authPanel.hidden = false;
  setAuthMode('login');
  showMessage('Вы вышли из аккаунта.');
});

document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));

(async () => {
  try {
    supabase = await getSupabase();
    await supabase.auth.getSession(); // wait for Supabase to process a password-recovery redirect
    const isPasswordRecovery = new URLSearchParams(window.location.search).get('reset') === '1';
    if (isPasswordRecovery) {
      loginForm.hidden = true;
      signupForm.hidden = true;
      resetForm.hidden = false;
      $('#authHeading').textContent = 'Новый пароль';
      $('#authIntro').textContent = 'Задайте новый пароль для вашего клиентского аккаунта.';
      $('#forgotPasswordButton').hidden = true;
      authPanel.hidden = false;
      return;
    }
    await loadDashboard();
  } catch (error) { showMessage(error.message || 'Не удалось подключиться к CRM.', true); }
})();
