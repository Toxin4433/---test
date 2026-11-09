-- CRM foundation for ООО «Новая Реальность».
-- Apply ONLY to a separate TEST Supabase project first.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  role text not null default 'customer' check (role in ('customer', 'manager', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence if not exists public.order_number_seq;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  customer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  type text not null default 'quote' check (type in ('quote', 'sample', 'custom')),
  status text not null default 'new' check (status in ('new', 'progress', 'waiting', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  customer_name text not null,
  company text not null default '',
  phone text not null default '',
  email text not null default '',
  city text not null default '',
  inn text not null default '',
  items jsonb not null default '[]'::jsonb,
  comment text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  assigned_to uuid references public.profiles(id) on delete set null,
  manager_note text not null default ''
);

create index if not exists orders_customer_id_created_at_idx on public.orders (customer_id, created_at desc);
create index if not exists orders_assigned_to_created_at_idx on public.orders (assigned_to, created_at desc);
create index if not exists orders_status_created_at_idx on public.orders (status, created_at desc);

create or replace function public.set_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'NR-' || to_char(coalesce(new.created_at, now()) at time zone 'UTC', 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_set_number on public.orders;
create trigger orders_set_number
before insert on public.orders
for each row execute function public.set_order_number();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100),
    'customer',
    true
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.is_active then p.role else null end
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

-- A guest may submit a request. If an authenticated customer is placing it,
-- the order is linked to their account. The browser never inserts into orders directly.
create or replace function public.create_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_phone text;
  v_email text;
  v_type text;
  v_items jsonb;
  v_attachments jsonb;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Некорректные данные заявки';
  end if;
  if octet_length(p_payload::text) > 40000 then
    raise exception 'Слишком большой запрос';
  end if;

  v_name := left(btrim(coalesce(p_payload ->> 'name', '')), 100);
  v_phone := left(btrim(coalesce(p_payload ->> 'phone', '')), 40);
  v_email := left(btrim(coalesce(p_payload ->> 'email', '')), 160);
  v_type := coalesce(p_payload ->> 'type', 'quote');
  v_items := coalesce(p_payload -> 'items', '[]'::jsonb);
  v_attachments := coalesce(p_payload -> 'attachments', '[]'::jsonb);

  if v_name = '' then raise exception 'Укажите имя'; end if;
  if v_phone = '' and v_email = '' then raise exception 'Укажите телефон или email'; end if;
  if v_email <> '' and v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Проверьте адрес email';
  end if;
  if v_type not in ('quote', 'sample', 'custom') then raise exception 'Неизвестный тип заявки'; end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) < 1 or jsonb_array_length(v_items) > 40 then
    raise exception 'В заявке должно быть от 1 до 40 позиций';
  end if;
  if jsonb_typeof(v_attachments) <> 'array' or jsonb_array_length(v_attachments) > 3 then
    raise exception 'Некорректный список приложений';
  end if;

  if auth.uid() is not null then
    if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'customer' and p.is_active) then
      v_customer_id := auth.uid();
    elsif exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_active) then
      raise exception 'Учётная запись отключена';
    end if;
  end if;

  insert into public.orders (
    customer_id, type, customer_name, company, phone, email, city, inn,
    items, comment, attachments
  ) values (
    v_customer_id,
    v_type,
    v_name,
    left(btrim(coalesce(p_payload ->> 'company', '')), 160),
    v_phone,
    v_email,
    left(btrim(coalesce(p_payload ->> 'city', '')), 120),
    left(btrim(coalesce(p_payload ->> 'inn', '')), 12),
    v_items,
    left(btrim(coalesce(p_payload ->> 'comment', '')), 1800),
    v_attachments
  ) returning id, order_number into v_order_id, v_order_number;

  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number, 'created_at', now());
end;
$$;

