-- Gabon Éduc+ Primaire — Comptabilité et frais de scolarité
-- Migration additive. Elle ne gère ni comptabilité générale, ni dépenses, ni paiement externe.

create table public.finance_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  receipt_prefix text not null default 'REC' check (length(btrim(receipt_prefix)) > 0 and receipt_prefix ~ '^[A-Z0-9-]{1,12}$'),
  parent_publication_enabled boolean not null default false,
  receipt_footer text,
  financial_contact text,
  print_format text not null default 'a4' check (print_format in ('a4','thermal_80')),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.finance_fee_types (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  code text not null, label text not null, description text,
  category text not null check (category in ('registration','tuition','transport','canteen','supplies','activities','other')),
  is_active boolean not null default true, display_order integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, academic_year_id, code), check (length(btrim(code)) > 0), check (length(btrim(label)) > 0)
);

create table public.finance_fee_scales (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  fee_type_id uuid not null references public.finance_fee_types(id) on delete restrict,
  scope_type text not null check (scope_type in ('school','level','class','student')),
  grade_level_id uuid references public.grade_levels(id) on delete restrict,
  class_group_id uuid references public.class_groups(id) on delete restrict,
  student_id uuid references public.student_records(id) on delete restrict,
  amount_fcfa integer not null check (amount_fcfa > 0), effective_on date not null default ((now() at time zone 'Africa/Libreville')::date),
  is_active boolean not null default true, publish_to_parents boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((scope_type='school' and grade_level_id is null and class_group_id is null and student_id is null)
    or (scope_type='level' and grade_level_id is not null and class_group_id is null and student_id is null)
    or (scope_type='class' and grade_level_id is null and class_group_id is not null and student_id is null)
    or (scope_type='student' and grade_level_id is null and class_group_id is null and student_id is not null))
);
create unique index finance_fee_scales_unique_scope on public.finance_fee_scales
  (school_id, academic_year_id, fee_type_id, scope_type, coalesce(grade_level_id,'00000000-0000-0000-0000-000000000000'),
   coalesce(class_group_id,'00000000-0000-0000-0000-000000000000'), coalesce(student_id,'00000000-0000-0000-0000-000000000000')) where is_active;

create table public.finance_schedules (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  fee_scale_id uuid not null references public.finance_fee_scales(id) on delete restrict,
  mode text not null check (mode in ('single','monthly','quarterly','custom')),
  total_fcfa integer not null check (total_fcfa > 0), status text not null default 'draft' check(status in ('draft','active','inactive')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index finance_schedules_one_active_scale on public.finance_schedules(fee_scale_id) where status='active';
create table public.finance_schedule_installments (
  id uuid primary key default gen_random_uuid(), schedule_id uuid not null references public.finance_schedules(id) on delete restrict,
  label text not null, due_on date not null, amount_fcfa integer not null check(amount_fcfa > 0), position integer not null check(position > 0),
  status text not null default 'active' check(status in ('active','inactive')), unique(schedule_id,position), check(length(btrim(label)) > 0)
);

create table public.finance_student_charges (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  student_id uuid not null references public.student_records(id) on delete restrict,
  class_group_id uuid references public.class_groups(id) on delete restrict,
  fee_type_id uuid not null references public.finance_fee_types(id) on delete restrict,
  source_scale_id uuid references public.finance_fee_scales(id) on delete restrict,
  amount_fcfa integer not null check(amount_fcfa > 0), scope_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'active' check(status in ('active','cancelled')),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(), constraint finance_student_charges_unique_fee unique(academic_year_id,student_id,fee_type_id)
);
create table public.finance_charge_installments (
  id uuid primary key default gen_random_uuid(), charge_id uuid not null references public.finance_student_charges(id) on delete restrict,
  source_installment_id uuid references public.finance_schedule_installments(id) on delete restrict,
  label text not null, due_on date not null, amount_fcfa integer not null check(amount_fcfa > 0), position integer not null,
  status text not null default 'active' check(status in ('active','cancelled')), unique(charge_id,position)
);

create table public.finance_receipt_sequences (
  school_id uuid not null references public.schools(id) on delete cascade, sequence_year integer not null,
  last_value bigint not null default 0 check(last_value >= 0), updated_at timestamptz not null default now(), primary key(school_id,sequence_year)
);
create table public.finance_payments (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  student_id uuid not null references public.student_records(id) on delete restrict,
  guardian_id uuid references public.guardians(id) on delete set null, payer_name text not null,
  amount_fcfa integer not null check(amount_fcfa > 0), paid_at timestamptz not null default now(),
  payment_method text not null check(payment_method in ('cash','airtel_money','moov_money','bank_transfer','cheque','other')),
  external_reference text, comment text, collected_by uuid not null references public.profiles(id) on delete restrict,
  receipt_number text not null, idempotency_key uuid not null,
  status text not null default 'active' check(status in ('active','pending_cancellation','cancelled')),
  cancellation_reason text, cancelled_by uuid references public.profiles(id) on delete restrict, cancelled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(school_id,idempotency_key), unique(school_id,receipt_number), check(length(btrim(payer_name)) > 0)
);
create table public.finance_payment_allocations (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.finance_payments(id) on delete restrict,
  charge_installment_id uuid not null references public.finance_charge_installments(id) on delete restrict,
  amount_fcfa integer not null check(amount_fcfa > 0), created_at timestamptz not null default now(), unique(payment_id,charge_installment_id)
);
create table public.finance_cash_closures (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  cash_date date not null, cashier_id uuid not null references public.profiles(id) on delete restrict,
  payment_count integer not null check(payment_count >= 0), total_fcfa integer not null check(total_fcfa >= 0),
  method_totals jsonb not null default '{}'::jsonb, cancelled_summary jsonb not null default '{}'::jsonb,
  comment text, closed_by uuid not null references public.profiles(id) on delete restrict, closed_at timestamptz not null default now(),
  unique(school_id,cash_date,cashier_id)
);

create index finance_fee_types_school on public.finance_fee_types(school_id,academic_year_id,is_active);
create index finance_scales_lookup on public.finance_fee_scales(school_id,academic_year_id,fee_type_id,scope_type,is_active);
create index finance_charges_student on public.finance_student_charges(school_id,academic_year_id,student_id,status);
create index finance_installments_due on public.finance_charge_installments(due_on,status);
create index finance_payments_school_date on public.finance_payments(school_id,paid_at desc,status);
create index finance_payments_student on public.finance_payments(student_id,paid_at desc);
create index finance_allocations_installment on public.finance_payment_allocations(charge_installment_id);
create index finance_closures_school_date on public.finance_cash_closures(school_id,cash_date desc);

create or replace function public.finance_is_staff(target_school uuid) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.school_memberships sm where sm.school_id=target_school and sm.user_id=auth.uid() and sm.status='active' and sm.role::text in ('school_admin','headmaster','secretary'));
$$;
create or replace function public.finance_is_manager(target_school uuid) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.school_memberships sm where sm.school_id=target_school and sm.user_id=auth.uid() and sm.status='active' and sm.role::text in ('school_admin','headmaster'));
$$;
create or replace function public.finance_is_linked_guardian(target_school uuid,target_student uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.guardian_student_links l join public.guardians g on g.id=l.guardian_id
   join public.finance_settings s on s.school_id=l.school_id and s.parent_publication_enabled
   where l.school_id=target_school and l.student_id=target_student and g.profile_id=auth.uid());
