-- Run in a NEW Supabase project. Provision organizations and memberships
-- with a trusted administrator; never expose service_role credentials in HTML.
begin;
create table public.organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 slug text not null unique,
 created_at timestamptz not null default now()
);
create table public.organization_members (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','editor','viewer')),
 primary key (organization_id,user_id)
);
create table public.map_projects (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null,
 state jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.organization_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 community_name text,
 community_data jsonb,
 updated_at timestamptz not null default now()
);
create index organization_members_user_id_idx on public.organization_members(user_id);
create index map_projects_organization_id_idx on public.map_projects(organization_id);
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.map_projects enable row level security;
alter table public.organization_settings enable row level security;
revoke all on public.organizations,public.organization_members,public.map_projects,public.organization_settings from anon,authenticated;
grant select on public.organizations,public.organization_members to authenticated;
grant select,insert,update,delete on public.map_projects to authenticated;
grant select,insert,update on public.organization_settings to authenticated;
create policy own_membership on public.organization_members for select to authenticated
 using (user_id = (select auth.uid()));
create policy member_organization on public.organizations for select to authenticated
 using (exists (select 1 from public.organization_members m where m.organization_id=id and m.user_id=(select auth.uid())));
create policy read_projects on public.map_projects for select to authenticated
 using (exists (select 1 from public.organization_members m where m.organization_id=map_projects.organization_id and m.user_id=(select auth.uid())));
create policy create_projects on public.map_projects for insert to authenticated
 with check (exists (select 1 from public.organization_members m where m.organization_id=map_projects.organization_id and m.user_id=(select auth.uid()) and m.role in ('admin','editor')));
create policy edit_projects on public.map_projects for update to authenticated
 using (exists (select 1 from public.organization_members m where m.organization_id=map_projects.organization_id and m.user_id=(select auth.uid()) and m.role in ('admin','editor')))
 with check (exists (select 1 from public.organization_members m where m.organization_id=map_projects.organization_id and m.user_id=(select auth.uid()) and m.role in ('admin','editor')));
create policy delete_projects on public.map_projects for delete to authenticated
 using (exists (select 1 from public.organization_members m where m.organization_id=map_projects.organization_id and m.user_id=(select auth.uid()) and m.role='admin'));
create policy read_organization_settings on public.organization_settings for select to authenticated
 using (exists (select 1 from public.organization_members m where m.organization_id=organization_settings.organization_id and m.user_id=(select auth.uid())));
create policy create_organization_settings on public.organization_settings for insert to authenticated
 with check (exists (select 1 from public.organization_members m where m.organization_id=organization_settings.organization_id and m.user_id=(select auth.uid()) and m.role in ('admin','editor')));
create policy edit_organization_settings on public.organization_settings for update to authenticated
 using (exists (select 1 from public.organization_members m where m.organization_id=organization_settings.organization_id and m.user_id=(select auth.uid()) and m.role in ('admin','editor')))
 with check (exists (select 1 from public.organization_members m where m.organization_id=organization_settings.organization_id and m.user_id=(select auth.uid()) and m.role in ('admin','editor')));

create or replace function public.list_organization_members(p_organization_id uuid)
returns table(user_id uuid, email text, role text)
language plpgsql security definer set search_path = '' stable
as $$
begin
 if not exists (select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.role='admin') then raise exception 'permission denied'; end if;
 return query select m.user_id, u.email::text, m.role from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=p_organization_id order by u.email;
end; $$;

create or replace function public.add_organization_member_by_email(p_organization_id uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare target_user_id uuid;
begin
 if not exists (select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.role='admin') then raise exception 'permission denied'; end if;
 if p_role not in ('admin','editor','viewer') then raise exception 'invalid role'; end if;
 select id into target_user_id from auth.users where lower(email)=lower(trim(p_email)) limit 1;
 if target_user_id is null then raise exception 'user not found'; end if;
 insert into public.organization_members(organization_id,user_id,role) values(p_organization_id,target_user_id,p_role)
 on conflict(organization_id,user_id) do update set role=excluded.role;
end; $$;

create or replace function public.remove_organization_member(p_organization_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not exists (select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.role='admin') then raise exception 'permission denied'; end if;
 if p_user_id=(select auth.uid()) then raise exception 'cannot remove yourself'; end if;
 delete from public.organization_members where organization_id=p_organization_id and user_id=p_user_id;
end; $$;

revoke all on function public.list_organization_members(uuid), public.add_organization_member_by_email(uuid,text,text), public.remove_organization_member(uuid,uuid) from public, anon;
grant execute on function public.list_organization_members(uuid), public.add_organization_member_by_email(uuid,text,text), public.remove_organization_member(uuid,uuid) to authenticated;
commit;
-- Private attachments require separate Storage policies before enabling uploads.
