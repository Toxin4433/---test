import { createClient } from '@supabase/supabase-js';

const json = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export default async (request) => {
  const method = request.method.toUpperCase();
  if (!['GET', 'POST', 'PATCH'].includes(method)) return json(405, { error: 'Метод не поддерживается.' });

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return json(503, { error: 'Сервер CRM не настроен: проверьте переменные Supabase в Netlify.' });

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return json(401, { error: 'Требуется вход администратора.' });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData?.user) return json(401, { error: 'Сессия истекла. Войдите снова.' });

  const { data: actor, error: actorError } = await adminClient
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (actorError || !actor || actor.role !== 'admin' || actor.is_active !== true) {
    return json(403, { error: 'Это действие доступно только активному администратору.' });
  }

  try {
    if (method === 'GET') {
      const { data, error } = await adminClient
        .from('profiles')
        .select('id, email, full_name, role, is_active, created_at')
        .in('role', ['manager', 'admin'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return json(200, { users: data || [] });
    }

    let body;
    try { body = await request.json(); }
    catch { return json(400, { error: 'Некорректный JSON в запросе.' }); }

    if (method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const fullName = String(body.full_name || '').trim().slice(0, 100);
      const password = String(body.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Укажите корректный email сотрудника.' });
      if (!fullName) return json(400, { error: 'Укажите имя сотрудника.' });
      if (password.length < 12) return json(400, { error: 'Начальный пароль должен содержать не менее 12 символов.' });

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });
      if (createError) throw createError;

      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: created.user.id,
        email,
        full_name: fullName,
        role: 'manager',
        is_active: true
      }, { onConflict: 'id' });
      if (profileError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }
      return json(201, { user: { id: created.user.id, email, full_name: fullName, role: 'manager', is_active: true } });
    }

    const userId = String(body.id || '').trim();
    if (!userId || typeof body.is_active !== 'boolean') return json(400, { error: 'Нужны ID сотрудника и состояние доступа.' });
    if (userId === actor.id) return json(400, { error: 'Нельзя отключить собственную учётную запись администратора.' });

    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.role !== 'manager') return json(404, { error: 'Менеджер не найден.' });

    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ is_active: body.is_active })
      .eq('id', userId);
    if (updateError) throw updateError;
    return json(200, { ok: true, id: userId, is_active: body.is_active });
  } catch (error) {
    console.error('admin-users error:', error);
    return json(400, { error: error.message || 'Не удалось выполнить действие.' });
  }
};
