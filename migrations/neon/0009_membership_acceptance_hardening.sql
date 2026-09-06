-- iFarm Core / Neon — 0009
-- CORE-007: separa lógica interna de aceite do wrapper autenticado.

create or replace function public.app_accept_membership_invitation_for_user(
  target_user uuid,
  invite_token_hash text
)
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
  where nu.id = target_user and nu."emailVerified" = true
), candidate as (
  select i.id as invitation_id, i.tenant_id, i.organization_id, i.role_id,
         i.created_at as invited_at, a.user_id
  from public.membership_invitations i
  join actor a on a.email = i.email
  where i.token_hash = lower(trim(invite_token_hash))
    and i.status = ''pending''
    and i.expires_at > now()
  limit 1
), bootstrapped as (
  insert into public.users(id)
  select c.user_id from candidate c
  on conflict (id) do update set updated_at = now()
  returning id
), membership_upsert as (
  insert into public.memberships(
    tenant_id, organization_id, user_id, role_id, status, invited_at, joined_at
  )
  select c.tenant_id, c.organization_id, c.user_id, c.role_id,
         ''active''::public.membership_status, c.invited_at, now()
  from candidate c
  join bootstrapped b on b.id = c.user_id
  on conflict (tenant_id, user_id) do update
    set organization_id = excluded.organization_id,
        role_id = excluded.role_id,
        status = ''active''::public.membership_status,
        invited_at = excluded.invited_at,
        joined_at = now(),
        updated_at = now()
    where public.memberships.status = ''removed''
  returning id, tenant_id, organization_id, user_id, role_id, status, joined_at
), accepted as (
  update public.membership_invitations i
  set status = ''accepted'', accepted_by = m.user_id, accepted_at = now(), updated_at = now()
  from candidate c
  join membership_upsert m on m.tenant_id = c.tenant_id and m.user_id = c.user_id
  where i.id = c.invitation_id
  returning i.id
), context_set as (
  insert into public.user_contexts(user_id, active_tenant_id)
  select m.user_id, m.tenant_id from membership_upsert m
  on conflict (user_id) do update
    set active_tenant_id = case
      when public.user_contexts.active_tenant_id is null then excluded.active_tenant_id
      else public.user_contexts.active_tenant_id
    end,
    updated_at = now()
  returning user_id
), audited as (
  insert into public.audit_events(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  select m.tenant_id, m.user_id, ''membership.invitation.accept'', ''membership'', m.id::text,
         jsonb_build_object(''roleId'', m.role_id, ''organizationId'', m.organization_id)
  from membership_upsert m
  cross join accepted a
  cross join context_set cs
  returning id
)
select m.id, m.tenant_id, m.organization_id, m.user_id, m.role_id, r.code, m.status, m.joined_at
from membership_upsert m
join public.roles r on r.tenant_id = m.tenant_id and r.id = m.role_id
cross join audited a';

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
as 'select * from public.app_accept_membership_invitation_for_user(
  public.app_current_user_id(), invite_token_hash
)';

revoke all on function public.app_accept_membership_invitation_for_user(uuid,text)
from public, anonymous, authenticated, ifarm_api_runtime;
revoke all on function public.app_accept_membership_invitation(text)
from public, anonymous;
grant execute on function public.app_accept_membership_invitation(text) to authenticated;
