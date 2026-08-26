-- Gabon Éduc+ — Par quel canal ce parent a-t-il été joint ?
--
-- La campagne portait déjà un canal, mais un seul, choisi à l'avance pour tout
-- le monde. Or c'est parent par parent que la question se pose : celui qui n'a
-- pas WhatsApp doit être joint par SMS, et le secrétariat doit pouvoir le
-- constater ligne par ligne.
--
-- Sans cette colonne, un parent joint par SMS était marqué « envoyé » comme les
-- autres, et rien ne distinguait plus une famille prévenue par WhatsApp d'une
-- famille prévenue autrement — ni, surtout, d'une famille qu'on avait crue
-- joignable sur WhatsApp et qui ne l'était pas.

alter table public.message_recipients
  add column if not exists sent_channel text
    check (sent_channel is null or sent_channel in ('whatsapp', 'sms', 'manual'));

comment on column public.message_recipients.sent_channel is
  'Canal réellement employé pour joindre ce parent. Nul tant que la ligne n''est pas traitée.';

notify pgrst, 'reload schema';
