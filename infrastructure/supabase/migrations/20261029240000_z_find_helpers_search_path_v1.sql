-- Z Find — search_path fixé sur les fonctions utilitaires des mises en avant
-- et des contacts vendeurs (avertissement Supabase 0011
-- function_search_path_mutable). Aucun changement de comportement. Idempotent.
alter function public.zfind_highlight_capacity() set search_path = '';
alter function public.zfind_agency_feature_capacity() set search_path = '';
alter function public.zfind_paris_today() set search_path = '';
alter function public.zfind_seller_lead_qualified(text, text) set search_path = '';
alter function public.zfind_city_commune(text) set search_path = '';
alter function public.zfind_seller_lead_on_sale(public.zfind_estimation_requests) set search_path = public;