$$;

create or replace function public.finance_validate_school_links() returns trigger language plpgsql set search_path=public as $$
declare expected_school uuid;
begin
  if to_jsonb(new) ? 'academic_year_id' then
    select school_id into expected_school from public.academic_years where id=(to_jsonb(new)->>'academic_year_id')::uuid;
    if expected_school is distinct from (to_jsonb(new)->>'school_id')::uuid then raise exception 'L’année scolaire appartient à un autre établissement.'; end if;
  end if;
  if tg_table_name='finance_fee_scales' then
    if not exists(select 1 from public.finance_fee_types f where f.id=new.fee_type_id and f.school_id=new.school_id and f.academic_year_id=new.academic_year_id) then raise exception 'Type de frais d’un autre établissement.'; end if;
    if new.class_group_id is not null and not exists(select 1 from public.class_groups c where c.id=new.class_group_id and c.school_id=new.school_id and c.academic_year_id=new.academic_year_id) then raise exception 'Classe d’un autre établissement.'; end if;
    if new.grade_level_id is not null and not exists(select 1 from public.class_groups c where c.grade_level_id=new.grade_level_id and c.school_id=new.school_id and c.academic_year_id=new.academic_year_id) then raise exception 'Niveau non utilisé par cet établissement pour cette année.'; end if;
    if new.student_id is not null and not exists(select 1 from public.student_records s where s.id=new.student_id and s.school_id=new.school_id and s.academic_year_id=new.academic_year_id) then raise exception 'Élève d’un autre établissement.'; end if;
  elsif tg_table_name='finance_schedules' then
    if not exists(select 1 from public.finance_fee_scales s where s.id=new.fee_scale_id and s.school_id=new.school_id and s.academic_year_id=new.academic_year_id) then raise exception 'Barème d’un autre établissement.'; end if;
  elsif tg_table_name='finance_student_charges' then
    if not exists(select 1 from public.student_records s where s.id=new.student_id and s.school_id=new.school_id and s.academic_year_id=new.academic_year_id and s.class_group_id is not distinct from new.class_group_id) then raise exception 'Élève, année ou classe instantanée incohérente.'; end if;
    if not exists(select 1 from public.finance_fee_types f where f.id=new.fee_type_id and f.school_id=new.school_id and f.academic_year_id=new.academic_year_id) then raise exception 'Type de frais d’un autre établissement.'; end if;
    if new.source_scale_id is not null and not exists(select 1 from public.finance_fee_scales f where f.id=new.source_scale_id and f.school_id=new.school_id and f.academic_year_id=new.academic_year_id and f.fee_type_id=new.fee_type_id) then raise exception 'Barème source incohérent.'; end if;
  end if;
  return new;