-- A customer can read only orders explicitly linked to their authenticated account.
-- Manager notes, assignment details, and internal data are deliberately omitted.
create or replace function public.get_my_orders()
returns table (
  id uuid,
  order_number text,
  created_at timestamptz,
  type text,
  status text,
  items jsonb,
  comment text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(public.current_app_role(), '') <> 'customer' then
    raise exception 'Доступ разрешён только клиентскому аккаунту';
  end if;
  return query
    select o.id, o.order_number, o.created_at, o.type, o.status, o.items, o.comment
    from public.orders o
    where o.customer_id = auth.uid()
    order by o.created_at desc
    limit 100;
end;
$$;

-- Admin sees every order. A manager sees only orders assigned to their own user ID.
create or replace function public.get_staff_orders()
returns table (
  id uuid,
  order_number text,
  created_at timestamptz,
  type text,
  status text,
  priority text,
  customer_name text,
  company text,
  phone text,
  email text,
  city text,
  inn text,
  items jsonb,
  comment text,
  attachments jsonb,
  manager_note text,
  assigned_to uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.current_app_role();
begin
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Недостаточно прав';
  end if;
  return query
    select o.id, o.order_number, o.created_at, o.type, o.status, o.priority,
           o.customer_name, o.company, o.phone, o.email, o.city, o.inn,
           o.items, o.comment, o.attachments, o.manager_note, o.assigned_to
    from public.orders o
    where v_role = 'admin' or (v_role = 'manager' and o.assigned_to = auth.uid())
    order by o.created_at desc
    limit 500;
end;
$$;

-- Managers may edit status/priority/internal note only for their assigned order.
-- Admins may additionally assign or unassign an order.
create or replace function public.staff_update_order(
  p_order_id uuid,
  p_status text,
  p_priority text,
  p_manager_note text,
  p_assigned_to uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.current_app_role();
begin
  if v_role is null or v_role not in ('admin', 'manager') then raise exception 'Недостаточно прав'; end if;
  if p_status not in ('new', 'progress', 'waiting', 'done', 'cancelled') then raise exception 'Недопустимый статус'; end if;
  if p_priority not in ('normal', 'high') then raise exception 'Недопустимый приоритет'; end if;

  if v_role = 'manager' then
    update public.orders
      set status = p_status,
          priority = p_priority,
          manager_note = left(coalesce(p_manager_note, ''), 4000),
          updated_at = now()
    where id = p_order_id and assigned_to = auth.uid();
  else
    if p_assigned_to is not null and not exists (
      select 1 from public.profiles p
      where p.id = p_assigned_to and p.role = 'manager' and p.is_active = true
    ) then
      raise exception 'Можно назначить только активного менеджера';
    end if;
    update public.orders
      set status = p_status,
          priority = p_priority,
          manager_note = left(coalesce(p_manager_note, ''), 4000),
          assigned_to = p_assigned_to,
          updated_at = now()
    where id = p_order_id;
  end if;

  if not found then raise exception 'Заявка не найдена или недоступна'; end if;
  return true;
end;
$$;

alter table public.profiles enable row level security;
alter table public.orders enable row level security;

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- Deliberately no direct policies or table grants for orders: all access goes through
-- the checked SECURITY DEFINER RPCs above. There is no browser-side service key.
revoke all on table public.orders from public, anon, authenticated;
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;

grant execute on function public.create_order(jsonb) to anon, authenticated;
grant execute on function public.get_my_orders() to authenticated;
grant execute on function public.get_staff_orders() to authenticated;
grant execute on function public.staff_update_order(uuid, text, text, text, uuid) to authenticated;
revoke all on function public.current_app_role() from public, anon, authenticated;

-- Keep execution explicit. The helper is called internally by SECURITY DEFINER RPCs.

revoke all on function public.create_order(jsonb) from public, anon, authenticated;
revoke all on function public.get_my_orders() from public, anon, authenticated;
revoke all on function public.get_staff_orders() from public, anon, authenticated;
revoke all on function public.staff_update_order(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_order(jsonb) to anon, authenticated;
grant execute on function public.get_my_orders() to authenticated;
grant execute on function public.get_staff_orders() to authenticated;
grant execute on function public.staff_update_order(uuid, text, text, text, uuid) to authenticated;
