-- Undo AdminBatch012 (Content & Maps + Money database). TEST project only.
-- WARNING: this removes the moderation register, photo reviews and the money ledger with everything in them.
-- On a project with real data, export those tables first and get Joe's written yes.
drop policy if exists "eab admin read listing photos" on storage.objects;

drop function if exists public.eab_admin_mod_cases(text, uuid, text), public.eab_admin_mod_get(uuid, text), public.eab_admin_mod_create(jsonb, text),
  public.eab_admin_mod_update(uuid, jsonb, text, text), public.eab_admin_mod_note(uuid, text, text), public.eab_admin_mod_suspects(text),
  public.eab_admin_photo_queue(text, integer, text), public.eab_admin_photo_review(uuid, text, text, text, text, text), public.eab_admin_dup_listings(text),
  public.eab_admin_map_listings(text, text, text, text, text), public.eab_admin_geo_agents(), public.eab_admin_contacts_stats(date, date, text),
  public.eab_admin_price_trends(integer, text, text, text), public.eab_admin_ai_usage(date, date, text), public.eab_admin_studio_usage(date, date, text),
  public.eab_admin_ledger(date, date, text, boolean, text), public.eab_admin_ledger_add(jsonb, text), public.eab_admin_ledger_void(uuid, text, text),
  public.eab_admin_ledger_repeat(date, text, text), public.eab_admin_money_settings(), public.eab_admin_money_settings_set(jsonb, text, text),
  public.eab_admin_api_sku_set(text, jsonb, text, text), public.eab_admin_api_usage(integer, text), public.eab_admin_money_summary(integer),
  public.eab_admin_photo_can_read(text);

drop function if exists public.eab_c10_case_new(jsonb, text), public.eab_c10_case_json(uuid, boolean), public.eab_c10_checks(),
  public.eab_c10_listing_photos(), public.eab_c10_open_listings(), public.eab_c10_listing(uuid, text, jsonb, bigint), public.eab_c10_rm(numeric),
  public.eab_c10_photo_count(jsonb), public.eab_c10_ppsf(jsonb), public.eab_c10_price(jsonb), public.eab_c10_side(jsonb),
  public.eab_m11_calls(date), public.eab_m11_cost(numeric, numeric, integer), public.eab_m11_settings(), public.eab_m11_entry(public.eab_ledger),
  public.eab_b12_reason(text, text);

drop table if exists public.eab_photo_reviews, public.eab_mod_events, public.eab_mod_cases, public.eab_ledger, public.eab_money_settings, public.eab_api_skus;
drop function if exists public.eab_b12_protect();
drop sequence if exists public.eab_mod_seq, public.eab_ledger_seq;
