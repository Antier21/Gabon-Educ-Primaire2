-- Gabon Éduc+ — Retirer les trimestres créés en double
--
-- Le découpage de l'année comparait les libellés caractère par caractère.
-- « Trimestre 1 », posé à l'ouverture de l'établissement, n'a donc pas été
-- reconnu comme « 1er trimestre », et un second jeu de trimestres a été créé
-- par-dessus le premier. Les enseignants voient six trimestres au lieu de trois.
--
-- Le code est corrigé et n'en créera plus. Reste à retirer ceux qui existent.
--
-- À exécuter section par section, en lisant le résultat de chacune avant de
-- passer à la suivante.

-- ---------------------------------------------------------------------------
-- 1. Ce qui existe aujourd'hui, et ce que chaque période porte comme notes.
-- ---------------------------------------------------------------------------
select p.id, p.label, p.period_kind, p.sequence_number,
       (select count(*) from public.report_line_scores s where s.period_id = p.id) as notes_bulletin,
       (select count(*) from public.report_cards r where r.grading_period_id = p.id) as bulletins
from public.school_periods p
order by p.period_kind, p.sequence_number nulls last, p.label;

-- ---------------------------------------------------------------------------
-- 2. Les doublons candidats à la suppression.
--
-- On ne garde qu'une période par « clé » — trimestre 1, trimestre 2, etc. —
-- et l'on retient la plus ancienne, celle posée à l'ouverture de
-- l'établissement : c'est elle que les autres modules connaissent déjà.
--
-- Une période qui porte des notes ou des bulletins n'est jamais proposée à la
-- suppression, même en double. Cette requête ne supprime rien : elle liste.
-- ---------------------------------------------------------------------------
with cle as (
  select p.*,
         case
           when lower(p.label) like '%palier%'
             then 'palier-' || coalesce(substring(p.label from '[0-9]+'), '')
           when lower(p.label) like '%trimestre%'
             then 'trimestre-' || coalesce(substring(p.label from '[0-9]+'), '')
           when lower(p.label) like '%semestre%'
             then 'semestre-' || coalesce(substring(p.label from '[0-9]+'), '')
           when lower(p.label) like '%annuel%' or lower(p.label) like '%bilan%'
             then 'annuel'
           else lower(p.label)
         end as periode_cle
  from public.school_periods p
),
rang as (
  select c.*,
         row_number() over (
           partition by c.school_id, c.academic_year_id, c.periode_cle
           order by c.created_at
         ) as position
  from cle c
)
select r.id, r.label, r.periode_cle, r.created_at,
       (select count(*) from public.report_line_scores s where s.period_id = r.id) as notes_bulletin
from rang r
where r.position > 1
  and not exists (select 1 from public.report_line_scores s where s.period_id = r.id)
  and not exists (select 1 from public.report_cards b where b.grading_period_id = r.id)
order by r.periode_cle;

-- ---------------------------------------------------------------------------
-- 3. La suppression.
--
-- N'exécutez cette section qu'après avoir lu la liste de la section 2 : ce
-- sont exactement ces lignes qui disparaîtront. Les paliers rattachés à un
-- trimestre supprimé ne sont pas perdus — leur rattachement passe simplement
-- à NULL, et le prochain enregistrement du découpage le rétablira.
-- ---------------------------------------------------------------------------
with cle as (
  select p.*,
         case
           when lower(p.label) like '%palier%'
             then 'palier-' || coalesce(substring(p.label from '[0-9]+'), '')
           when lower(p.label) like '%trimestre%'
             then 'trimestre-' || coalesce(substring(p.label from '[0-9]+'), '')
           when lower(p.label) like '%semestre%'
             then 'semestre-' || coalesce(substring(p.label from '[0-9]+'), '')
           when lower(p.label) like '%annuel%' or lower(p.label) like '%bilan%'
             then 'annuel'
           else lower(p.label)
         end as periode_cle
  from public.school_periods p
),
rang as (
  select c.*,
         row_number() over (
           partition by c.school_id, c.academic_year_id, c.periode_cle
           order by c.created_at
         ) as position
  from cle c
)
delete from public.school_periods
where id in (
  select r.id from rang r
  where r.position > 1
    and not exists (select 1 from public.report_line_scores s where s.period_id = r.id)
    and not exists (select 1 from public.report_cards b where b.grading_period_id = r.id)
);

-- ---------------------------------------------------------------------------
-- 4. Contrôle : il ne doit plus rester qu'une période par clé.
-- ---------------------------------------------------------------------------
select p.label, p.period_kind, p.sequence_number
from public.school_periods p
order by p.period_kind, p.sequence_number nulls last, p.label;
