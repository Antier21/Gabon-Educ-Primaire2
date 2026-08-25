-- Gabon Éduc+ — Le responsable met à jour ses propres coordonnées
--
-- Le secrétariat saisit le numéro d'un parent le jour de l'inscription, puis
-- ce numéro vieillit. Le parent change d'opérateur, perd sa puce, déménage —
-- et l'établissement continue d'appeler dans le vide. C'est précisément ce que
-- comptait le bureau du secrétariat sous « responsables sans téléphone
-- utilisable » : un travail de rattrapage que personne ne peut faire à la
-- place de l'intéressé, puisque lui seul connaît son nouveau numéro.
--
-- Restait à ouvrir l'écriture sans ouvrir la fiche entière. Un parent ne doit
-- pouvoir toucher ni à son nom, ni à son rattachement, ni à son établissement,
-- ni au statut de sa fiche : ce sont des données d'état civil et de scolarité
-- qui appartiennent à l'établissement.
--
-- Une politique RLS ne suffirait pas ici. Supabase accorde à « authenticated »
-- les droits sur toutes les colonnes de la table ; une politique qui
-- autoriserait la mise à jour de sa propre ligne autoriserait du même coup la
-- modification du nom. On passe donc par une fonction, seule autorisée à
-- écrire, et qui ne touche que trois colonnes.

create or replace function public.update_my_guardian_contact(
  new_phone text,
  new_email text,
  new_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_phone text;
  cleaned_email text;
  cleaned_address text;
  result jsonb;
begin
  -- Le numéro est nettoyé de tout ce qui n'est ni chiffre ni indicatif : les
  -- parents écrivent « 077 03 77 07 », « +241 77037707 », « 077-03-77-07 ».
  -- Ces trois écritures désignent la même ligne et doivent être stockées de
  -- la même façon, sans quoi les envois WhatsApp échouent silencieusement.
  cleaned_phone := regexp_replace(coalesce(new_phone, ''), '[^0-9+]', '', 'g');
  if length(regexp_replace(cleaned_phone, '[^0-9]', '', 'g')) < 8 then
    raise exception 'Le numéro de téléphone doit comporter au moins 8 chiffres.';
  end if;

  cleaned_email := nullif(btrim(coalesce(new_email, '')), '');
  if cleaned_email is not null
     and cleaned_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'L''adresse électronique saisie n''est pas valide.';
  end if;

  cleaned_address := nullif(btrim(coalesce(new_address, '')), '');

  -- « profile_id = auth.uid() » sans autre filtre : un même parent peut avoir
  -- une fiche dans deux établissements — deux enfants, deux écoles. Son
  -- numéro est le même partout, et il serait absurde de lui demander de le
  -- corriger école par école.
  update public.guardians
     set phone = cleaned_phone,
         email = cleaned_email,
         address = cleaned_address,
         updated_at = now()
   where profile_id = auth.uid()
     and status = 'active'
  returning jsonb_build_object('phone', phone, 'email', email, 'address', address)
       into result;

  if result is null then
    raise exception 'Aucune fiche de responsable active n''est rattachée à ce compte.';
  end if;

  return result;
end;
$$;

revoke all on function public.update_my_guardian_contact(text, text, text) from public;
grant execute on function public.update_my_guardian_contact(text, text, text) to authenticated;

-- La fiche est déjà lisible par son titulaire (« guardians_staff_read » couvre
-- « profile_id = auth.uid() »), mais elle ne renvoyait pas les coordonnées :
-- l'espace famille ne demandait que le nom. Rien à changer côté politique, la
-- lecture des colonnes suit la ligne.

notify pgrst, 'reload schema';