end; $$;
create trigger finance_fee_types_validate before insert or update on public.finance_fee_types for each row execute function public.finance_validate_school_links();
create trigger finance_scales_validate before insert or update on public.finance_fee_scales for each row execute function public.finance_validate_school_links();
create trigger finance_schedules_validate before insert or update on public.finance_schedules for each row execute function public.finance_validate_school_links();
create trigger finance_charges_validate before insert or update on public.finance_student_charges for each row execute function public.finance_validate_school_links();

create or replace function public.finance_validate_charge_installment() returns trigger language plpgsql set search_path=public as $$
begin
 if length(btrim(new.label))=0 then raise exception 'Le libellé de l’échéance est obligatoire.'; end if;
 if new.source_installment_id is not null and not exists(
   select 1 from public.finance_student_charges c join public.finance_schedules s on s.fee_scale_id=c.source_scale_id
   join public.finance_schedule_installments i on i.schedule_id=s.id
   where c.id=new.charge_id and i.id=new.source_installment_id
 ) then raise exception 'Échéance source incohérente avec la planification du barème.'; end if;
 return new;
end; $$;
create trigger finance_charge_installments_validate before insert or update on public.finance_charge_installments for each row execute function public.finance_validate_charge_installment();

create trigger finance_settings_updated_at before update on public.finance_settings for each row execute function public.set_updated_at();
create trigger finance_fee_types_updated_at before update on public.finance_fee_types for each row execute function public.set_updated_at();
create trigger finance_scales_updated_at before update on public.finance_fee_scales for each row execute function public.set_updated_at();
create trigger finance_schedules_updated_at before update on public.finance_schedules for each row execute function public.set_updated_at();
create trigger finance_payments_updated_at before update on public.finance_payments for each row execute function public.set_updated_at();

create or replace function public.finance_audit_change() returns trigger language plpgsql security definer set search_path=public as $$
declare row_data jsonb; sid uuid;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; sid:=(row_data->>'school_id')::uuid;
 insert into public.school_audit_events(school_id,user_id,actor_role,audit_action,module,entity_id,before_data,after_data,event_status)
 values(sid,auth.uid(),'finance_manager',lower(tg_table_name)||'.'||lower(tg_op),'finance',row_data->>'id',case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,'success');
 return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger finance_settings_audit after insert or update on public.finance_settings for each row execute function public.finance_audit_change();
create trigger finance_fee_types_audit after insert or update on public.finance_fee_types for each row execute function public.finance_audit_change();
create trigger finance_scales_audit after insert or update on public.finance_fee_scales for each row execute function public.finance_audit_change();
create trigger finance_schedules_audit after insert or update on public.finance_schedules for each row execute function public.finance_audit_change();
create trigger finance_charges_audit after insert or update on public.finance_student_charges for each row execute function public.finance_audit_change();

alter table public.finance_settings enable row level security;
alter table public.finance_fee_types enable row level security; alter table public.finance_fee_scales enable row level security;
alter table public.finance_schedules enable row level security; alter table public.finance_schedule_installments enable row level security;
alter table public.finance_student_charges enable row level security; alter table public.finance_charge_installments enable row level security;
alter table public.finance_receipt_sequences enable row level security; alter table public.finance_payments enable row level security;
alter table public.finance_payment_allocations enable row level security;
alter table public.finance_cash_closures enable row level security;

create policy finance_settings_staff_read on public.finance_settings for select to authenticated using(public.finance_is_staff(school_id));
create policy finance_settings_manager_insert on public.finance_settings for insert to authenticated with check(public.finance_is_manager(school_id));
create policy finance_settings_manager_update on public.finance_settings for update to authenticated using(public.finance_is_manager(school_id)) with check(public.finance_is_manager(school_id));
create policy finance_fee_types_staff_read on public.finance_fee_types for select to authenticated using(public.finance_is_staff(school_id));
create policy finance_fee_types_manager_insert on public.finance_fee_types for insert to authenticated with check(public.finance_is_manager(school_id));
create policy finance_fee_types_manager_update on public.finance_fee_types for update to authenticated using(public.finance_is_manager(school_id)) with check(public.finance_is_manager(school_id));
create policy finance_scales_staff_read on public.finance_fee_scales for select to authenticated using(public.finance_is_staff(school_id));
create policy finance_schedules_staff_read on public.finance_schedules for select to authenticated using(public.finance_is_staff(school_id));
create policy finance_schedule_parts_read on public.finance_schedule_installments for select to authenticated using(exists(select 1 from public.finance_schedules s where s.id=schedule_id and public.finance_is_staff(s.school_id)));
create policy finance_charges_read on public.finance_student_charges for select to authenticated using(public.finance_is_staff(school_id));
create policy finance_charge_parts_read on public.finance_charge_installments for select to authenticated using(exists(select 1 from public.finance_student_charges c where c.id=charge_id and public.finance_is_staff(c.school_id)));
create policy finance_payments_read on public.finance_payments for select to authenticated using(public.finance_is_staff(school_id));
create policy finance_allocations_read on public.finance_payment_allocations for select to authenticated using(exists(select 1 from public.finance_payments p where p.id=payment_id and public.finance_is_staff(p.school_id)));
create policy finance_closures_staff_read on public.finance_cash_closures for select to authenticated using(public.finance_is_staff(school_id));
-- Aucune policy DELETE sur paiements, affectations, séquences ou clôtures.

