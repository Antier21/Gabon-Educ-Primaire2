-- Gabon Éduc+ Primaire — privilèges définitifs des fonctions financières
-- Correctif idempotent reproduisant l’état validé après la migration 100.

revoke all on function public.finance_audit_change() from public, anon, authenticated;
revoke all on function public.finance_validate_charge_installment() from public, anon, authenticated;
revoke all on function public.finance_validate_school_links() from public, anon, authenticated;
revoke all on function public.finance_winning_scale(uuid, uuid, uuid, uuid) from public, anon, authenticated;

revoke all on function public.apply_finance_scale_collectively(uuid) from public, anon;
revoke all on function public.assign_finance_charge(uuid, uuid) from public, anon;
revoke all on function public.cancel_finance_payment(uuid, text) from public, anon;
revoke all on function public.close_finance_cash(uuid, date, uuid, text) from public, anon;
revoke all on function public.configure_finance_scale(jsonb) from public, anon;
revoke all on function public.finance_is_linked_guardian(uuid, uuid) from public, anon;
revoke all on function public.finance_is_manager(uuid) from public, anon;
revoke all on function public.finance_is_staff(uuid) from public, anon;
revoke all on function public.get_my_parent_finance_summary(uuid) from public, anon;
revoke all on function public.record_finance_payment(jsonb) from public, anon;

grant execute on function public.apply_finance_scale_collectively(uuid) to authenticated;
grant execute on function public.assign_finance_charge(uuid, uuid) to authenticated;
grant execute on function public.cancel_finance_payment(uuid, text) to authenticated;
grant execute on function public.close_finance_cash(uuid, date, uuid, text) to authenticated;
grant execute on function public.configure_finance_scale(jsonb) to authenticated;
grant execute on function public.finance_is_linked_guardian(uuid, uuid) to authenticated;
grant execute on function public.finance_is_manager(uuid) to authenticated;
grant execute on function public.finance_is_staff(uuid) to authenticated;
grant execute on function public.get_my_parent_finance_summary(uuid) to authenticated;
grant execute on function public.record_finance_payment(jsonb) to authenticated;

notify pgrst, 'reload schema';
