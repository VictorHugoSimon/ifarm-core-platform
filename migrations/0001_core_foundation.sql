-- iFarm Core — Migration 0001
-- Fundação relacional multi-tenant, RBAC, estrutura rural e governança.

create extension if not exists pgcrypto;

create type tenant_status as enum ('trial', 'active', 'suspended', 'cancelled');
create type membership_status as enum ('invited', 'active', 'suspended', 'removed');
create type actor_type as enum ('user', 'service', 'system');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  legal_name text not null,
  trade_name text,
  status tenant_status not null default 'trial',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  parent_id uuid references organizations(id),
  name text not null,
  document_number text,
  email text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id)
);
create index organizations_tenant_idx on organizations(tenant_id);

create table users (
  id uuid primary key,
  email text not null,
  full_name text not null,
  phone text,
  avatar_url text,
  is_ifarm_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email)
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  resource text not null,
  action text not null,
  description text
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key(role_id, permission_id)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  organization_id uuid references organizations(id),
  user_id uuid not null references users(id),
  role_id uuid not null references roles(id),
  status membership_status not null default 'invited',
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id, organization_id)
);
create index memberships_tenant_user_idx on memberships(tenant_id, user_id);

create table properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  organization_id uuid not null references organizations(id),
  name text not null,
  registration_code text,
  municipality text,
  state_code char(2),
  country_code char(2) not null default 'BR',
  total_area_ha numeric(14,4),
  latitude numeric(10,7),
  longitude numeric(10,7),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index properties_tenant_idx on properties(tenant_id);

create table fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  property_id uuid not null references properties(id),
  name text not null,
  area_ha numeric(14,4),
  geometry jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index fields_tenant_property_idx on fields(tenant_id, property_id);

create table plots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  field_id uuid not null references fields(id),
  code text,
  name text not null,
  area_ha numeric(14,4),
  geometry jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index plots_tenant_field_idx on plots(tenant_id, field_id);

create table crops (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  scientific_name text,
  metadata jsonb not null default '{}'::jsonb
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  property_id uuid not null references properties(id),
  crop_id uuid not null references crops(id),
  name text not null,
  start_date date,
  end_date date,
  status text not null default 'planned',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seasons_tenant_property_idx on seasons(tenant_id, property_id);

create table season_plots (
  season_id uuid not null references seasons(id) on delete cascade,
  plot_id uuid not null references plots(id),
  planted_area_ha numeric(14,4),
  primary key(season_id, plot_id)
);

create table partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  document_number text,
  partner_type text not null,
  email text,
  phone text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index partners_tenant_idx on partners(tenant_id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  organization_id uuid references organizations(id),
  property_id uuid references properties(id),
  title text not null,
  category text,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index documents_tenant_idx on documents(tenant_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  title text not null,
  description text,
  status text not null default 'open',
  priority text not null default 'medium',
  assignee_user_id uuid references users(id),
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tasks_tenant_idx on tasks(tenant_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_tenant_user_idx on notifications(tenant_id, user_id, created_at desc);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  organization_id uuid not null references organizations(id),
  partner_id uuid references partners(id),
  contract_number text,
  status text not null default 'draft',
  starts_on date,
  ends_on date,
  amount numeric(18,2),
  currency char(3) not null default 'BRL',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index contracts_tenant_idx on contracts(tenant_id);

create table consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid references users(id),
  subject_reference text,
  purpose_code text not null,
  legal_basis text not null,
  status text not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index consents_tenant_idx on consents(tenant_id);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  provider text not null,
  name text not null,
  status text not null default 'inactive',
  config jsonb not null default '{}'::jsonb,
  secret_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, provider, name)
);

create table webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  integration_id uuid references integrations(id),
  target_url text not null,
  event_types text[] not null default '{}',
  status text not null default 'active',
  signing_secret_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table configurations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  namespace text not null,
  key text not null,
  value jsonb not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  unique(tenant_id, namespace, key)
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  actor_type actor_type not null,
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_id text,
  ip_address inet,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_tenant_time_idx on audit_events(tenant_id, occurred_at desc);

-- Isolamento por tenant. A claim tenant_id será inserida no JWT pelo fluxo de identidade do Core.
create or replace function app_current_tenant_id() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid
$$;

create or replace function app_is_ifarm_admin() returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() ->> 'is_ifarm_admin')::boolean, false)
$$;

alter table organizations enable row level security;
alter table memberships enable row level security;
alter table properties enable row level security;
alter table fields enable row level security;
alter table plots enable row level security;
alter table seasons enable row level security;
alter table partners enable row level security;
alter table documents enable row level security;
alter table tasks enable row level security;
alter table notifications enable row level security;
alter table contracts enable row level security;
alter table consents enable row level security;
alter table integrations enable row level security;
alter table webhooks enable row level security;
alter table configurations enable row level security;
alter table audit_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['organizations','memberships','properties','fields','plots','seasons','partners','documents','tasks','notifications','contracts','consents','integrations','webhooks','configurations','audit_events']
  loop
    execute format(
      'create policy tenant_isolation on %I for all using (tenant_id = app_current_tenant_id() or app_is_ifarm_admin()) with check (tenant_id = app_current_tenant_id() or app_is_ifarm_admin())',
      t
    );
  end loop;
end $$;

-- Permissões base do MVP.
insert into permissions(code, resource, action, description) values
('tenant.read','tenant','read','Visualizar dados do tenant'),
('organization.manage','organization','manage','Gerenciar organizações'),
('user.manage','user','manage','Gerenciar usuários e memberships'),
('rbac.manage','rbac','manage','Gerenciar perfis e permissões'),
('property.read','property','read','Visualizar propriedades'),
('property.manage','property','manage','Gerenciar propriedades, áreas e talhões'),
('partner.manage','partner','manage','Gerenciar parceiros'),
('document.manage','document','manage','Gerenciar documentos'),
('notification.read','notification','read','Visualizar notificações'),
('audit.read','audit','read','Consultar auditoria'),
('integration.manage','integration','manage','Gerenciar integrações e webhooks')
on conflict (code) do nothing;
