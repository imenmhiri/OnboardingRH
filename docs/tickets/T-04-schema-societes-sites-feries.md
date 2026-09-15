# T-04 — Schéma sociétés, sites, membres et jours fériés

**Couches** : supabase · **Agent** : db-architect · **Dépend de** : T-01
**Premier jet** : branche `feat/3-company-configuration-schema`

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

- [ ] Chaque table porte `company_id` et une policy qui la scope.
- [ ] Les policies n'utilisent aucun claim fourni par le client.
- [ ] Isolation prouvée : membre de la société A, les lignes de B sont invisibles.
- [ ] Migrations rejouées localement (`supabase db reset`), pas seulement écrites.