create or replace function public.record_finance_payment(payload jsonb) returns public.finance_payments
language plpgsql security definer set search_path=public as $$
declare s uuid; y uuid; st uuid; guardian uuid; idem uuid; total integer; available integer; allocated integer:=0;
 seq bigint; prefix text; result public.finance_payments; item jsonb; locked_id uuid; incoming_allocations jsonb; stored_allocations jsonb;
 constraint_hit text; cash_day date; sequence_year integer;
begin
 if auth.uid() is null then raise exception 'Session expirée.'; end if;
 s := (payload->>'school_id')::uuid; y := (payload->>'academic_year_id')::uuid; st := (payload->>'student_id')::uuid;
 guardian := nullif(payload->>'guardian_id','')::uuid; idem := (payload->>'idempotency_key')::uuid; total := (payload->>'amount_fcfa')::integer;
 if not public.finance_is_staff(s) then raise exception 'Droits financiers insuffisants.'; end if;
 cash_day := (now() at time zone 'Africa/Libreville')::date; sequence_year := extract(year from now() at time zone 'Africa/Libreville')::integer;
 if total <= 0 then raise exception 'Montant invalide.'; end if;
 if length(btrim(coalesce(payload->>'payer_name','')))=0 then raise exception 'Le nom du payeur est obligatoire.'; end if;
 if jsonb_typeof(payload->'allocations') is distinct from 'array' or jsonb_array_length(payload->'allocations')=0 then raise exception 'Une affectation au moins est obligatoire.'; end if;
 if not exists(select 1 from public.academic_years a where a.id=y and a.school_id=s) or not exists(select 1 from public.student_records r where r.id=st and r.school_id=s) then raise exception 'Élève ou année d’un autre établissement.'; end if;
 if guardian is not null and not exists(select 1 from public.guardians g join public.guardian_student_links l on l.guardian_id=g.id and l.school_id=g.school_id where g.id=guardian and g.school_id=s and g.status='active' and l.student_id=st) then raise exception 'Le responsable indiqué n’est pas un responsable actif lié à cet élève dans cet établissement.'; end if;
 select jsonb_agg(jsonb_build_object('installment_id',x.installment_id,'amount_fcfa',x.amount_fcfa) order by x.installment_id),sum(x.amount_fcfa)
 into incoming_allocations,allocated from (select (v->>'installment_id')::uuid installment_id,(v->>'amount_fcfa')::integer amount_fcfa from jsonb_array_elements(payload->'allocations') v) x;
 if (select count(*)<>count(distinct (v->>'installment_id')::uuid) from jsonb_array_elements(payload->'allocations') v) then raise exception 'Une même échéance ne peut apparaître qu’une fois.'; end if;
 if allocated<>total or exists(select 1 from jsonb_array_elements(payload->'allocations') v where (v->>'amount_fcfa')::integer<=0) then raise exception 'Affectations incohérentes.'; end if;

 -- Une même clé est sérialisée avant toute consommation de numéro de reçu.
 perform pg_advisory_xact_lock(hashtextextended(s::text||':'||idem::text,0));
 select * into result from public.finance_payments where school_id=s and idempotency_key=idem;
 if result.id is not null then
   select coalesce(jsonb_agg(jsonb_build_object('installment_id',a.charge_installment_id,'amount_fcfa',a.amount_fcfa) order by a.charge_installment_id),'[]'::jsonb) into stored_allocations from public.finance_payment_allocations a where a.payment_id=result.id;
   if result.academic_year_id=y and result.student_id=st and result.guardian_id is not distinct from guardian and result.amount_fcfa=total
      and result.payer_name=btrim(payload->>'payer_name') and result.payment_method=payload->>'payment_method'
      and result.external_reference is not distinct from nullif(payload->>'external_reference','') and result.comment is not distinct from nullif(payload->>'comment','')
      and stored_allocations=incoming_allocations then return result; end if;
   raise exception 'Cette clé d’idempotence a déjà été utilisée avec un contenu différent.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||':'||auth.uid()::text||':'||cash_day::text,0));
 if exists(select 1 from public.finance_cash_closures c where c.school_id=s and c.cash_date=cash_day and c.cashier_id=auth.uid()) then raise exception 'La caisse de ce caissier est déjà clôturée pour cette date.'; end if;

 -- Verrouillage déterministe de toutes les échéances avant le recalcul des soldes.
 for locked_id in select ci.id from public.finance_charge_installments ci where ci.id in (select (v->>'installment_id')::uuid from jsonb_array_elements(payload->'allocations') v) order by ci.id for update of ci loop null; end loop;
 if (select count(*) from public.finance_charge_installments ci where ci.id in (select (v->>'installment_id')::uuid from jsonb_array_elements(payload->'allocations') v))<>jsonb_array_length(payload->'allocations') then raise exception 'Échéance étrangère ou inexistante.'; end if;
 allocated:=0;
 for item in select * from jsonb_array_elements(payload->'allocations') loop
   select ci.amount_fcfa-coalesce(sum(case when p.status='active' then a.amount_fcfa else 0 end),0) into available
   from public.finance_charge_installments ci join public.finance_student_charges c on c.id=ci.charge_id
   left join public.finance_payment_allocations a on a.charge_installment_id=ci.id left join public.finance_payments p on p.id=a.payment_id
   where ci.id=(item->>'installment_id')::uuid and ci.status='active' and c.school_id=s and c.student_id=st and c.academic_year_id=y group by ci.amount_fcfa;
   if available is null then raise exception 'Échéance étrangère ou inexistante.'; end if;
   if (item->>'amount_fcfa')::integer > available then raise exception 'Le montant dépasse le solde de l’échéance.'; end if;
   allocated:=allocated+(item->>'amount_fcfa')::integer;
 end loop;
 if allocated<>total then raise exception 'Affectations incohérentes.'; end if;
 insert into public.finance_receipt_sequences(school_id,sequence_year,last_value) values(s,sequence_year,1)
 on conflict(school_id,sequence_year) do update set last_value=public.finance_receipt_sequences.last_value+1,updated_at=now() returning last_value into seq;
 select coalesce(receipt_prefix,'REC') into prefix from public.finance_settings where school_id=s;
 prefix := coalesce(prefix,'REC');
 begin
  insert into public.finance_payments(school_id,academic_year_id,student_id,guardian_id,payer_name,amount_fcfa,payment_method,external_reference,comment,collected_by,receipt_number,idempotency_key)
  values(s,y,st,guardian,btrim(payload->>'payer_name'),total,payload->>'payment_method',nullif(payload->>'external_reference',''),nullif(payload->>'comment',''),auth.uid(),prefix||'-'||sequence_year||'-'||lpad(seq::text,6,'0'),idem) returning * into result;
 exception when unique_violation then
  get stacked diagnostics constraint_hit=constraint_name;
  if constraint_hit='finance_payments_school_id_idempotency_key_key' then select * into result from public.finance_payments where school_id=s and idempotency_key=idem; if result.id is not null then return result; end if; end if;
  raise;
 end;
 for item in select * from jsonb_array_elements(payload->'allocations') loop
   insert into public.finance_payment_allocations(payment_id,charge_installment_id,amount_fcfa) values(result.id,(item->>'installment_id')::uuid,(item->>'amount_fcfa')::integer);
 end loop;
 insert into public.school_audit_events(school_id,user_id,actor_role,audit_action,module,entity_id,after_data,event_status)
 values(s,auth.uid(),'finance_staff','payment.recorded','finance',result.id::text,jsonb_build_object('receipt_number',result.receipt_number,'amount_fcfa',total),'success');
 return result;
