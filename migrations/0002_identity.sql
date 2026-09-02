-- iFarm Core — Migration 0002
-- Integração com Supabase Auth, espelhamento de usuário e Custom Access Token Hook.

-- Garante vínculo entre o perfil do Core e a identidade gerenciada pelo Supabase Auth.
alter table public.users
  add constraint users_auth_user_fk
  foreign key (id) references auth.users(id) on delete cascade;

-- Espelha os campos mínimos do usuário autenticado no domínio Core.
create or replace function public.sync_auth_user_to_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users(id, email, full_name, phone, avatar_url)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@unknown.local'),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuário'
    ),
    new.phone,
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    phone = excluded.phone,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return new;
end;
$$;

revoke execute on function public.sync_auth_user_to_core() from public, anon, authenticated;

drop trigger if exists on_auth_user_synced_to_core on auth.users;
create trigger on_auth_user_synced_to_core
after insert or update of email, phone, raw_user_meta_data
on auth.users
for each row execute function public.sync_auth_user_to_core();

-- O Auth Hook precisa consultar a identidade e memberships, mas não deve ter escrita nesses dados.
grant usage on schema public to supabase_auth_admin;
grant select on public.users, public.memberships, public.roles to supabase_auth_admin;

create policy auth_hook_users_read
on public.users for select
to supabase_auth_admin
using (true);

create policy auth_hook_memberships_read
on public.memberships for select
to supabase_auth_admin
using (true);

create policy auth_hook_roles_read
on public.roles for select
to supabase_auth_admin
using (true);

-- Adiciona ao JWT apenas contexto validado contra membership ativa.
-- Se o usuário participar de múltiplos tenants, active_tenant_id deve ser definido
-- em auth.users.raw_app_meta_data por um fluxo administrativo seguro antes do refresh do token.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  user_uuid uuid;
  requested_tenant_text text;
  selected_tenant uuid;
  selected_membership uuid;
  selected_role uuid;
  selected_role_code text;
  membership_count integer := 0;
  user_is_admin boolean := false;
  needs_mfa boolean := false;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  user_uuid := (event ->> 'user_id')::uuid;

  select coalesce(u.is_ifarm_admin, false)
  into user_is_admin
  from public.users u
  where u.id = user_uuid;

  user_is_admin := coalesce(user_is_admin, false);

  select nullif(au.raw_app_meta_data ->> 'active_tenant_id', '')
  into requested_tenant_text
  from auth.users au
  where au.id = user_uuid;

  -- A string de app_metadata nunca é convertida diretamente para UUID antes de ser
  -- validada por uma membership real, evitando que metadata inválida interrompa login.
  if requested_tenant_text is not null then
    select m.tenant_id, m.id, m.role_id, r.code
    into selected_tenant, selected_membership, selected_role, selected_role_code
    from public.memberships m
    join public.roles r
      on r.tenant_id = m.tenant_id and r.id = m.role_id
    where m.user_id = user_uuid
      and m.tenant_id::text = requested_tenant_text
      and m.status = 'active'
    limit 1;
  else
    select count(*)
    into membership_count
    from public.memberships m
    where m.user_id = user_uuid and m.status = 'active';

    if membership_count = 1 then
      select m.tenant_id, m.id, m.role_id, r.code
      into selected_tenant, selected_membership, selected_role, selected_role_code
      from public.memberships m
      join public.roles r
        on r.tenant_id = m.tenant_id and r.id = m.role_id
      where m.user_id = user_uuid and m.status = 'active'
      limit 1;
    end if;
  end if;

  needs_mfa := user_is_admin
    or coalesce(selected_role_code in ('owner', 'tenant_admin', 'admin'), false);

  claims := jsonb_set(claims, '{is_ifarm_admin}', to_jsonb(user_is_admin), true);
  claims := jsonb_set(claims, '{requires_mfa}', to_jsonb(needs_mfa), true);

  if selected_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(selected_tenant::text), true);
    claims := jsonb_set(claims, '{membership_id}', to_jsonb(selected_membership::text), true);
    claims := jsonb_set(claims, '{role_id}', to_jsonb(selected_role::text), true);
    claims := jsonb_set(claims, '{core_role}', to_jsonb(selected_role_code), true);
  else
    claims := claims - 'tenant_id' - 'membership_id' - 'role_id' - 'core_role';
  end if;

  return jsonb_build_object('claims', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

-- A ativação do hook é uma configuração do projeto Supabase:
-- Authentication > Hooks > Custom Access Token > public.custom_access_token_hook
