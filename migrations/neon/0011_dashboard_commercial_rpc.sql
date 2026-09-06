-- iFarm Core / Neon — 0011
-- CORE-008: dashboard calculado + capabilities de contratos, módulos, receitas e integrações.

create or replace function public.app_dashboard_summary()
returns jsonb
language sql stable security definer
set search_path = ''
as 'with ctx as (
  select public.app_current_tenant_id() as tenant_id, public.app_current_user_id() as user_id
), counts as (
  select
    (select count(*) from public.organizations o, ctx c where o.tenant_id=c.tenant_id and o.deleted_at is null) as organizations,
    (select count(*) from public.properties p, ctx c where p.tenant_id=c.tenant_id and p.deleted_at is null) as properties,
    (select count(*) from public.memberships m, ctx c where m.tenant_id=c.tenant_id and m.status=''active'') as active_users,
    (select count(*) from public.partners p, ctx c where p.tenant_id=c.tenant_id and p.deleted_at is null) as partners,
    (select count(*) from public.documents d, ctx c where d.tenant_id=c.tenant_id and d.deleted_at is null) as documents,
    (select count(*) from public.integrations i, ctx c where i.tenant_id=c.tenant_id and i.deleted_at is null) as integrations,
    (select count(*) from public.contracts ct, ctx c where ct.tenant_id=c.tenant_id and ct.deleted_at is null and ct.status=''active'') as active_contracts,
    (select count(*) from public.tenant_modules tm, ctx c where tm.tenant_id=c.tenant_id and tm.status in (''trial'',''active'') and (tm.ends_on is null or tm.ends_on >= current_date)) as active_modules
), financial as (
  select coalesce(jsonb_agg(jsonb_build_object(
    ''currency'', f.currency,
    ''mrrCents'', f.mrr_cents,
    ''arrCents'', f.mrr_cents * 12,
    ''revenueForecastNext12MonthsCents'', f.forecast_cents,
    ''revenueReceivedYtdCents'', f.received_cents
  ) order by f.currency), ''[]''::jsonb) as value
  from (
    select cur.currency,
      coalesce((select sum(c.recurring_monthly_cents) from public.contracts c, ctx x where c.tenant_id=x.tenant_id and c.deleted_at is null and c.status=''active'' and c.starts_on<=current_date and (c.ends_on is null or c.ends_on>=current_date) and c.currency=cur.currency),0)::bigint as mrr_cents,
      coalesce((select sum(r.amount_cents) from public.contract_revenue_entries r, ctx x where r.tenant_id=x.tenant_id and r.currency=cur.currency and r.status in (''scheduled'',''overdue'') and r.due_date>=current_date and r.due_date<(current_date + interval ''12 months'')::date),0)::bigint as forecast_cents,
      coalesce((select sum(r.amount_cents) from public.contract_revenue_entries r, ctx x where r.tenant_id=x.tenant_id and r.currency=cur.currency and r.status=''paid'' and r.paid_at>=date_trunc(''year'',now())),0)::bigint as received_cents
    from (
      select currency from public.contracts c, ctx x where c.tenant_id=x.tenant_id and c.deleted_at is null
      union
      select currency from public.contract_revenue_entries r, ctx x where r.tenant_id=x.tenant_id
    ) cur
  ) f
), modules as (
  select coalesce(jsonb_agg(jsonb_build_object(
    ''code'', mc.code,
    ''name'', mc.name,
    ''status'', tm.status,
    ''contractId'', tm.contract_id,
    ''startsOn'', tm.starts_on,
    ''endsOn'', tm.ends_on
  ) order by mc.name), ''[]''::jsonb) as value
  from public.tenant_modules tm
  join public.module_catalog mc on mc.code=tm.module_code
  join ctx c on c.tenant_id=tm.tenant_id
), alerts as (
  select jsonb_build_object(
    ''contractsExpiring30Days'', (select count(*) from public.contracts ct, ctx c where ct.tenant_id=c.tenant_id and ct.deleted_at is null and ct.status=''active'' and ct.ends_on between current_date and current_date+30),
    ''integrationsError'', (select count(*) from public.integrations i, ctx c where i.tenant_id=c.tenant_id and i.deleted_at is null and i.status=''error''),
    ''invitationsExpiring48h'', (select count(*) from public.membership_invitations mi, ctx c where mi.tenant_id=c.tenant_id and mi.status=''pending'' and mi.expires_at>now() and mi.expires_at<=now()+interval ''48 hours''),
    ''unreadNotifications'', (select count(*) from public.notifications n, ctx c where n.tenant_id=c.tenant_id and n.user_id=c.user_id and n.read_at is null)
  ) as value
)
select case when c.tenant_id is null then null else jsonb_build_object(
  ''scope'',''tenant'',
  ''tenantId'',c.tenant_id,
  ''generatedAt'',now(),
  ''counts'',jsonb_build_object(
    ''organizations'',x.organizations,
    ''properties'',x.properties,
    ''activeUsers'',x.active_users,
    ''partners'',x.partners,
    ''documents'',x.documents,
    ''integrations'',x.integrations,
    ''activeContracts'',x.active_contracts,
    ''activeModules'',x.active_modules
  ),
  ''financialByCurrency'',f.value,
  ''modules'',m.value,
  ''alerts'',a.value
) end
from ctx c cross join counts x cross join financial f cross join modules m cross join alerts a
where public.app_has_permission(''tenant.read'') or public.app_has_permission(''tenant.manage'')';

