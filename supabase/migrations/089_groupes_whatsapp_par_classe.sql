-- Gabon Éduc+ — Le groupe WhatsApp de chaque classe
--
-- Constat de terrain, et il vaut mieux qu'un relevé de code : dans les
-- établissements équipés, les messages aux parents ne partent pas un par un.
-- Les surveillants tiennent un groupe WhatsApp par classe, sur un téléphone, et
-- y collent le message à la main.
--
-- Le logiciel ne peut pas prendre la main sur ce téléphone — piloter WhatsApp
-- depuis une page web suppose une extension ou une bibliothèque non
-- officielle, et le prix du refus n'est pas un message d'erreur : c'est le
-- numéro de l'établissement qui est suspendu. L'API officielle de Meta gère
-- bien des groupes, mais les siens : elle ne reprend pas ceux déjà créés
-- depuis un téléphone.
--
-- Reste ce que le logiciel fait le mieux et que le surveillant fait le moins
-- bien : composer. Le message est rédigé une fois, avec les bonnes variables et
-- la formulation de l'établissement ; il ne reste qu'à le déposer dans le
-- groupe. Vingt classes, vingt gestes — au lieu de mille deux cents.

create table if not exists public.class_whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_group_id uuid not null references public.class_groups(id) on delete cascade,
  -- Le nom exact du groupe tel qu'il apparaît dans WhatsApp : c'est ce que le
  -- surveillant cherchera dans sa liste de conversations.
  group_name text not null,
  -- Lien d'invitation « chat.whatsapp.com/… ». Il ne sert pas à envoyer — il
  -- sert à faire entrer un nouveau parent dans le groupe en cours d'année.
  invite_link text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_group_id)
);

create index if not exists idx_class_whatsapp_groups_school
  on public.class_whatsapp_groups(school_id);

alter table public.class_whatsapp_groups enable row level security;

-- Lecture ouverte au personnel de l'établissement : un enseignant doit pouvoir
-- constater que sa classe a bien un groupe déclaré.
drop policy if exists class_whatsapp_groups_read on public.class_whatsapp_groups;
create policy class_whatsapp_groups_read on public.class_whatsapp_groups
  for select to authenticated
  using (public.belongs_to_school(school_id));

-- Écriture au secrétariat et à la direction : ce sont eux qui tiennent les
-- groupes. « has_school_role » est une fonction « security definer » : la
-- vérification s'exécute hors politiques, et aucune récursion n'est possible.
drop policy if exists class_whatsapp_groups_write on public.class_whatsapp_groups;
create policy class_whatsapp_groups_write on public.class_whatsapp_groups
  for all to authenticated
  using (public.has_school_role(school_id, array['school_admin','headmaster','secretary','academic_director']))
  with check (public.has_school_role(school_id, array['school_admin','headmaster','secretary','academic_director']));

drop trigger if exists trg_class_whatsapp_groups_updated_at on public.class_whatsapp_groups;
create trigger trg_class_whatsapp_groups_updated_at before update on public.class_whatsapp_groups
for each row execute function public.set_updated_at();

-- Un quatrième canal : le groupe classe.
--
-- La contrainte est reposée en entier plutôt que complétée : c'est la seule
-- façon d'obtenir le même résultat que la migration 088 ait été appliquée ou
-- non.
alter table public.message_recipients
  drop constraint if exists message_recipients_sent_channel_check;
alter table public.message_recipients
  add column if not exists sent_channel text;
alter table public.message_recipients
  add constraint message_recipients_sent_channel_check
  check (sent_channel is null or sent_channel in ('whatsapp', 'sms', 'manual', 'group'));

notify pgrst, 'reload schema';
