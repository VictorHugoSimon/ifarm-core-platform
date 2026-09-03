-- iFarm Core / Neon — 0002
-- Contexto autenticado, RBAC e RLS usando Neon Auth + Data API.
-- Funções internas por usuário não são executáveis pelos papéis de cliente.

create or replace function public.app_current_user_id()
returns uuid
language sql stable security definer
set search_path = ''
as 'select nullif(auth.user_id(), '''')::uuid';

create or replace function public.app_bootstrap_user()
returns uuid
language sql volatile security definer
set search_path = ''
as 'with inserted as (
  insert into public.users(id)
  select nu.id from neon_auth."user" nu
  where nu.id = public.app_current_user_id()
  on conflict (id) do nothing
  returning id
)
select coalesce((select id from inserted), public.app_current_user_id())';

create or replace function public.app_identity_context_for_user(target_user uuid)
returns table(
  tenant_id uuid,
  membership_id uuid,
  role_id uuid,
  core_role text,
  is_ifarm_admin boolean,
  requires_mfa boolean
)
language sql stable security definer
set search_path = ''
as 'with admin_state as (
  select coalesce((select u.is_ifarm_admin from public.users u where u.id = target_user), false) as is_admin
), valid_active as (
  select m.tenant_id, m.id as membership_id, m.role_id, r.code as core_role
  from public.memberships m
  join public.roles r on r.tenant_id = m.tenant_id and r.id = m.role_id
  join public.user_contexts uc on uc.user_id = target_user and uc.active_tenant_id = m.tenant_id
  where m.user_id = target_user and m.status = ''active''
  limit 1
), membership_count as (
  select count(*)::int as cnt
  from public.memberships m
  where m.user_id = target_user and m.status = ''active''
), only_membership as (
  select m.tenant_id, m.id as membership_id, m.role_id, r.code as core_role
  from public.memberships m
  join public.roles r on r.tenant_id = m.tenant_id and r.id = m.role_id
  where m.user_id = target_user
    and m.status = ''active''
    and (select cnt from membership_count) = 1
  limit 1
), chosen as (
  select * from valid_active
  union all
  select * from only_membership where not exists (select 1 from valid_active)
  limit 1
)
select c.tenant_id, c.membership_id, c.role_id, c.core_role, a.is_admin,
       (a.is_admin or coalesce(c.core_role in (''owner'',''tenant_admin'',''admin''), false)) as requires_mfa
from admin_state a
left join chosen c on true';

create or replace function public.app_identity_context()
returns table(
  tenant_id uuid,
  membership_id uuid,
  role_id uuid,
  core_role text,
  is_ifarm_admin boolean,
  requires_mfa boolean
)
language sql stable security definer
set search_path = ''
as 'select * from public.app_identity_context_for_user(public.app_current_user_id())';

create or replace function public.app_current_tenant_id()
returns uuid
language sql stable security definer
set search_path = ''
as 'select c.tenant_id from public.app_identity_context() c limit 1';

create or replace function public.app_is_ifarm_admin()
returns boolean
language sql stable security definer
set search_path = ''
as 'select coalesce((select c.is_ifarm_admin from public.app_identity_context() c limit 1), false)';

create or replace function public.app_has_permission_for_user(target_user uuid, requested_permission text)
returns boolean
language sql stable security definer
set search_path = ''
as 'with ctx as (select * from public.app_identity_context_for_user(target_user))
select coalesce((select c.is_ifarm_admin from ctx c limit 1), false)
  or exists (
    select 1
    from ctx c
    join public.memberships m
      on m.user_id = target_user
     and m.tenant_id = c.tenant_id
     and m.status = ''active''
    join public.role_permissions rp
      on rp.tenant_id = m.tenant_id
     and rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    where p.code = requested_permission
  )';

create or replace function public.app_has_permission(requested_permission text)
returns boolean
language sql stable security definer
set search_path = ''
as 'select public.app_has_permission_for_user(public.app_current_user_id(), requested_permission)';

create or replace function public.app_my_permissions_for_user(target_user uuid)
returns table(code text)
language sql stable security definer
set search_path = ''
as 'with ctx as (select * from public.app_identity_context_for_user(target_user))
select p.code
from public.permissions p
where coalesce((select c.is_ifarm_admin from ctx c limit 1), false)
union
select p.code
from ctx c
join public.memberships m
  on m.user_id = target_user
 and m.tenant_id = c.tenant_id
 and m.status = ''active''
join public.role_permissions rp
  on rp.tenant_id = m.tenant_id
 and rp.role_id = m.role_id
join public.permissions p on p.id = rp.permission_id';

create or replace function public.app_my_permissions()
returns table(code text)
language sql stable security definer
set search_path = ''
as 'select * from public.app_my_permissions_for_user(public.app_current_user_id())';

create or replace function public.app_set_active_tenant(requested_tenant uuid)
returns uuid
language sql volatile security definer
set search_path = ''
as 'with actor_ctx as (
  select public.app_current_user_id() as user_id
), valid as (
  select a.user_id, m.tenant_id
  from actor_ctx a
  join public.memberships m
    on m.user_id = a.user_id
   and m.tenant_id = requested_tenant
   and m.status = ''active''
), upserted as (
  insert into public.user_contexts(user_id, active_tenant_id)
  select user_id, tenant_id from valid
  on conflict (user_id) do update
  set active_tenant_id = excluded.active_tenant_id,
      updated_at = now()
  returning active_tenant_id
)
select active_tenant_id from upserted';

revoke all on function public.app_identity_context_for_user(uuid) from public, anonymous, authenticated;
revoke all on function public.app_has_permission_for_user(uuid,text) from public, anonymous, authenticated;
revoke all on function public.app_my_permissions_for_user(uuid) from public, anonymous, authenticated;

grant execute on function public.app_bootstrap_user() to authenticated;
grant execute on function public.app_identity_context() to authenticated;
grant execute on function public.app_current_tenant_id() to authenticated;
grant execute on function public.app_is_ifarm_admin() to authenticated;
grant execute on function public.app_has_permission(text) to authenticated;
grant execute on function public.app_my_permissions() to authenticated;
grant execute on function public.app_set_active_tenant(uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.user_contexts enable row level security;
alter table public.organizations enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;

revoke all on public.tenants, public.users, public.user_contexts, public.organizations,
  public.roles, public.permissions, public.role_permissions, public.memberships
from anonymous;

revoke all on public.tenants, public.users, public.user_contexts, public.organizations,
  public.roles, public.permissions, public.role_permissions, public.memberships
from authenticated;

grant select on public.tenants, public.organizations, public.roles, public.permissions, public.memberships
to authenticated;

create policy tenants_read on public.tenants
for select to authenticated
using (
  public.app_is_ifarm_admin()
  or (
    public.app_current_tenant_id() = id
    and (public.app_has_permission('tenant.read') or public.app_has_permission('tenant.manage'))
  )
);

create policy organizations_read on public.organizations
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and (public.app_has_permission('organization.read') or public.app_has_permission('organization.manage'))
);

create policy roles_read on public.roles
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and (public.app_has_permission('rbac.read') or public.app_has_permission('rbac.manage'))
);

create policy permissions_read on public.permissions
for select to authenticated
using (public.app_current_user_id() is not null);

create policy memberships_read on public.memberships
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and (
    user_id = public.app_current_user_id()
    or public.app_has_permission('user.read')
    or public.app_has_permission('user.manage')
  )
);