create or replace function public.app_server_admin_dashboard_summary(actor_user uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as 'with allowed as (
  select 1 where exists(select 1 from public.users u where u.id=actor_user and u.is_ifarm_admin)
), financial as (
  select coalesce(jsonb_agg(jsonb_build_object(
    ''currency'', f.currency,
    ''mrrCents'', f.mrr_cents,
    ''arrCents'', f.mrr_cents*12,
    ''revenueForecastNext12MonthsCents'', f.forecast_cents,
    ''revenueReceivedYtdCents'', f.received_cents
  ) order by f.currency), ''[]''::jsonb) as value
  from (
    select cur.currency,
      coalesce((select sum(c.recurring_monthly_cents) from public.contracts c where c.deleted_at is null and c.status=''active'' and c.starts_on<=current_date and (c.ends_on is null or c.ends_on>=current_date) and c.currency=cur.currency),0)::bigint as mrr_cents,
      coalesce((select sum(r.amount_cents) from public.contract_revenue_entries r where r.currency=cur.currency and r.status in (''scheduled'',''overdue'') and r.due_date>=current_date and r.due_date<(current_date+interval ''12 months'')::date),0)::bigint as forecast_cents,
      coalesce((select sum(r.amount_cents) from public.contract_revenue_entries r where r.currency=cur.currency and r.status=''paid'' and r.paid_at>=date_trunc(''year'',now())),0)::bigint as received_cents
    from (
      select currency from public.contracts where deleted_at is null
      union select currency from public.contract_revenue_entries
    ) cur
  ) f
), module_distribution as (
  select coalesce(jsonb_agg(jsonb_build_object(''code'',q.code,''name'',q.name,''activeTenants'',q.active_tenants) order by q.name),''[]''::jsonb) as value
  from (
    select mc.code,mc.name,count(tm.tenant_id) filter(where tm.status in (''trial'',''active'') and (tm.ends_on is null or tm.ends_on>=current_date)) as active_tenants
    from public.module_catalog mc left join public.tenant_modules tm on tm.module_code=mc.code
    group by mc.code,mc.name
  ) q
)
select jsonb_build_object(
  ''scope'',''ifarm-admin'',
  ''generatedAt'',now(),
  ''counts'',jsonb_build_object(
    ''tenants'',(select count(*) from public.tenants),
    ''activeTenants'',(select count(*) from public.tenants where status=''active''),
    ''organizations'',(select count(*) from public.organizations where deleted_at is null),
    ''properties'',(select count(*) from public.properties where deleted_at is null),
    ''activeUsers'',(select count(*) from public.memberships where status=''active''),
    ''partners'',(select count(*) from public.partners where deleted_at is null),
    ''documents'',(select count(*) from public.documents where deleted_at is null),
    ''activeContracts'',(select count(*) from public.contracts where deleted_at is null and status=''active''),
    ''activeModules'',(select count(*) from public.tenant_modules where status in (''trial'',''active'') and (ends_on is null or ends_on>=current_date)),
    ''integrations'',(select count(*) from public.integrations where deleted_at is null)
  ),
  ''financialByCurrency'',f.value,
  ''moduleDistribution'',md.value,
  ''alerts'',jsonb_build_object(
    ''contractsExpiring30Days'',(select count(*) from public.contracts where deleted_at is null and status=''active'' and ends_on between current_date and current_date+30),
    ''integrationsError'',(select count(*) from public.integrations where deleted_at is null and status=''error''),
    ''pendingInvitations'',(select count(*) from public.membership_invitations where status=''pending'' and expires_at>now())
  )
)
from allowed a cross join financial f cross join module_distribution md';