end; $$;

create or replace function public.configure_finance_scale(payload jsonb) returns public.finance_fee_scales
language plpgsql security definer set search_path=public as $$
declare s uuid:=(payload->>'school_id')::uuid; y uuid:=(payload->>'academic_year_id')::uuid; total integer:=(payload->>'amount_fcfa')::integer; sum_parts integer; scale public.finance_fee_scales; schedule_id uuid; item jsonb;
begin
 if not public.finance_is_manager(s) then raise exception 'Configuration réservée à la direction.'; end if;
 if total<=0 then raise exception 'Montant invalide.'; end if;
 select coalesce(sum((x->>'amount_fcfa')::integer),0) into sum_parts from jsonb_array_elements(payload->'installments') x;
 if sum_parts<>total then raise exception 'La somme des échéances doit correspondre au montant total.'; end if;
 insert into public.finance_fee_scales(school_id,academic_year_id,fee_type_id,scope_type,grade_level_id,class_group_id,student_id,amount_fcfa,effective_on,is_active,publish_to_parents,created_by)
 values(s,y,(payload->>'fee_type_id')::uuid,payload->>'scope_type',nullif(payload->>'grade_level_id','')::uuid,nullif(payload->>'class_group_id','')::uuid,nullif(payload->>'student_id','')::uuid,total,coalesce(nullif(payload->>'effective_on','')::date,(now() at time zone 'Africa/Libreville')::date),true,coalesce((payload->>'publish_to_parents')::boolean,false),auth.uid()) returning * into scale;
 insert into public.finance_schedules(school_id,academic_year_id,fee_scale_id,mode,total_fcfa,status,created_by) values(s,y,scale.id,payload->>'mode',total,'active',auth.uid()) returning id into schedule_id;
 for item in select * from jsonb_array_elements(payload->'installments') loop
   if (item->>'amount_fcfa')::integer<=0 then raise exception 'Montant d’échéance invalide.'; end if;
   insert into public.finance_schedule_installments(schedule_id,label,due_on,amount_fcfa,position) values(schedule_id,btrim(item->>'label'),(item->>'due_on')::date,(item->>'amount_fcfa')::integer,(item->>'position')::integer);
 end loop;
 return scale;
