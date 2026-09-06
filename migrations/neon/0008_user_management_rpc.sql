-- iFarm Core / Neon — 0008
-- CORE-007: RPCs seguras para roles, memberships e convites.

alter table public.membership_invitations
  add constraint membership_invitations_token_hash_format_check
  check (token_hash ~ '^[0-9a-f]{64}$');

create unique index membership_invitations_one_pending_per_email_idx
  on public.membership_invitations(tenant_id, email)
  where status = 'pending';

create or replace function public.app_list_roles()
returns table(
  id uuid,
  tenant_id uuid,
  code text,
  name text,
  description text,
  is_system boolean
)
language sql stable security definer
set search_path = ''
as 'select r.id, r.tenant_id, r.code, r.name, r.description, r.is_system
from public.roles r
where r.tenant_id = public.app_current_tenant_id()
  and (public.app_has_permission(''rbac.read'') or public.app_has_permission(''rbac.manage''))
order by r.name';

create or replace function public.app_list_memberships()
returns table(
  id uuid,
  tenant_id uuid,
  organization_id uuid,
  user_id uuid,
  role_id uuid,
  role_code text,
  role_name text,
  status public.membership_status,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  user_name text,
  user_email text,
  email_verified boolean
)
language sql stable security definer
set search_path = ''
as 'select m.id, m.tenant_id, m.organization_id, m.user_id, m.role_id,
           r.code, r.name, m.status, m.invited_at, m.joined_at, m.created_at, m.updated_at,
           nu.name, lower(nu.email), nu."emailVerified"
from public.memberships m
join public.roles r on r.tenant_id = m.tenant_id and r.id = m.role_id
join neon_auth."user" nu on nu.id = m.user_id
where m.tenant_id = public.app_current_tenant_id()
  and (m.user_id = public.app_current_user_id()
       or public.app_has_permission(''user.read'')
       or public.app_has_permission(''user.manage''))
order by nu.name, nu.email';

create or replace function public.app_list_membership_invitations()
returns table(
  id uuid,
  tenant_id uuid,
  email text,
  role_id uuid,
  role_code text,
  organization_id uuid,
  status text,
  expires_at timestamptz,
  invited_by uuid,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as 'select i.id, i.tenant_id, i.email, i.role_id, r.code, i.organization_id,
           case when i.status = ''pending'' and i.expires_at <= now() then ''expired'' else i.status end,
           i.expires_at, i.invited_by, i.accepted_by, i.accepted_at, i.created_at, i.updated_at
from public.membership_invitations i
join public.roles r on r.tenant_id = i.tenant_id and r.id = i.role_id
where i.tenant_id = public.app_current_tenant_id()
  and public.app_has_permission(''user.manage'')
order by i.created_at desc';

revoke all on function public.app_list_roles() from public, anonymous;
revoke all on function public.app_list_memberships() from public, anonymous;
revoke all on function public.app_list_membership_invitations() from public, anonymous;
grant execute on function public.app_list_roles(), public.app_list_memberships(), public.app_list_membership_invitations() to authenticated;

create or replace function public.app_server_create_membership_invitation(
  actor_user uuid,
  invite_email text,
  target_role_id uuid,
  target_organization_id uuid,
  invite_token_hash text,
  invite_expires_at timestamptz
)
returns table(
  id uuid,
  tenant_id uuid,
  email text,
  role_id uuid,
  role_code text,
  organization_id uuid,
  status text,
  expires_at timestamptz,
  invited_by uuid,
  created_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), normalized as (
  select lower(trim(invite_email)) as email,
         lower(trim(invite_token_hash)) as token_hash
), allowed as (
  select c.tenant_id, c.core_role, n.email, n.token_hash, r.id as role_id, r.code as role_code
  from ctx c
  cross join normalized n
  join public.roles r on r.tenant_id = c.tenant_id and r.id = target_role_id
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''user.manage'')
    and n.email ~ ''^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$''
    and n.token_hash ~ ''^[0-9a-f]{64}$''
    and invite_expires_at > now()
    and (target_organization_id is null or exists (
      select 1 from public.organizations o
      where o.id = target_organization_id and o.tenant_id = c.tenant_id and o.deleted_at is null
    ))
    and (r.code <> ''owner'' or c.core_role = ''owner'')
    and not exists (
      select 1
      from neon_auth."user" nu
      join public.memberships m on m.user_id = nu.id and m.tenant_id = c.tenant_id
      where lower(nu.email) = n.email and m.status <> ''removed''
    )
), revoked as (
  update public.membership_invitations i
  set status = ''revoked'', updated_at = now()
  from allowed a
  where i.tenant_id = a.tenant_id and i.email = a.email and i.status = ''pending''
  returning i.id
), inserted as (
  insert into public.membership_invitations(
    tenant_id, email, role_id, organization_id, token_hash, status, expires_at, invited_by
  )
  select a.tenant_id, a.email, a.role_id, target_organization_id, a.token_hash, ''pending'', invite_expires_at, actor_user
  from allowed a
  left join revoked r on true
  returning id, tenant_id, email, role_id, organization_id, status, expires_at, invited_by, created_at
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select i.tenant_id, actor_user, ''membership.invitation.create'', ''membership_invitation'', i.id::text,
         jsonb_build_object(''email'', i.email, ''roleId'', i.role_id, ''organizationId'', i.organization_id)
  from inserted i
  returning id
)
select i.id, i.tenant_id, i.email, i.role_id, r.code, i.organization_id, i.status, i.expires_at, i.invited_by, i.created_at
from inserted i
join public.roles r on r.tenant_id = i.tenant_id and r.id = i.role_id
cross join audited a';

