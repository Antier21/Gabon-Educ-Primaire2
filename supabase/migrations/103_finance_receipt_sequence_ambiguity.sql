-- Gabon Éduc+ Primaire — correction de l’ambiguïté de l’année de séquence des reçus

create or replace function public.record_finance_payment(payload jsonb) returns public.finance_payments
language plpgsql security definer set search_path=public as $$
declare s uuid; y uuid; st uuid; guardian uuid; idem uuid; total integer; available integer; allocated integer:=0;
 seq bigint; prefix text; result public.finance_payments; item jsonb; locked_id uuid; incoming_allocations jsonb; stored_allocations jsonb;
 constraint_hit text; cash_day date; receipt_year integer;
begin
 if auth.uid() is null then raise exception 'Session expirée.'; end if;
 s := (payload->>'school_id')::uuid; y := (payload->>'academic_year_id')::uuid; st := (payload->>'student_id')::uuid;
 guardian := nullif(payload->>'guardian_id','')::uuid; idem := (payload->>'idempotency_key')::uuid; total := (payload->>'amount_fcfa')::integer;
 if not public.finance_is_staff(s) then raise exception 'Droits financiers insuffisants.'; end if;
 cash_day := (now() at time zone 'Africa/Libreville')::date; receipt_year := extract(year from now() at time zone 'Africa/Libreville')::integer;
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
 insert into public.finance_receipt_sequences(
   school_id,
   sequence_year,
   last_value
 )
 values(
   s,
   receipt_year,
   1
 )
 on conflict on constraint finance_receipt_sequences_pkey
 do update
 set last_value=public.finance_receipt_sequences.last_value+1,
     updated_at=now()
 returning last_value into seq;
 select coalesce(receipt_prefix,'REC') into prefix from public.finance_settings where school_id=s;
 prefix := coalesce(prefix,'REC');
 begin
  insert into public.finance_payments(school_id,academic_year_id,student_id,guardian_id,payer_name,amount_fcfa,payment_method,external_reference,comment,collected_by,receipt_number,idempotency_key)
  values(s,y,st,guardian,btrim(payload->>'payer_name'),total,payload->>'payment_method',nullif(payload->>'external_reference',''),nullif(payload->>'comment',''),auth.uid(),prefix||'-'||receipt_year||'-'||lpad(seq::text,6,'0'),idem) returning * into result;
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

revoke all on function public.record_finance_payment(jsonb) from public, anon;
grant execute on function public.record_finance_payment(jsonb) to authenticated;

notify pgrst, 'reload schema';
