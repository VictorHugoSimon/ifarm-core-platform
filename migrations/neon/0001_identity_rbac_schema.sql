-- iFarm Core / Neon — 0001
-- Baseline mínimo de identidade, tenancy e RBAC.
-- Testado primeiro em branch temporária Neon antes de qualquer promoção para main.

create extension if not exists pgcrypto;

create type tenant_status as enum ('trial','active','suspended','cancelled');
create type membership_status as enum ('invited','active','suspended','removed');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  legal_name text not null,
  trade_name text,
  status tenant_status not null default 'trial',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references neon_auth."user"(id) on delete cascade,
  is_ifarm_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_contexts (
  user_id uuid primary key references public.users(id) on delete cascade,
  active_tenant_id uuid references public.tenants(id),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  parent_id uuid,
  name text not null,
  document_number text,
  email text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id,id),
  foreign key (tenant_id,parent_id) references public.organizations(tenant_id,id)
);
create index organizations_tenant_idx on public.organizations(tenant_id);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id,id),
  unique (tenant_id,code)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  resource text not null,
  action text not null,
  description text
);

create table public.role_permissions (
  tenant_id uuid not null references public.tenants(id),
  role_id uuid not null,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (tenant_id,role_id,permission_id),
  foreign key (tenant_id,role_id) references public.roles(tenant_id,id) on delete cascade
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  organization_id uuid,
  user_id uuid not null references public.users(id),
  role_id uuid not null,
  status membership_status not null default 'invited',
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id),
  unique (tenant_id,user_id),
  foreign key (tenant_id,organization_id) references public.organizations(tenant_id,id),
  foreign key (tenant_id,role_id) references public.roles(tenant_id,id)
);
create index memberships_tenant_user_idx on public.memberships(tenant_id,user_id);

insert into public.permissions(code,resource,action,description) values
('tenant.read','tenant','read','Visualizar tenant'),
('tenant.manage','tenant','manage','Administrar tenant'),
('organization.read','organization','read','Visualizar organizações'),
('organization.manage','organization','manage','Gerenciar organizações'),
('user.read','user','read','Visualizar usuários'),
('user.manage','user','manage','Gerenciar usuários'),
('rbac.read','rbac','read','Visualizar perfis e permissões'),
('rbac.manage','rbac','manage','Gerenciar perfis e permissões'),
('property.read','property','read','Visualizar propriedades'),
('property.manage','property','manage','Gerenciar propriedades'),
('partner.read','partner','read','Visualizar parceiros'),
('partner.manage','partner','manage','Gerenciar parceiros'),
('document.read','document','read','Visualizar documentos'),
('document.manage','document','manage','Gerenciar documentos'),
('task.read','task','read','Visualizar tarefas'),
('task.manage','task','manage','Gerenciar tarefas'),
('notification.read','notification','read','Visualizar notificações'),
('notification.manage','notification','manage','Gerenciar notificações'),
('contract.read','contract','read','Visualizar contratos'),
('contract.manage','contract','manage','Gerenciar contratos'),
('consent.read','consent','read','Visualizar consentimentos'),
('consent.manage','consent','manage','Gerenciar consentimentos'),
('audit.read','audit','read','Visualizar auditoria'),
('integration.read','integration','read','Visualizar integrações'),
('integration.manage','integration','manage','Gerenciar integrações'),
('configuration.read','configuration','read','Visualizar configurações'),
('configuration.manage','configuration','manage','Gerenciar configurações');