end; $$;

create or replace function public.finance_winning_scale(target_school uuid,target_year uuid,target_fee uuid,target_student uuid) returns uuid
language sql stable security definer set search_path=public as $$
 select fs.id from public.student_records sr left join public.class_groups cg on cg.id=sr.class_group_id
 join public.finance_fee_scales fs on fs.school_id=sr.school_id and fs.academic_year_id=sr.academic_year_id and fs.fee_type_id=target_fee and fs.is_active
   and fs.effective_on<=(now() at time zone 'Africa/Libreville')::date
   and (fs.scope_type='school' or fs.scope_type='level' and fs.grade_level_id=cg.grade_level_id
     or fs.scope_type='class' and fs.class_group_id=sr.class_group_id or fs.scope_type='student' and fs.student_id=sr.id)
 where sr.id=target_student and sr.school_id=target_school and sr.academic_year_id=target_year and sr.status='active'
 order by case fs.scope_type when 'student' then 1 when 'class' then 2 when 'level' then 3 else 4 end,fs.created_at desc limit 1;
$$;

create or replace function public.assign_finance_charge(target_scale uuid,target_student uuid) returns public.finance_student_charges
language plpgsql security definer set search_path=public as $$
declare scale public.finance_fee_scales; student public.student_records; charge public.finance_student_charges; schedule uuid;
begin
 select * into scale from public.finance_fee_scales where id=target_scale and is_active for share;
 if scale.id is null or not public.finance_is_manager(scale.school_id) then raise exception 'Barème introuvable ou droits insuffisants.'; end if;
 select * into student from public.student_records where id=target_student and school_id=scale.school_id and academic_year_id=scale.academic_year_id and status='active';
 if student.id is null then raise exception 'Élève d’un autre établissement ou d’une autre année.'; end if;
 if (scale.scope_type='class' and student.class_group_id is distinct from scale.class_group_id)
   or (scale.scope_type='level' and not exists(select 1 from public.class_groups c where c.id=student.class_group_id and c.grade_level_id=scale.grade_level_id and c.school_id=scale.school_id and c.academic_year_id=scale.academic_year_id))
   or (scale.scope_type='student' and student.id is distinct from scale.student_id) then raise exception 'Le barème ne s’applique pas à cet élève.'; end if;
 if public.finance_winning_scale(scale.school_id,scale.academic_year_id,scale.fee_type_id,student.id) is distinct from scale.id then raise exception 'Un barème plus prioritaire s’applique à cet élève.'; end if;
 insert into public.finance_student_charges(school_id,academic_year_id,student_id,class_group_id,fee_type_id,source_scale_id,amount_fcfa,scope_snapshot,assigned_by)
 values(scale.school_id,scale.academic_year_id,student.id,student.class_group_id,scale.fee_type_id,scale.id,scale.amount_fcfa,jsonb_build_object('scope_type',scale.scope_type,'grade_level_id',scale.grade_level_id,'class_group_id',scale.class_group_id),auth.uid()) returning * into charge;
 select id into schedule from public.finance_schedules where fee_scale_id=scale.id and status='active' order by created_at desc limit 1;
 insert into public.finance_charge_installments(charge_id,source_installment_id,label,due_on,amount_fcfa,position)
 select charge.id,i.id,i.label,i.due_on,i.amount_fcfa,i.position from public.finance_schedule_installments i where i.schedule_id=schedule and i.status='active';
 if (select coalesce(sum(amount_fcfa),0) from public.finance_charge_installments where charge_id=charge.id)<>charge.amount_fcfa then raise exception 'Échéancier incohérent.'; end if;
 return charge;
end; $$;

