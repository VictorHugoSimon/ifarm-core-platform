-- iFarm Core / Neon — 0010
-- CORE-008: contratos, módulos, receitas e integrações para dashboard executivo.

create table public.module_catalog (
  code text primary key,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z][a-z0-9_-]{1,31}$')
);

insert into public.module_catalog(code,name,description) values
('core','iFarm Core','Núcleo compartilhado de identidade, tenancy e gestão'),
('iot','iFarm IoT','Sensores, conectividade e telemetria'),
('logistics','iFarm Logistics','Logística e transporte'),
('services','iFarm Services','Serviços técnicos'),
('store','iFarm Store','Comércio e marketplace'),
('finance','iFarm Finance','Crédito e financiamento'),
('insurance','iFarm Insurance','Seguros'),
('academy','iFarm Academy','Cursos e capacitação')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  active = true,
  updated_at = now();

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  partner_id uuid,
  contract_number text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','active','suspended','ended','cancelled')),
  currency char(3) not null default 'BRL',
  starts_on date not null,
  ends_on date,
  recurring_monthly_cents bigint not null default 0 check (recurring_monthly_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id,id),
  unique (tenant_id,contract_number),
  foreign key (tenant_id,partner_id) references public.partners(tenant_id,id),
  check (currency ~ '^[A-Z]{3}$'),
  check (ends_on is null or ends_on >= starts_on)
);
create index contracts_tenant_status_idx on public.contracts(tenant_id,status,starts_on);
create index contracts_tenant_end_idx on public.contracts(tenant_id,ends_on) where deleted_at is null;

create table public.tenant_modules (
  tenant_id uuid not null references public.tenants(id),
  module_code text not null references public.module_catalog(code),
  contract_id uuid,
  status text not null default 'active' check (status in ('trial','active','suspended','cancelled')),
  starts_on date not null default current_date,
  ends_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id,module_code),
  foreign key (tenant_id,contract_id) references public.contracts(tenant_id,id),
  check (ends_on is null or ends_on >= starts_on)
);
create index tenant_modules_status_idx on public.tenant_modules(tenant_id,status);

insert into public.tenant_modules(tenant_id,module_code,status,starts_on)
select t.id,'core','active',current_date
from public.tenants t
on conflict (tenant_id,module_code) do nothing;

create table public.contract_revenue_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  contract_id uuid not null,
  due_date date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  currency char(3) not null default 'BRL',
  status text not null default 'scheduled' check (status in ('scheduled','paid','cancelled','overdue')),
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id),
  foreign key (tenant_id,contract_id) references public.contracts(tenant_id,id) on delete cascade,
  check (currency ~ '^[A-Z]{3}$'),
  check ((status = 'paid' and paid_at is not null) or status <> 'paid')
);
create index contract_revenue_tenant_due_idx on public.contract_revenue_entries(tenant_id,due_date,status);
create index contract_revenue_tenant_paid_idx on public.contract_revenue_entries(tenant_id,paid_at) where paid_at is not null;

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  provider text not null,
  status text not null default 'configuring' check (status in ('configuring','active','error','disabled')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id,id),
  unique (tenant_id,name)
);
create index integrations_tenant_status_idx on public.integrations(tenant_id,status) where deleted_at is null;

alter table public.module_catalog enable row level security;
alter table public.contracts enable row level security;
alter table public.tenant_modules enable row level security;
alter table public.contract_revenue_entries enable row level security;
alter table public.integrations enable row level security;

revoke all on public.module_catalog, public.contracts, public.tenant_modules,
  public.contract_revenue_entries, public.integrations
from public, anonymous, authenticated, ifarm_api_runtime;

grant select on public.module_catalog, public.contracts, public.tenant_modules,
  public.contract_revenue_entries, public.integrations
to authenticated;

create policy module_catalog_read on public.module_catalog
for select to authenticated
using (public.app_current_user_id() is not null);

create policy contracts_read on public.contracts
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and deleted_at is null
  and (public.app_has_permission('contract.read') or public.app_has_permission('contract.manage'))
);

create policy tenant_modules_read on public.tenant_modules
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and (public.app_has_permission('tenant.read') or public.app_has_permission('tenant.manage'))
);

create policy contract_revenue_read on public.contract_revenue_entries
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and (public.app_has_permission('contract.read') or public.app_has_permission('contract.manage'))
);

create policy integrations_read on public.integrations
for select to authenticated
using (
  tenant_id = public.app_current_tenant_id()
  and deleted_at is null
  and (public.app_has_permission('integration.read') or public.app_has_permission('integration.manage'))
);