create or replace function public.app_server_revoke_membership_invitation(
  actor_user uuid,
  target_invitation_id uuid
)
returns uuid
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), allowed as (
  select c.tenant_id
  from ctx c
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''user.manage'')
), revoked as (
  update public.membership_invitations i
  set status = ''revoked'', updated_at = now()
  from allowed a
  where i.id = target_invitation_id and i.tenant_id = a.tenant_id and i.status = ''pending''
  returning i.id, i.tenant_id, i.email
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select r.tenant_id, actor_user, ''membership.invitation.revoke'', ''membership_invitation'', r.id::text,
         jsonb_build_object(''email'', r.email)
  from revoked r
  returning id
)
select r.id from revoked r cross join audited a';

create or replace function public.app_accept_membership_invitation(invite_token_hash text)
returns table(
  id uuid,
  tenant_id uuid,
  organization_id uuid,
  user_id uuid,
  role_id uuid,
  role_code text,
  status public.membership_status,
  joined_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with actor as (
  select nu.id as user_id, lower(nu.email) as email
  from neon_auth."user" nu
  where nu.id = public.app_current_user_id() and nu."emailVerified" = true
), candidate as (
  select i.id as invitation_id, i.tenant_id, i.organization_id, i.role_id, a.user_id
  from public.membership_invitations i
  join actor a on a.email = i.email
  where i.token_hash = lower(trim(invite_token_hash))
    and i.status = ''pending''
    and i.expires_at > now()
  limit 1
), bootstrapped as (
  insert into public.users(id)
  select c.user_id from candidate c
  on conflict (id) do nothing
  returning id
), membership_insert as (
  insert into public.memberships(tenant_id, organization_id, user_id, role_id, status, invited_at, joined_at)
  select c.tenant_id, c.organization_id, c.user_id, c.role_id, ''active''::public.membership_status, now(), now()
  from candidate c
  on conflict (tenant_id, user_id) do nothing
  returning id, tenant_id, organization_id, user_id, role_id, status, joined_at
), accepted as (
  update public.membership_invitations i
  set status = ''accepted'', accepted_by = m.user_id, accepted_at = now(), updated_at = now()
  from candidate c
  join membership_insert m on m.tenant_id = c.tenant_id and m.user_id = c.user_id
  where i.id = c.invitation_id
  returning i.id
), context_set as (
  insert into public.user_contexts(user_id, active_tenant_id)
  select m.user_id, m.tenant_id from membership_insert m
  on conflict (user_id) do update
    set active_tenant_id = case when public.user_contexts.active_tenant_id is null then excluded.active_tenant_id else public.user_contexts.active_tenant_id end,
        updated_at = now()
  returning user_id
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select m.tenant_id, m.user_id, ''membership.invitation.accept'', ''membership'', m.id::text,
         jsonb_build_object(''roleId'', m.role_id, ''organizationId'', m.organization_id)
  from membership_insert m
  cross join accepted a
  cross join context_set cs
  returning id
)
select m.id, m.tenant_id, m.organization_id, m.user_id, m.role_id, r.code, m.status, m.joined_at
from membership_insert m
join public.roles r on r.tenant_id = m.tenant_id and r.id = m.role_id
cross join audited a';

create or replace function public.app_server_update_membership(
  actor_user uuid,
  target_membership_id uuid,
  target_role_id uuid,
  target_organization_id uuid,
  target_status text
)
returns table(
  id uuid,
  tenant_id uuid,
  organization_id uuid,
  user_id uuid,
  role_id uuid,
  role_code text,
  status public.membership_status,
  joined_at timestamptz,
  updated_at timestamptz
)
language sql volatile security definer
set search_path = ''
as 'with ctx as (
  select * from public.app_identity_context_for_user(actor_user)
), target as (
  select m.*, current_role.code as current_role_code
  from ctx c
  join public.memberships m on m.tenant_id = c.tenant_id and m.id = target_membership_id
  join public.roles current_role on current_role.tenant_id = m.tenant_id and current_role.id = m.role_id
  where c.tenant_id is not null
    and public.app_has_permission_for_user(actor_user, ''user.manage'')
), next_role as (
  select r.id, r.tenant_id, r.code
  from target t
  join public.roles r on r.tenant_id = t.tenant_id and r.id = target_role_id
), allowed as (
  select t.*, nr.id as next_role_id, nr.code as next_role_code
  from target t
  join next_role nr on nr.tenant_id = t.tenant_id
  join ctx c on c.tenant_id = t.tenant_id
  where target_status in (''active'',''suspended'')
    and (target_organization_id is null or exists (
      select 1 from public.organizations o
      where o.id = target_organization_id and o.tenant_id = t.tenant_id and o.deleted_at is null
    ))
    and (t.current_role_code <> ''owner'' or c.core_role = ''owner'')
    and (nr.code <> ''owner'' or c.core_role = ''owner'')
    and not (
      t.status = ''active''
      and t.current_role_code in (''owner'',''tenant_admin'')
      and (target_status <> ''active'' or nr.code not in (''owner'',''tenant_admin''))
      and not exists (
        select 1
        from public.memberships other
        join public.roles other_role on other_role.tenant_id = other.tenant_id and other_role.id = other.role_id
        where other.tenant_id = t.tenant_id
          and other.id <> t.id
          and other.status = ''active''
          and other_role.code in (''owner'',''tenant_admin'')
      )
    )
), updated as (
  update public.memberships m
  set role_id = a.next_role_id,
      organization_id = target_organization_id,
      status = target_status::public.membership_status,
      joined_at = case when target_status = ''active'' then coalesce(m.joined_at, now()) else m.joined_at end,
      updated_at = now()
  from allowed a
  where m.id = a.id and m.tenant_id = a.tenant_id
  returning m.id, m.tenant_id, m.organization_id, m.user_id, m.role_id, m.status, m.joined_at, m.updated_at
), context_clean as (
  update public.user_contexts uc
  set active_tenant_id = null, updated_at = now()
  from updated u
  where u.status = ''suspended''
    and uc.user_id = u.user_id
    and uc.active_tenant_id = u.tenant_id
  returning uc.user_id
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select u.tenant_id, actor_user, ''membership.update'', ''membership'', u.id::text,
         jsonb_build_object(''roleId'', u.role_id, ''organizationId'', u.organization_id, ''status'', u.status)
  from updated u
  returning id
)
select u.id, u.tenant_id, u.organization_id, u.user_id, u.role_id, r.code, u.status, u.joined_at, u.updated_at
from updated u
join public.roles r on r.tenant_id = u.tenant_id and r.id = u.role_id
cross join audited a';

revoke all on function public.app_server_create_membership_invitation(uuid,text,uuid,uuid,text,timestamptz) from public, anonymous, authenticated;
revoke all on function public.app_server_revoke_membership_invitation(uuid,uuid) from public, anonymous, authenticated;
revoke all on function public.app_server_update_membership(uuid,uuid,uuid,uuid,text) from public, anonymous, authenticated;
revoke all on function public.app_accept_membership_invitation(text) from public, anonymous;

grant execute on function public.app_accept_membership_invitation(text) to authenticated;
grant execute on function public.app_server_create_membership_invitation(uuid,text,uuid,uuid,text,timestamptz) to ifarm_api_runtime;
grant execute on function public.app_server_revoke_membership_invitation(uuid,uuid) to ifarm_api_runtime;
grant execute on function public.app_server_update_membership(uuid,uuid,uuid,uuid,text) to ifarm_api_runtime;

revoke all on public.membership_invitations, public.memberships, public.roles, public.role_permissions, public.users, public.user_contexts
from ifarm_api_runtime;
