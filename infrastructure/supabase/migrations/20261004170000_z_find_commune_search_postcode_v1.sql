-- ============================================================
-- Z FIND — recherche de commune : un code postal montre toutes ses communes
--
-- 74500 dessert 14 communes (Évian-les-Bains, Publier, Neuvecelle…) :
-- la limite de 12 et le tri par longueur de nom pouvaient cacher la plus
-- connue. Par code postal : jusqu'à 40 résultats, code exact d'abord,
-- puis ordre alphabétique. Par nom : inchangé (12, pertinence).
-- ============================================================

create or replace function public.zfind_commune_search(p_country text, p_query text)
returns table (code text, name text, postcodes text[], parent text, zone_label text)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select upper(coalesce(p_country, '')) as c,
           lower(btrim(coalesce(p_query, ''))) as t
  ), m as (
    select c.code, c.name, c.postcodes, c.parent,
           q.t ~ '^[0-9]+$' as by_postcode,
           case
             when q.t ~ '^[0-9]+$' then case when q.t = any (c.postcodes) then 6 else 3 end
             when c.name_folded = q.t then 5
             when c.aliases_folded like '%|' || q.t || '|%' then 4.5
             when c.name_folded like q.t || '%' then 4
             when c.aliases_folded like '%|' || q.t || '%' then 2.5
             when c.name_folded like '%' || q.t || '%' then 2
             else 1
           end as score
      from public.zfind_communes c, q
     where c.country = q.c
       and char_length(q.t) >= 2
       and case
             when q.t ~ '^[0-9]+$' then exists (select 1 from unnest(c.postcodes) p where p like q.t || '%')
             else c.name_folded like '%' || q.t || '%' or c.aliases_folded like '%' || q.t || '%'
           end
  )
  select m.code, m.name, m.postcodes, m.parent,
         m.name || case when cardinality(m.postcodes) > 0 then ' (' || array_to_string(m.postcodes[1:3], ', ') || ')' else '' end
    from m
   order by m.score desc,
            case when m.by_postcode then 0 else char_length(m.name) end,
            m.name
   limit (select case when t ~ '^[0-9]+$' then 40 else 12 end from (select lower(btrim(coalesce(p_query, ''))) as t) x);
$$;

revoke all on function public.zfind_commune_search(text, text) from public;
grant execute on function public.zfind_commune_search(text, text) to anon, authenticated;
