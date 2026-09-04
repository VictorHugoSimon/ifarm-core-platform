-- iFarm Core / Neon — 0006
-- CORE-006: RPCs e capabilities de parceiros, documentos, notificações e auditoria.

create or replace function public.app_list_partners()
returns table(id uuid, tenant_id uuid, name text, document_number text, partner_type text, email text, phone text, status text, metadata jsonb, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = ''
as 'select p.id,p.tenant_id,p.name,p.document_number,p.partner_type,p.email,p.phone,p.status,p.metadata,p.created_at,p.updated_at
from public.partners p
where p.tenant_id=public.app_current_tenant_id() and p.deleted_at is null
and (public.app_has_permission(''partner.read'') or public.app_has_permission(''partner.manage''))
order by p.name';

create or replace function public.app_get_partner(target_partner_id uuid)
returns table(id uuid, tenant_id uuid, name text, document_number text, partner_type text, email text, phone text, status text, metadata jsonb, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = ''
as 'select p.id,p.tenant_id,p.name,p.document_number,p.partner_type,p.email,p.phone,p.status,p.metadata,p.created_at,p.updated_at
from public.partners p
where p.id=target_partner_id and p.tenant_id=public.app_current_tenant_id() and p.deleted_at is null
and (public.app_has_permission(''partner.read'') or public.app_has_permission(''partner.manage'')) limit 1';

create or replace function public.app_list_documents()
returns table(id uuid, tenant_id uuid, organization_id uuid, property_id uuid, title text, category text, storage_path text, mime_type text, size_bytes bigint, checksum text, metadata jsonb, created_by uuid, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = ''
as 'select d.id,d.tenant_id,d.organization_id,d.property_id,d.title,d.category,d.storage_path,d.mime_type,d.size_bytes,d.checksum,d.metadata,d.created_by,d.created_at,d.updated_at
from public.documents d
where d.tenant_id=public.app_current_tenant_id() and d.deleted_at is null
and (public.app_has_permission(''document.read'') or public.app_has_permission(''document.manage''))
order by d.created_at desc';

create or replace function public.app_get_document(target_document_id uuid)
returns table(id uuid, tenant_id uuid, organization_id uuid, property_id uuid, title text, category text, storage_path text, mime_type text, size_bytes bigint, checksum text, metadata jsonb, created_by uuid, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = ''
as 'select d.id,d.tenant_id,d.organization_id,d.property_id,d.title,d.category,d.storage_path,d.mime_type,d.size_bytes,d.checksum,d.metadata,d.created_by,d.created_at,d.updated_at
from public.documents d
where d.id=target_document_id and d.tenant_id=public.app_current_tenant_id() and d.deleted_at is null
and (public.app_has_permission(''document.read'') or public.app_has_permission(''document.manage'')) limit 1';

create or replace function public.app_list_notifications()
returns table(id uuid, tenant_id uuid, user_id uuid, type text, title text, body text, data jsonb, read_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = ''
as 'select n.id,n.tenant_id,n.user_id,n.type,n.title,n.body,n.data,n.read_at,n.created_at
from public.notifications n
where n.tenant_id=public.app_current_tenant_id()
and n.user_id=public.app_current_user_id()
and (public.app_has_permission(''notification.read'') or public.app_has_permission(''notification.manage''))
order by n.created_at desc';

create or replace function public.app_mark_notification_read(target_notification_id uuid)
returns uuid language sql volatile security definer set search_path = ''
as 'with updated as (
  update public.notifications n set read_at=coalesce(n.read_at,now())
  where n.id=target_notification_id and n.tenant_id=public.app_current_tenant_id()
    and n.user_id=public.app_current_user_id()
    and (public.app_has_permission(''notification.read'') or public.app_has_permission(''notification.manage''))
  returning n.id
) select id from updated';

create or replace function public.app_list_audit_events(row_limit integer default 100, row_offset integer default 0)
returns table(id uuid, tenant_id uuid, actor_id uuid, action text, entity_type text, entity_id text, request_id text, metadata jsonb, occurred_at timestamptz)
language sql stable security definer set search_path = ''
as 'select a.id,a.tenant_id,a.actor_id,a.action,a.entity_type,a.entity_id,a.request_id,a.metadata,a.occurred_at
from public.audit_events a
where a.tenant_id=public.app_current_tenant_id() and public.app_has_permission(''audit.read'')
order by a.occurred_at desc
limit greatest(1,least(coalesce(row_limit,100),200)) offset greatest(coalesce(row_offset,0),0)';

revoke all on function public.app_list_partners() from public, anonymous;
revoke all on function public.app_get_partner(uuid) from public, anonymous;
revoke all on function public.app_list_documents() from public, anonymous;
revoke all on function public.app_get_document(uuid) from public, anonymous;
revoke all on function public.app_list_notifications() from public, anonymous;
revoke all on function public.app_mark_notification_read(uuid) from public, anonymous;
revoke all on function public.app_list_audit_events(integer,integer) from public, anonymous;
grant execute on function public.app_list_partners(), public.app_get_partner(uuid), public.app_list_documents(), public.app_get_document(uuid), public.app_list_notifications(), public.app_mark_notification_read(uuid), public.app_list_audit_events(integer,integer) to authenticated;

create or replace function public.app_server_create_partner(actor_user uuid, partner_name text, partner_document_number text, partner_type_value text, partner_email text, partner_phone text)
returns table(id uuid, tenant_id uuid, name text, document_number text, partner_type text, email text, phone text, status text, metadata jsonb, created_at timestamptz, updated_at timestamptz)
language sql volatile security definer set search_path = ''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
 select c.tenant_id from ctx c where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''partner.manage'')
 and nullif(trim(partner_name),'''') is not null and nullif(trim(partner_type_value),'''') is not null
), inserted as (
 insert into public.partners(tenant_id,name,document_number,partner_type,email,phone)
 select a.tenant_id,trim(partner_name),nullif(trim(partner_document_number),''''),trim(partner_type_value),nullif(trim(partner_email),''''),nullif(trim(partner_phone),'''') from allowed a
 returning id,tenant_id,name,document_number,partner_type,email,phone,status,metadata,created_at,updated_at
), audited as (
 insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
 select i.tenant_id,actor_user,''partner.create'',''partner'',i.id::text,jsonb_build_object(''name'',i.name,''type'',i.partner_type) from inserted i returning id
) select i.* from inserted i cross join audited a';

create or replace function public.app_server_update_partner(actor_user uuid, target_partner_id uuid, patch jsonb)
returns table(id uuid, tenant_id uuid, name text, document_number text, partner_type text, email text, phone text, status text, metadata jsonb, created_at timestamptz, updated_at timestamptz)
language sql volatile security definer set search_path = ''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
 select c.tenant_id from ctx c where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''partner.manage'')
), updated as (
 update public.partners p set
 name=case when patch?''name'' then nullif(trim(patch->>''name''),'''') else p.name end,
 document_number=case when patch?''documentNumber'' then nullif(trim(patch->>''documentNumber''),'''') else p.document_number end,
 partner_type=case when patch?''partnerType'' then nullif(trim(patch->>''partnerType''),'''') else p.partner_type end,
 email=case when patch?''email'' then nullif(trim(patch->>''email''),'''') else p.email end,
 phone=case when patch?''phone'' then nullif(trim(patch->>''phone''),'''') else p.phone end,
 status=case when patch?''status'' then nullif(trim(patch->>''status''),'''') else p.status end,
 updated_at=now()
 from allowed a where p.id=target_partner_id and p.tenant_id=a.tenant_id and p.deleted_at is null
 and (not(patch?''name'') or nullif(trim(patch->>''name''),'''') is not null)
 and (not(patch?''partnerType'') or nullif(trim(patch->>''partnerType''),'''') is not null)
 returning p.id,p.tenant_id,p.name,p.document_number,p.partner_type,p.email,p.phone,p.status,p.metadata,p.created_at,p.updated_at
), audited as (
 insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
 select u.tenant_id,actor_user,''partner.update'',''partner'',u.id::text,jsonb_build_object(''patchKeys'',coalesce((select jsonb_agg(k) from jsonb_object_keys(patch) k),''[]''::jsonb)) from updated u returning id
) select u.* from updated u cross join audited a';

create or replace function public.app_server_delete_partner(actor_user uuid, target_partner_id uuid)
returns uuid language sql volatile security definer set search_path = ''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
 select c.tenant_id from ctx c where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''partner.manage'')
), deleted as (
 update public.partners p set deleted_at=now(),updated_at=now() from allowed a
 where p.id=target_partner_id and p.tenant_id=a.tenant_id and p.deleted_at is null returning p.id,p.tenant_id,p.name
), audited as (
 insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
 select d.tenant_id,actor_user,''partner.delete'',''partner'',d.id::text,jsonb_build_object(''name'',d.name) from deleted d returning id
) select d.id from deleted d cross join audited a';

create or replace function public.app_server_create_document(actor_user uuid, target_organization_id uuid, target_property_id uuid, document_title text, document_category text, document_storage_path text, document_mime_type text, document_size_bytes bigint, document_checksum text)
returns table(id uuid, tenant_id uuid, organization_id uuid, property_id uuid, title text, category text, storage_path text, mime_type text, size_bytes bigint, checksum text, metadata jsonb, created_by uuid, created_at timestamptz, updated_at timestamptz)
language sql volatile security definer set search_path = ''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
 select c.tenant_id from ctx c where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''document.manage'')
 and nullif(trim(document_title),'''') is not null and nullif(trim(document_storage_path),'''') is not null
 and (document_size_bytes is null or document_size_bytes>=0)
 and (target_organization_id is null or exists(select 1 from public.organizations o where o.id=target_organization_id and o.tenant_id=c.tenant_id and o.deleted_at is null))
 and (target_property_id is null or exists(select 1 from public.properties p where p.id=target_property_id and p.tenant_id=c.tenant_id and p.deleted_at is null))
), inserted as (
 insert into public.documents(tenant_id,organization_id,property_id,title,category,storage_path,mime_type,size_bytes,checksum,created_by)
 select a.tenant_id,target_organization_id,target_property_id,trim(document_title),nullif(trim(document_category),''''),trim(document_storage_path),nullif(trim(document_mime_type),''''),document_size_bytes,nullif(trim(document_checksum),''''),actor_user from allowed a
 returning id,tenant_id,organization_id,property_id,title,category,storage_path,mime_type,size_bytes,checksum,metadata,created_by,created_at,updated_at
), audited as (
 insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
 select i.tenant_id,actor_user,''document.create'',''document'',i.id::text,jsonb_build_object(''title'',i.title,''storagePath'',i.storage_path) from inserted i returning id
) select i.* from inserted i cross join audited a';

create or replace function public.app_server_update_document(actor_user uuid, target_document_id uuid, patch jsonb)
returns table(id uuid, tenant_id uuid, organization_id uuid, property_id uuid, title text, category text, storage_path text, mime_type text, size_bytes bigint, checksum text, metadata jsonb, created_by uuid, created_at timestamptz, updated_at timestamptz)
language sql volatile security definer set search_path = ''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
 select c.tenant_id from ctx c where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''document.manage'')
), updated as (
 update public.documents d set
 title=case when patch?''title'' then nullif(trim(patch->>''title''),'''') else d.title end,
 category=case when patch?''category'' then nullif(trim(patch->>''category''),'''') else d.category end,
 storage_path=case when patch?''storagePath'' then nullif(trim(patch->>''storagePath''),'''') else d.storage_path end,
 mime_type=case when patch?''mimeType'' then nullif(trim(patch->>''mimeType''),'''') else d.mime_type end,
 size_bytes=case when patch?''sizeBytes'' then nullif(patch->>''sizeBytes'','''')::bigint else d.size_bytes end,
 checksum=case when patch?''checksum'' then nullif(trim(patch->>''checksum''),'''') else d.checksum end,
 updated_at=now()
 from allowed a where d.id=target_document_id and d.tenant_id=a.tenant_id and d.deleted_at is null
 and (not(patch?''title'') or nullif(trim(patch->>''title''),'''') is not null)
 and (not(patch?''storagePath'') or nullif(trim(patch->>''storagePath''),'''') is not null)
 and (not(patch?''sizeBytes'') or nullif(patch->>''sizeBytes'','''') is null or nullif(patch->>''sizeBytes'','''')::bigint>=0)
 returning d.id,d.tenant_id,d.organization_id,d.property_id,d.title,d.category,d.storage_path,d.mime_type,d.size_bytes,d.checksum,d.metadata,d.created_by,d.created_at,d.updated_at
), audited as (
 insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
 select u.tenant_id,actor_user,''document.update'',''document'',u.id::text,jsonb_build_object(''patchKeys'',coalesce((select jsonb_agg(k) from jsonb_object_keys(patch) k),''[]''::jsonb)) from updated u returning id
) select u.* from updated u cross join audited a';

create or replace function public.app_server_delete_document(actor_user uuid, target_document_id uuid)
returns uuid language sql volatile security definer set search_path = ''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
 select c.tenant_id from ctx c where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''document.manage'')
), deleted as (
 update public.documents d set deleted_at=now(),updated_at=now() from allowed a
 where d.id=target_document_id and d.tenant_id=a.tenant_id and d.deleted_at is null returning d.id,d.tenant_id,d.title
), audited as (
 insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
 select d.tenant_id,actor_user,''document.delete'',''document'',d.id::text,jsonb_build_object(''title'',d.title) from deleted d returning id
) select d.id from deleted d cross join audited a';

create or replace function public.app_server_create_notification(actor_user uuid, target_user uuid, notification_type text, notification_title text, notification_body text, notification_data jsonb)
returns table(id uuid, tenant_id uuid, user_id uuid, type text, title text, body text, data jsonb, read_at timestamptz, created_at timestamptz)
language sql volatile security definer set search_path = ''
as 'with ctx as (select * from public.app_identity_context_for_user(actor_user)), allowed as (
 select c.tenant_id from ctx c join public.memberships m on m.tenant_id=c.tenant_id and m.user_id=target_user and m.status=''active''
 where c.tenant_id is not null and public.app_has_permission_for_user(actor_user,''notification.manage'')
 and nullif(trim(notification_type),'''') is not null and nullif(trim(notification_title),'''') is not null
), inserted as (
 insert into public.notifications(tenant_id,user_id,type,title,body,data)
 select a.tenant_id,target_user,trim(notification_type),trim(notification_title),nullif(trim(notification_body),''''),coalesce(notification_data,''{}''::jsonb) from allowed a
 returning id,tenant_id,user_id,type,title,body,data,read_at,created_at
), audited as (
 insert into public.audit_events(tenant_id,actor_id,action,entity_type,entity_id,metadata)
 select i.tenant_id,actor_user,''notification.create'',''notification'',i.id::text,jsonb_build_object(''targetUserId'',i.user_id,''type'',i.type) from inserted i returning id
) select i.* from inserted i cross join audited a';

revoke all on function public.app_server_create_partner(uuid,text,text,text,text,text) from public,anonymous,authenticated;
revoke all on function public.app_server_update_partner(uuid,uuid,jsonb) from public,anonymous,authenticated;
revoke all on function public.app_server_delete_partner(uuid,uuid) from public,anonymous,authenticated;
revoke all on function public.app_server_create_document(uuid,uuid,uuid,text,text,text,text,bigint,text) from public,anonymous,authenticated;
revoke all on function public.app_server_update_document(uuid,uuid,jsonb) from public,anonymous,authenticated;
revoke all on function public.app_server_delete_document(uuid,uuid) from public,anonymous,authenticated;
revoke all on function public.app_server_create_notification(uuid,uuid,text,text,text,jsonb) from public,anonymous,authenticated;
revoke all on public.partners, public.documents, public.notifications from ifarm_api_runtime;
grant execute on function public.app_server_create_partner(uuid,text,text,text,text,text), public.app_server_update_partner(uuid,uuid,jsonb), public.app_server_delete_partner(uuid,uuid), public.app_server_create_document(uuid,uuid,uuid,text,text,text,text,bigint,text), public.app_server_update_document(uuid,uuid,jsonb), public.app_server_delete_document(uuid,uuid), public.app_server_create_notification(uuid,uuid,text,text,text,jsonb) to ifarm_api_runtime;