create or replace function public.app_list_contracts()
returns setof public.contracts
language sql stable security definer set search_path=''
as 'select c.* from public.contracts c where c.tenant_id=public.app_current_tenant_id() and c.deleted_at is null and (public.app_has_permission(''contract.read'') or public.app_has_permission(''contract.manage'')) order by c.created_at desc';

create or replace function public.app_list_integrations()
returns setof public.integrations
language sql stable security definer set search_path=''
as 'select i.* from public.integrations i where i.tenant_id=public.app_current_tenant_id() and i.deleted_at is null and (public.app_has_permission(''integration.read'') or public.app_has_permission(''integration.manage'')) order by i.name';

create or replace function public.app_server_create_contract(
  actor_user uuid, target_partner uuid, target_number text, target_title text, target_status text,
  target_currency text, target_starts_on date, target_ends_on date, target_mrr_cents bigint
)
returns setof public.contracts
language sql volatile security definer set search_path=''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
  select c.tenant_id from ctx c where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''contract.manage'')
    and target_status in (''draft'',''active'',''suspended'',''ended'',''cancelled'')
    and upper(trim(target_currency)) ~ ''^[A-Z]{3}$'' and target_mrr_cents>=0
    and (target_ends_on is null or target_ends_on>=target_starts_on)
    and (target_partner is null or exists(select 1 from public.partners p where p.tenant_id=c.tenant_id and p.id=target_partner and p.deleted_at is null))
), inserted as (
  insert into public.contracts(tenant_id,partner_id,contract_number,title,status,currency,starts_on,ends_on,recurring_monthly_cents)
  select a.tenant_id,target_partner,trim(target_number),trim(target_title),target_status,upper(trim(target_currency)),target_starts_on,target_ends_on,target_mrr_cents from allowed a
  where nullif(trim(target_number),'''') is not null and nullif(trim(target_title),'''') is not null
  returning *
), audited as (
  insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
  select i.tenant_id,actor_user,''contract.create'',''contract'',i.id::text,jsonb_build_object(''contractNumber'',i.contract_number,''mrrCents'',i.recurring_monthly_cents,''currency'',i.currency) from inserted i returning id
)
select i.* from inserted i cross join audited a';

create or replace function public.app_server_add_revenue_entry(
  actor_user uuid, target_contract uuid, target_due_date date, target_amount_cents bigint,
  target_currency text, target_status text, target_paid_at timestamptz
)
returns setof public.contract_revenue_entries
language sql volatile security definer set search_path=''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
  select c.tenant_id from ctx c where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''contract.manage'')
    and target_amount_cents>=0 and target_status in (''scheduled'',''paid'',''cancelled'',''overdue'')
    and upper(trim(target_currency)) ~ ''^[A-Z]{3}$''
    and ((target_status=''paid'' and target_paid_at is not null) or target_status<>''paid'')
    and exists(select 1 from public.contracts ct where ct.tenant_id=c.tenant_id and ct.id=target_contract and ct.deleted_at is null)
), inserted as (
  insert into public.contract_revenue_entries(tenant_id,contract_id,due_date,amount_cents,currency,status,paid_at)
  select a.tenant_id,target_contract,target_due_date,target_amount_cents,upper(trim(target_currency)),target_status,target_paid_at from allowed a returning *
), audited as (
  insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
  select i.tenant_id,actor_user,''contract.revenue.create'',''contract_revenue'',i.id::text,jsonb_build_object(''contractId'',i.contract_id,''amountCents'',i.amount_cents,''currency'',i.currency,''status'',i.status) from inserted i returning id
)
select i.* from inserted i cross join audited a';

