-- Z Find — nettoyage des e-mails inutilisables pour la prospection, v1
--
-- La recherche des contacts sur les sites des agences a enregistré des
-- adresses qui ne servent pas à contacter l'agence :
--   * des exemples laissés dans les modèles de site (exemple@domaine.fr…) ;
--   * les boîtes protection des données, mentions légales, réclamations ou
--     service clients des réseaux (donneespersonnelles@laforet.com,
--     informatique-et-libertes@guy-hoquet.com, dpo@…).
-- Ces e-mails sont retirés (email et email_source à null). La ligne de
-- l'agence reste, avec son téléphone et son site. email_outreach_allowed
-- (colonne calculée) passe à false tout seul.
--
-- Les mêmes règles s'appliquent désormais à la collecte
-- (apps/find/ingest/agencias/src/common.py, prospecting_email), pour que ces
-- adresses ne reviennent pas.
--
-- Idempotent : peut être relancé.

update public.zfind_agencias
   set email = null,
       email_source = null,
       updated_at = now()
 where email is not null
   and (
     split_part(lower(email), '@', 2) in (
       'domaine.fr', 'domaine.com', 'exemple.fr', 'exemple.com', 'example.fr', 'test.fr', 'test.com',
       'votre-domaine.fr', 'votredomaine.fr', 'monsite.fr', 'wixpi.com', 'sentry-next.wixpress.com')
     or split_part(lower(email), '@', 1) ~ ('^(exemple|example|votre-?e?mail|nom|prenom|prenom\.nom|x{3,}|abc'
       || '|dpo[a-z0-9._-]*|rgpd|gdpr|cnil|privacy|vie-?privee|donnees-?personnelles|informatique-et-libertes'
       || '|mentions-?legales|juridique|legal|fichiers|reclamations?|mediation|mediateur'
       || '|service-?clients?|serviceclients?|abuse|postmaster|webmaster)$')
   );

-- Vérification (attendu : 0) :
-- select count(*) from public.zfind_agencias
--  where split_part(lower(email), '@', 1) in ('exemple', 'donneespersonnelles', 'informatique-et-libertes', 'mentions-legales', 'dpo');
