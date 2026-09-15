# T-04 — Schéma sociétés, sites, membres et jours fériés

**Couches** : supabase · **Agent** : db-architect · **Dépend de** : T-01 · **État** : fait

## Pourquoi

Toute variation entre filiales est une donnée. Sans ces tables, la variation retombe dans le code.

## Périmètre

- `companies` : marque, palette, locale, fuseau, semaine de travail, réglages ouverts.
- `sites` : rattachés à une société, surcharge possible de la semaine de travail.
- `profiles` et `company_members` : rôles `hr_admin`, `manager`, `it`, `employee`.
- `holidays` : portée société, ou site précis.
- RLS activée dans la même migration, policies adossées à `company_members`.

## Hors périmètre

- Parcours, tâches, matériel, questionnaires (T-06, T-14, T-15).

## Cas limites à couvrir

- Un férié de site ne vaut que pour ce site.
- Une société dont le week-end n'est pas samedi/dimanche.
- Un même jour férié déclaré deux fois sur le même périmètre est refusé.

## Définition de terminé

- [x] Chaque table porte `company_id` et une policy qui la scope.
- [x] Les policies n'utilisent aucun claim fourni par le client.
- [x] Isolation prouvée : membre de la société A, les lignes de B sont invisibles.
- [x] Migrations rejouées localement (`supabase db reset`), pas seulement écrites.

## Ce qui a été vérifié

`npm run db:reset` rejoue les deux migrations et le seed sur une base recréée, sans erreur.
`npm run db:verify` exécute treize contrôles sous l identité réelle d utilisateurs authentifiés :
lectures cloisonnées, fériés de site invisibles ailleurs, écriture réservée à la RH de sa société,
insertion forgée vers une autre société rejetée par la policy, visiteur anonyme aveugle.

## Un défaut que la relecture n avait pas vu

La policy de lecture des profils testait l appartenance par une sous-requête sur company_members,
table elle-même sous RLS : un membre non-RH n y voit que sa propre ligne, donc l EXISTS ne pouvait
jamais être vrai pour quelqu un d autre. Un manager n aurait pas vu le nom de son propre arrivant.
Le test passe désormais par une fonction SECURITY DEFINER, comme les deux autres.