create or replace function public.app_server_upsert_tenant_module(
  actor_user uuid, target_module text, target_contract uuid, target_status text, target_starts_on date, target_ends_on date
)
returns setof public.tenant_modules
language sql volatile security definer set search_path=''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
  select c.tenant_id from ctx c where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''contract.manage'')
    and exists(select 1 from public.module_catalog mc where mc.code=target_module and mc.active)
    and target_status in (''trial'',''active'',''suspended'',''cancelled'')
    and (target_module<>''core'' or target_status=''active'')
    and (target_ends_on is null or target_ends_on>=target_starts_on)
    and (target_contract is null or exists(select 1 from public.contracts ct where ct.tenant_id=c.tenant_id and ct.id=target_contract and ct.deleted_at is null))
), upserted as (
  insert into public.tenant_modules(tenant_id,module_code,contract_id,status,starts_on,ends_on)
  select a.tenant_id,target_module,target_contract,target_status,target_starts_on,target_ends_on from allowed a
  on conflict(tenant_id,module_code) do update set contract_id=excluded.contract_id,status=excluded.status,starts_on=excluded.starts_on,ends_on=excluded.ends_on,updated_at=now()
  returning *
), audited as (
  insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
  select u.tenant_id,actor_user,''tenant.module.upsert'',''tenant_module'',u.module_code,jsonb_build_object(''status'',u.status,''contractId'',u.contract_id) from upserted u returning id
)
select u.* from upserted u cross join audited a';

create or replace function public.app_server_create_integration(actor_user uuid,target_name text,target_provider text,target_status text)
returns setof public.integrations
language sql volatile security definer set search_path=''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
  select c.tenant_id from ctx c where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''integration.manage'') and target_status in (''configuring'',''active'',''error'',''disabled'')
), inserted as (
  insert into public.integrations(tenant_id,name,provider,status)
  select a.tenant_id,trim(target_name),trim(target_provider),target_status from allowed a where nullif(trim(target_name),'''') is not null and nullif(trim(target_provider),'''') is not null returning *
), audited as (
  insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
  select i.tenant_id,actor_user,''integration.create'',''integration'',i.id::text,jsonb_build_object(''provider'',i.provider,''status'',i.status) from inserted i returning id
)
select i.* from inserted i cross join audited a';

-- Novos tenants sempre recebem o módulo Core ativo.
create or replace function public.app_seed_core_module(target_tenant uuid)
returns text
language sql volatile security definer set search_path=''
as 'insert into public.tenant_modules(tenant_id,module_code,status,starts_on) values(target_tenant,''core'',''active'',current_date) on conflict(tenant_id,module_code) do update set status=''active'',ends_on=null,updated_at=now() returning module_code';

revoke all on function public.app_dashboard_summary() from public,anonymous;
revoke all on function public.app_server_admin_dashboard_summary(uuid) from public,anonymous,authenticated;
revoke all on function public.app_list_contracts() from public,anonymous;
revoke all on function public.app_list_integrations() from public,anonymous;
revoke all on function public.app_server_create_contract(uuid,uuid,text,text,text,text,date,date,bigint) from public,anonymous,authenticated;
revoke all on function public.app_server_add_revenue_entry(uuid,uuid,date,bigint,text,text,timestamptz) from public,anonymous,authenticated;
revoke all on function public.app_server_upsert_tenant_module(uuid,text,uuid,text,date,date) from public,anonymous,authenticated;
revoke all on function public.app_server_create_integration(uuid,text,text,text) from public,anonymous,authenticated;
revoke all on function public.app_seed_core_module(uuid) from public,anonymous,authenticated,ifarm_api_runtime;

grant execute on function public.app_dashboard_summary(), public.app_list_contracts(), public.app_list_integrations() to authenticated;
grant execute on function public.app_server_admin_dashboard_summary(uuid) to ifarm_api_runtime;
grant execute on function public.app_server_create_contract(uuid,uuid,text,text,text,text,date,date,bigint) to ifarm_api_runtime;
grant execute on function public.app_server_add_revenue_entry(uuid,uuid,date,bigint,text,text,timestamptz) to ifarm_api_runtime;
grant execute on function public.app_server_upsert_tenant_module(uuid,text,uuid,text,date,date) to ifarm_api_runtime;
grant execute on function public.app_server_create_integration(uuid,text,text,text) to ifarm_api_runtime;

revoke all on public.module_catalog,public.contracts,public.tenant_modules,public.contract_revenue_entries,public.integrations from ifarm_api_runtime;
