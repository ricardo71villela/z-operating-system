-- Z Find — lecture des photos d'annonce par les fonctions serveur.
--
-- La page publique d'une annonce (/fr/annonce/{titre}-{id}, api/annonce.js)
-- lit l'annonce avec la clé serveur (rôle service_role). Ce rôle n'avait
-- pas le droit SELECT sur listing_media / media_assets / media_variants :
-- PostgREST refusait toute la requête (403). Les rôles anon et
-- authenticated l'ont déjà (le site lit les mêmes photos) : rien n'est
-- ouvert au public de plus. Lecture seule, idempotent.

grant select on table public.listing_media  to service_role;
grant select on table public.media_assets   to service_role;
grant select on table public.media_variants to service_role;