create or replace function public.apply_finance_scale_collectively(target_scale uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare scale public.finance_fee_scales; candidate record; created_count integer:=0; existing_count integer:=0; eligible_count integer:=0;
 overshadowed_count integer:=0; conflict_count integer:=0; constraint_hit text; winner uuid; existing_source uuid;
begin
 select * into scale from public.finance_fee_scales where id=target_scale and is_active for share;
 if scale.id is null or not public.finance_is_manager(scale.school_id) then raise exception 'Barème introuvable ou droits insuffisants.'; end if;
 for candidate in
   select sr.id from public.student_records sr left join public.class_groups cg on cg.id=sr.class_group_id
   where sr.school_id=scale.school_id and sr.academic_year_id=scale.academic_year_id and sr.status='active'
     and (scale.scope_type='school' or scale.scope_type='level' and cg.grade_level_id=scale.grade_level_id
       or scale.scope_type='class' and sr.class_group_id=scale.class_group_id or scale.scope_type='student' and sr.id=scale.student_id)
 loop
   eligible_count:=eligible_count+1;
   winner:=public.finance_winning_scale(scale.school_id,scale.academic_year_id,scale.fee_type_id,candidate.id);
   if winner is distinct from scale.id then overshadowed_count:=overshadowed_count+1; continue; end if;
   existing_source:=null;
   select c.source_scale_id into existing_source from public.finance_student_charges c where c.school_id=scale.school_id and c.academic_year_id=scale.academic_year_id and c.student_id=candidate.id and c.fee_type_id=scale.fee_type_id;
   if found then
     if existing_source=winner then existing_count:=existing_count+1; else conflict_count:=conflict_count+1; end if;
   else
     begin
       perform public.assign_finance_charge(scale.id,candidate.id);created_count:=created_count+1;
     exception when unique_violation then
       get stacked diagnostics constraint_hit=constraint_name;
       if constraint_hit='finance_student_charges_unique_fee' then
         select c.source_scale_id into existing_source from public.finance_student_charges c where c.school_id=scale.school_id and c.academic_year_id=scale.academic_year_id and c.student_id=candidate.id and c.fee_type_id=scale.fee_type_id;
         if existing_source=winner then existing_count:=existing_count+1; else conflict_count:=conflict_count+1; end if;
       else raise; end if;
     end;
   end if;
 end loop;
 insert into public.school_audit_events(school_id,user_id,actor_role,audit_action,module,entity_id,after_data,event_status)
 values(scale.school_id,auth.uid(),'finance_manager','scale.applied_collectively','finance',scale.id::text,jsonb_build_object('eligible',eligible_count,'created',created_count,'existing',existing_count,'overshadowed',overshadowed_count,'conflicts',conflict_count),'success');
 return jsonb_build_object('eligible_count',eligible_count,'created_count',created_count,'existing_count',existing_count,'overshadowed_count',overshadowed_count,'conflict_count',conflict_count,'amount_per_student',scale.amount_fcfa,'theoretical_total',(eligible_count-overshadowed_count)*scale.amount_fcfa,'created_total',created_count*scale.amount_fcfa);
end; $$;

create or replace function public.cancel_finance_payment(payment_id uuid, reason text) returns public.finance_payments
language plpgsql security definer set search_path=public as $$ declare result public.finance_payments; cash_day date; cashier uuid;
begin
 select * into result from public.finance_payments where id=payment_id;
 if result.id is null then raise exception 'Paiement introuvable.'; end if;
 if not public.finance_is_manager(result.school_id) then raise exception 'Annulation réservée à la direction.'; end if;
 if length(btrim(coalesce(reason,''))) < 5 then raise exception 'Un motif d’annulation est obligatoire.'; end if;
 cash_day := (result.paid_at at time zone 'Africa/Libreville')::date; cashier := result.collected_by;
 perform pg_advisory_xact_lock(hashtextextended(result.school_id::text||':'||cashier::text||':'||cash_day::text,0));
 select * into result from public.finance_payments where id=payment_id for update;
 if result.id is null then raise exception 'Paiement introuvable.'; end if;
 if result.status='cancelled' then raise exception 'Ce paiement est déjà annulé.'; end if;
 update public.finance_payments set status='cancelled',cancellation_reason=btrim(reason),cancelled_by=auth.uid(),cancelled_at=now(),updated_at=now() where id=payment_id returning * into result;
 insert into public.school_audit_events(school_id,user_id,actor_role,audit_action,module,entity_id,after_data,event_status) values(result.school_id,auth.uid(),'finance_manager','payment.cancelled','finance',result.id::text,jsonb_build_object('reason',reason,'receipt_number',result.receipt_number),'success');
 return result;
end; $$;

create or replace function public.close_finance_cash(target_school uuid, cash_day date, cashier uuid, comment text default null) returns public.finance_cash_closures
language plpgsql security definer set search_path=public as $$ declare s uuid:=target_school; result public.finance_cash_closures; active_count integer; active_total integer; methods jsonb; cancelled_count integer; cancelled_total integer; constraint_hit text;
begin
 if cash_day>(now() at time zone 'Africa/Libreville')::date then raise exception 'Une caisse future ne peut pas être clôturée.'; end if;
 if not public.finance_is_staff(s) or (cashier<>auth.uid() and not public.finance_is_manager(s)) then raise exception 'Droits de clôture insuffisants.'; end if;
 if not public.finance_is_staff(s) or not exists(select 1 from public.school_memberships sm where sm.school_id=s and sm.user_id=cashier and sm.status='active' and sm.role::text in ('school_admin','headmaster','secretary')) then raise exception 'Le caissier n’appartient pas à cet établissement.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(s::text||':'||cashier::text||':'||cash_day::text,0));
 select count(*),coalesce(sum(amount_fcfa),0) into active_count,active_total from public.finance_payments where school_id=s and collected_by=cashier and (paid_at at time zone 'Africa/Libreville')::date=cash_day and status='active';
 select coalesce(jsonb_object_agg(payment_method,total),'{}'::jsonb) into methods from (select payment_method,sum(amount_fcfa) total from public.finance_payments where school_id=s and collected_by=cashier and (paid_at at time zone 'Africa/Libreville')::date=cash_day and status='active' group by payment_method) x;
 select count(*),coalesce(sum(amount_fcfa),0) into cancelled_count,cancelled_total from public.finance_payments where school_id=s and collected_by=cashier and (paid_at at time zone 'Africa/Libreville')::date=cash_day and status='cancelled';
 insert into public.finance_cash_closures(school_id,cash_date,cashier_id,payment_count,total_fcfa,method_totals,cancelled_summary,comment,closed_by)
 values(s,cash_day,cashier,active_count,active_total,methods,jsonb_build_object('count',cancelled_count,'amount_fcfa',cancelled_total),comment,auth.uid())
 returning * into result;
 insert into public.school_audit_events(school_id,user_id,actor_role,audit_action,module,entity_id,after_data,event_status) values(s,auth.uid(),'finance_staff','cash.closed','finance',result.id::text,jsonb_build_object('cash_date',cash_day,'total_fcfa',active_total),'success');
 return result;
exception when unique_violation then
 get stacked diagnostics constraint_hit=constraint_name;
 if constraint_hit='finance_cash_closures_school_id_cash_date_cashier_id_key' then raise exception 'La caisse est déjà clôturée pour ce caissier et cette date.'; end if;
 raise;
end; $$;

create or replace function public.get_my_parent_finance_summary(target_school uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Session expirée.'; end if;
 if not exists(select 1 from public.finance_settings fs where fs.school_id=target_school and fs.parent_publication_enabled) then return jsonb_build_object('published',false,'children','[]'::jsonb); end if;
 select jsonb_build_object('published',true,'children',coalesce(jsonb_agg(jsonb_build_object(
   'id',sr.id,'first_name',sr.first_name,'last_name',sr.last_name,'registration_number',sr.registration_number,
   'charges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'amount_fcfa',c.amount_fcfa,'label',ft.label) order by ft.label)
      from public.finance_student_charges c join public.finance_fee_scales sc on sc.id=c.source_scale_id and sc.publish_to_parents
      join public.finance_fee_types ft on ft.id=c.fee_type_id where c.school_id=target_school and c.student_id=sr.id and c.status='active'),'[]'::jsonb),
   'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount_fcfa',visible.amount_fcfa,'receipt_number',p.receipt_number,'paid_at',p.paid_at,'status',p.status) order by p.paid_at desc)
      from public.finance_payments p join lateral (select sum(a.amount_fcfa)::integer amount_fcfa from public.finance_payment_allocations a
       join public.finance_charge_installments ci on ci.id=a.charge_installment_id join public.finance_student_charges c on c.id=ci.charge_id
       join public.finance_fee_scales sc on sc.id=c.source_scale_id and sc.publish_to_parents where a.payment_id=p.id and c.student_id=sr.id) visible on visible.amount_fcfa is not null
      where p.school_id=target_school and p.student_id=sr.id),'[]'::jsonb)
 )),'[]'::jsonb)) into result
 from public.guardians g join public.guardian_student_links l on l.guardian_id=g.id and l.school_id=g.school_id
 join public.student_records sr on sr.id=l.student_id and sr.school_id=l.school_id
 where g.profile_id=auth.uid() and g.school_id=target_school and g.status='active';
 return coalesce(result,jsonb_build_object('published',true,'children','[]'::jsonb));
end; $$;

revoke all on function public.finance_is_staff(uuid), public.finance_is_manager(uuid), public.finance_is_linked_guardian(uuid,uuid), public.finance_validate_school_links(), public.finance_validate_charge_installment(), public.finance_audit_change(), public.finance_winning_scale(uuid,uuid,uuid,uuid), public.configure_finance_scale(jsonb), public.assign_finance_charge(uuid,uuid), public.apply_finance_scale_collectively(uuid), public.record_finance_payment(jsonb), public.cancel_finance_payment(uuid,text), public.close_finance_cash(uuid,date,uuid,text), public.get_my_parent_finance_summary(uuid) from public;
grant execute on function public.finance_is_staff(uuid), public.finance_is_manager(uuid), public.finance_is_linked_guardian(uuid,uuid), public.configure_finance_scale(jsonb), public.assign_finance_charge(uuid,uuid), public.apply_finance_scale_collectively(uuid), public.record_finance_payment(jsonb), public.cancel_finance_payment(uuid,text), public.close_finance_cash(uuid,date,uuid,text), public.get_my_parent_finance_summary(uuid) to authenticated;
notify pgrst, 'reload schema';
