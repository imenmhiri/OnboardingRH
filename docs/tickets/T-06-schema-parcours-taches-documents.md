# T-06 — Schéma parcours, tâches et documents

**Couches** : supabase · **Agent** : db-architect · **Dépend de** : T-04

## Pourquoi

Le cœur transactionnel : une embauche devient un parcours, un parcours porte des tâches, des tâches
attendent des pièces.

## Périmètre

- `journeys` : société, site, employé, métier, type de contrat, date d'arrivée, statut.
- `journey_templates` et `template_tasks` : responsable relatif, délai, dépendances, pièce attendue.
- `tasks` : échéance, responsable, statut, dépendances, clé de mutualisation.
- `task_documents` : référence Storage, jamais le fichier lui-même.
- `audit_events` : insert-only, ni `update` ni `delete`.
- RLS : l'employé lit **son** parcours, le manager lit celui de ses rattachés, la RH sa société.

## Hors périmètre

- Matériel et questionnaires (T-14, T-15).

## Cas limites à couvrir

- Une tâche partagée par plusieurs parcours.
- Suppression d'un parcours : que deviennent les tâches et l'audit.

## Définition de terminé

- [ ] Un employé ne voit rien du parcours d'un collègue, prouvé par requête.
- [ ] L'audit refuse une modification, prouvé par requête.
- [ ] Index sur les accès réels : par société et échéance, par responsable et statut.
