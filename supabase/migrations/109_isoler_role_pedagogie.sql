-- Gabon Educ+ Primaire — rôle Pédagogie autonome
-- Le code historique academic_director est conservé. Cette migration retire
-- uniquement ses pouvoirs administratifs généraux et maintient ses droits
-- pédagogiques dans son établissement.

begin;

-- Visibilité des comptes strictement bornée au rôle de l'acteur. Une
-- politique SELECT permissive supplémentaire suffirait à annuler ce filtre.
drop policy if exists memberships_school_admin_read on public.school_memberships;
create policy memberships_school_admin_read on public.school_memberships for select to authenticated
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or public.has_school_role(school_id,array['school_admin','headmaster'])
  or (role::text = any(array['parent','student','academic_director','supervisor','secretary','teacher','head_teacher'])
      and public.has_school_role(school_id,array['secretary']))
  or (role::text = any(array['teacher','head_teacher'])
      and public.has_school_role(school_id,array['academic_director']))
);

create or replace function public.list_school_access_users(p_school_id uuid)
returns table(id uuid, first_name text, last_name text, email text, auth_email text,
  access_identifier text, phone text, role text, status text, must_change_password boolean,
  scope_class_ids uuid[], created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  actor_is_direction boolean;
  actor_is_secretary boolean;
  actor_is_pedagogy boolean;
begin
  actor_is_direction := public.is_super_admin()
    or public.has_school_role(p_school_id,array['school_admin','headmaster']);
  actor_is_secretary := public.has_school_role(p_school_id,array['secretary']);
  actor_is_pedagogy := public.has_school_role(p_school_id,array['academic_director']);
  if not actor_is_direction and not actor_is_secretary and not actor_is_pedagogy then
    raise exception 'Accès refusé aux utilisateurs de cet établissement';
  end if;
  return query
  select p.id,p.first_name,p.last_name,u.email::text,
    coalesce(ac.auth_email,u.email::text),ac.identifier::text,p.phone,sm.role::text,
    case when sm.status='suspended' or ac.status='suspended' then 'suspended' else 'active' end,
    coalesce(ac.must_change_password,false),sm.scope_class_ids,sm.created_at,sm.updated_at
  from public.school_memberships sm
  join public.profiles p on p.id=sm.user_id
  left join auth.users u on u.id=p.id
  left join public.access_credentials ac on ac.auth_user_id=p.id and ac.school_id=sm.school_id
  where sm.school_id=p_school_id and sm.status in ('active','suspended')
    and sm.invitation_status='accepted' and p.is_active
    and (actor_is_direction
      or (actor_is_secretary and sm.role::text = any(array['parent','student','academic_director','supervisor','secretary','teacher','head_teacher']))
      or (actor_is_pedagogy and sm.role::text = any(array['teacher','head_teacher'])))
  order by p.last_name,p.first_name;
end;
$$;
revoke all on function public.list_school_access_users(uuid) from public, anon;
grant execute on function public.list_school_access_users(uuid) to authenticated;

-- teacher et head_teacher sont deux états exclusifs d'un même compte.
do $$
begin
  if exists(select 1 from public.school_memberships sm
    where sm.role::text in ('teacher','head_teacher')
    group by sm.school_id,sm.user_id having count(*)>1) then
    raise exception 'Migration 104 interrompue : un compte cumule déjà teacher et head_teacher';
  end if;
end;
$$;

create or replace function public.enforce_exclusive_teaching_role()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.role::text not in ('teacher','head_teacher') then return new; end if;
  if tg_op='INSERT' and exists(select 1 from public.school_memberships sm
      where sm.school_id=new.school_id and sm.user_id=new.user_id
        and sm.role::text in ('teacher','head_teacher')) then
    raise exception 'Un compte ne peut pas cumuler teacher et head_teacher';
  end if;
  if tg_op='UPDATE' and old.role::text not in ('teacher','head_teacher')
     and exists(select 1 from public.school_memberships sm where sm.school_id=new.school_id
       and sm.user_id=new.user_id and sm.role::text in ('teacher','head_teacher')) then
    raise exception 'Un compte ne peut pas cumuler teacher et head_teacher';
  end if;
  if tg_op='UPDATE' and old.role::text in ('teacher','head_teacher')
     and exists(select 1 from public.school_memberships sm where sm.school_id=new.school_id
       and sm.user_id=new.user_id and sm.role::text in ('teacher','head_teacher') and sm.role<>old.role) then
    raise exception 'Un compte ne peut pas cumuler teacher et head_teacher';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_exclusive_teaching_role on public.school_memberships;
create trigger trg_exclusive_teaching_role before insert or update of role on public.school_memberships
for each row execute function public.enforce_exclusive_teaching_role();

create or replace function public.convert_school_teaching_role(p_school_id uuid,p_user_id uuid,p_new_role text)
returns void language plpgsql security definer set search_path=public as $$
declare current_role public.user_role; actor_allowed boolean;
begin
  if auth.uid() is null or p_user_id=auth.uid() or p_new_role not in ('teacher','head_teacher') then
    raise exception 'Conversion de rôle refusée';
  end if;
  actor_allowed := public.is_super_admin()
    or public.has_school_role(p_school_id,array['school_admin','headmaster','secretary','academic_director']);
  if not actor_allowed then raise exception 'Conversion de rôle refusée'; end if;
  select sm.role into strict current_role from public.school_memberships sm
    where sm.school_id=p_school_id and sm.user_id=p_user_id and sm.status='active'
      and sm.invitation_status='accepted' and sm.role::text in ('teacher','head_teacher');
  if exists(select 1 from public.school_memberships sm where sm.school_id=p_school_id
      and sm.user_id=p_user_id and sm.role<>current_role) then
    raise exception 'Le compte cible cumule plusieurs rôles';
  end if;
  update public.school_memberships set role=p_new_role::public.user_role
    where school_id=p_school_id and user_id=p_user_id and role=current_role;
  delete from public.user_roles where user_id=p_user_id and scope_school_id=p_school_id
    and role::text in ('teacher','head_teacher');
  insert into public.user_roles(user_id,role,scope_school_id)
    values(p_user_id,p_new_role::public.user_role,p_school_id) on conflict do nothing;
  update public.access_credentials set role=p_new_role::public.user_role,updated_at=now()
    where school_id=p_school_id and auth_user_id=p_user_id;
end;
$$;
revoke all on function public.convert_school_teaching_role(uuid,uuid,text) from public, anon;
grant execute on function public.convert_school_teaching_role(uuid,uuid,text) to authenticated;

-- Abonnement : la simple appartenance à l'établissement ne doit plus révéler
-- le contrat au responsable pédagogique.
drop policy if exists subscriptions_read on public.school_subscriptions;
create policy subscriptions_read on public.school_subscriptions for select to authenticated
  using(public.has_school_role(school_id,array['school_admin','headmaster']) or public.is_super_admin());

create or replace function public.get_current_school_subscription()
returns table(school_id uuid, plan_code text, status public.subscription_status,
  effective_status public.subscription_status, starts_at timestamptz, expires_at timestamptz,
  grace_period_ends_at timestamptz, offline_licence_expires_at timestamptz)
language sql stable security definer set search_path=public as $$
  select s.school_id,s.plan_code,s.status,public.subscription_effective_status(s.school_id),s.starts_at,s.expires_at,
    s.grace_period_ends_at,s.offline_licence_expires_at
  from public.school_subscriptions s
  where public.has_school_role(s.school_id,array['school_admin','headmaster']) or public.is_super_admin()
  order by s.updated_at desc limit 1;
$$;
revoke all on function public.get_current_school_subscription() from public, anon;
grant execute on function public.get_current_school_subscription() to authenticated;

-- Journal administratif et imports : direction générale uniquement.
drop policy if exists audit_events_authorized_read on public.school_audit_events;
create policy audit_events_authorized_read on public.school_audit_events for select to authenticated
  using(public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster']));

drop policy if exists import_jobs_authorized_read on public.import_jobs;
create policy import_jobs_authorized_read on public.import_jobs for select to authenticated
  using(public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary']));
drop policy if exists import_jobs_authorized_insert on public.import_jobs;
create policy import_jobs_authorized_insert on public.import_jobs for insert to authenticated
  with check(created_by=auth.uid() and (public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary'])));
drop policy if exists import_errors_authorized_read on public.import_job_errors;
create policy import_errors_authorized_read on public.import_job_errors for select to authenticated
  using(exists(select 1 from public.import_jobs j where j.id=import_job_id and
    (public.is_super_admin() or public.has_school_role(j.school_id,array['school_admin','headmaster','secretary']))));
drop policy if exists import_jobs_owner_update on public.import_jobs;
create policy import_jobs_owner_update on public.import_jobs for update to authenticated
  using(created_by=auth.uid() and (public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary'])))
  with check(created_by=auth.uid() and (public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary'])));
drop policy if exists import_errors_owner_insert on public.import_job_errors;
create policy import_errors_owner_insert on public.import_job_errors for insert to authenticated
  with check(exists(select 1 from public.import_jobs j where j.id=import_job_id and j.created_by=auth.uid()
    and (public.is_super_admin() or public.has_school_role(j.school_id,array['school_admin','headmaster','secretary']))));

-- Les dossiers élèves restent consultables via can_access_school_class pour le
-- suivi pédagogique et la vie scolaire, mais leur administration générale est
-- retirée à Pédagogie.
drop policy if exists student_records_admin_write on public.student_records;
create policy student_records_admin_write on public.student_records for all to authenticated
  using(public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary']))
  with check(public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary']));

-- Les demandes de coordonnées familiales relèvent du secrétariat/direction.
drop policy if exists gcr_staff_read on public.guardian_contact_requests;
create policy gcr_staff_read on public.guardian_contact_requests for select to authenticated
  using(public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary']));
drop policy if exists gcr_staff_decide on public.guardian_contact_requests;
create policy gcr_staff_decide on public.guardian_contact_requests for update to authenticated
  using(public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary']))
  with check(public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster','secretary']));

-- Défense en profondeur pour les comptes : l'application utilise une API
-- serveur qui limite academic_director à teacher/head_teacher. Les écritures
-- directes ordinaires restent réservées aux politiques historiques de gestion.
-- Aucun droit financier n'est ajouté ou modifié ici.

-- Pédagogie consulte les cahiers de son établissement via la politique de
-- lecture existante, mais ne peut ni les corriger ni modifier leurs annexes.
drop policy if exists lesson_book_entries_write on public.lesson_book_entries;
create policy lesson_book_entries_write on public.lesson_book_entries for all to authenticated
  using(teacher_id=auth.uid() or public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster']))
  with check(teacher_id=auth.uid() or public.is_super_admin() or public.has_school_role(school_id,array['school_admin','headmaster']));
create or replace function public.can_write_lesson_entry(target_entry uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.lesson_book_entries e where e.id=target_entry and
    (e.teacher_id=auth.uid() or public.is_super_admin() or public.has_school_role(e.school_id,array['school_admin','headmaster'])));
$$;
revoke all on function public.can_write_lesson_entry(uuid) from public, anon;
grant execute on function public.can_write_lesson_entry(uuid) to authenticated;

commit;
