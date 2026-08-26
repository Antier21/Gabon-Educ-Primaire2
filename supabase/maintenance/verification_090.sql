-- À exécuter APRÈS la migration 090.
-- Les six politiques doivent toutes s'appuyer sur une fonction, et plus
-- aucune ne doit contenir de sous-requête sur « student_records ».
select tablename                       as table_concernee,
       policyname                      as politique,
       case
         when qual like '%student_records%' then '>>> ENCORE RECURSIVE'
         when qual like '%is_family_of_school%'
           or qual like '%is_family_of_class%' then 'corrigee'
         else 'a verifier : ' || left(qual, 60)
       end                             as etat
from pg_policies
where schemaname = 'public'
  and policyname in (
    'report_model_domains_family_read',
    'report_model_skills_family_read',
    'report_model_lines_family_read',
    'school_periods_family_read',
    'report_publications_read',
    'timetable_family_read'
  )
order by tablename, policyname;
