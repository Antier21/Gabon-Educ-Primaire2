-- Gabon Éduc+ — Le verrou de la saisie, et à qui appartient la note
--
-- Deux règles de l'établissement, que la migration 081 ne posait pas encore.
--
--   1. Aucune note n'est modifiable sur le bulletin. Le bulletin affiche ; il
--      ne saisit pas. Les notes y entrent depuis l'espace de l'enseignant, et
--      de nulle part ailleurs.
--
--   2. La direction dispose d'un verrou. Quand une période est verrouillée, la
--      saisie s'arrête — c'est ce qui permet d'arrêter les notes avant un
--      conseil de classe, puis de rouvrir pour une correction.
--
-- Le verrou existait déjà sur « school_periods » (is_locked, locked_by,
-- locked_at, reopened_reason) et n'était utilisé nulle part. On s'en sert
-- plutôt que d'en inventer un second : deux verrous pour la même période
-- auraient fini par se contredire.

-- Un contrôle qui ne vivrait que dans l'écran de saisie ne protégerait rien :
-- il suffirait d'un appel direct à l'API pour écrire dans une période close.
-- Le refus est donc posé en base, sur l'écriture elle-même.
create or replace function public.check_report_period_open()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  verrouillee boolean;
  libelle text;
begin
  select is_locked, label into verrouillee, libelle
    from public.school_periods where id = new.period_id;

  if verrouillee is null then
    raise exception 'Cette période n''existe plus.';
  end if;

  -- La direction garde la main même verrou posé : c'est elle qui l'a posé, et
  -- lui interdire la correction l'obligerait à déverrouiller pour toute la
  -- classe afin de rectifier une seule note.
  if verrouillee and not public.has_school_role(
       new.school_id, array['school_admin','headmaster','academic_director']
     ) then
    raise exception
      'La saisie de « % » est fermée par la direction. Rapprochez-vous d''elle pour la rouvrir.',
      libelle;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_report_line_scores_periode_ouverte on public.report_line_scores;
create trigger trg_report_line_scores_periode_ouverte
  before insert or update on public.report_line_scores
  for each row execute function public.check_report_period_open();

-- La suppression aussi : effacer une note dans une période close reviendrait à
-- la modifier, puisque la case redeviendrait « non évaluée ».
create or replace function public.check_report_period_open_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  verrouillee boolean;
  libelle text;
begin
  select is_locked, label into verrouillee, libelle
    from public.school_periods where id = old.period_id;
  if verrouillee and not public.has_school_role(
       old.school_id, array['school_admin','headmaster','academic_director']
     ) then
    raise exception
      'La saisie de « % » est fermée par la direction. Rapprochez-vous d''elle pour la rouvrir.',
      libelle;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_report_line_scores_periode_ouverte_suppr on public.report_line_scores;
create trigger trg_report_line_scores_periode_ouverte_suppr
  before delete on public.report_line_scores
  for each row execute function public.check_report_period_open_on_delete();

-- L'écriture revient à qui tient la classe.
--
-- « can_manage_class » couvre déjà l'enseignant affecté à la classe, ainsi que
-- la direction — la branche « has_school_role » que portait la politique de la
-- migration 081 faisait donc doublon. La simplifier évite qu'un jour l'une des
-- deux soit corrigée et pas l'autre.
drop policy if exists report_line_scores_write on public.report_line_scores;
create policy report_line_scores_write on public.report_line_scores
  for all to authenticated
  using (exists(
    select 1 from public.student_records sr
    where sr.id = student_id
      and public.can_manage_class(sr.school_id, sr.class_group_id)
  ))
  with check (exists(
    select 1 from public.student_records sr
    where sr.id = student_id
      and public.can_manage_class(sr.school_id, sr.class_group_id)
  ));

-- Poser et lever le verrou, en nommant qui l'a fait.
--
-- « school_periods » est déjà réservée en écriture à la direction par la
-- politique de la migration 014 ; cette fonction ne rouvre donc aucun droit,
-- elle horodate simplement le geste et en garde l'auteur.
create or replace function public.set_period_lock(
  target_period uuid,
  locked boolean,
  reason text default null
)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.school_periods
     set is_locked = locked,
         locked_by = case when locked then auth.uid() else null end,
         locked_at = case when locked then now() else null end,
         reopened_reason = case when locked then null else reason end,
         updated_at = now()
   where id = target_period;

  if not found then
    raise exception 'Période introuvable, ou droits insuffisants pour la modifier.';
  end if;
end;
$$;

revoke all on function public.set_period_lock(uuid, boolean, text) from public;
grant execute on function public.set_period_lock(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
