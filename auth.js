// Shared browser-side Supabase client. Only the public/anon key is ever returned here.
// Load the SDK only when CRM is actually needed. This keeps the public catalogue/cart
// usable even when the auth CDN or test backend is temporarily unavailable.
let clientPromise;
let sdkPromise;

async function loadSupabaseSdk() {
  if (!sdkPromise) {
    sdkPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm');
  }
  return sdkPromise;
}

export async function getSupabase() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const response = await fetch('/.netlify/functions/public-config', { cache: 'no-store' });
      const config = await response.json().catch(() => ({}));
      if (!response.ok || !config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error(config.error || 'Не удалось получить настройки тестовой CRM. Запустите проект через Netlify Dev и настройте .env.');
      }
      const { createClient } = await loadSupabaseSdk();
      return createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      });
    })();
  }
  return clientPromise;
}

export async function getActiveUserProfile(supabase) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,is_active')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    throw new Error('Профиль пользователя не найден. Проверьте SQL-триггер создания профиля в тестовой базе.');
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new Error('Учётная запись отключена администратором.');
  }
  return { user: authData.user, profile };
}

export async function callAdminApi(supabase, method = 'GET', payload = null) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessionError || !token) throw new Error('Сессия не найдена. Войдите снова.');

  const response = await fetch('/.netlify/functions/admin-users', {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body: method === 'GET' ? undefined : JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Сервер отклонил запрос.');
  return data;
}

export function formatOrderStatus(status) {
  return ({ new: 'Новая', progress: 'В работе', waiting: 'Ожидает клиента', done: 'Завершена', cancelled: 'Отменена' })[status] || status;
}
