# T-06 — Schéma parcours, tâches et documents

**Couches** : supabase · **Agent** : db-architect · **Dépend de** : T-04 · **État** : fait

## Pourquoi

Le cœur transactionnel : une embauche devient un parcours, un parcours porte des tâches, une tâche
attend parfois une pièce.

## Périmètre

- `journey_templates`, `template_tasks`, `template_task_dependencies` : responsable relatif, délai en
  jours ouvrés, dépendances par clé, pièce attendue.
- `journeys` : société, site, employé, manager, métier, type de contrat, date d'arrivée, date de fin,
  statut.
- `tasks` et `task_dependencies` : échéance, responsable, statut, clé de mutualisation.
- `task_documents` : référence Storage uniquement, jamais le fichier.
- `audit_events` : insertion seule.
- RLS activée dans la même migration pour les huit tables.

## Ce qui a été décidé en chemin

**Une tâche est visible par trois chemins**, pas un seul : son propriétaire nommé, ceux qui voient le
parcours, et l'équipe qui porte le rôle concerné. Sans le troisième, l'IT ne verrait aucune tâche IT
tant que personne ne la lui aurait nommément assignée.

**L'employé peut ne pas avoir de compte** au moment de l'embauche : `employee_id` est nullable et
`employee_name` obligatoire. Le parcours existe avant l'accès.

**Le journal d'audit survit au parcours** : `ON DELETE SET NULL` plutôt que `CASCADE`. Supprimer un
parcours emporte ses tâches, pas sa trace.

## Cas limites couverts

- Tâche commune à plusieurs arrivées : colonne `shared_key` et index dédié.
- Suppression d'un parcours : tâches supprimées, audit conservé (vérifié).
- Fin de contrat : `end_date`, contrainte de cohérence avec l'arrivée — c'est elle qui annulera le
  questionnaire J+30 (T-14).

## Définition de terminé

- [x] Un employé ne voit rien du parcours d'un collègue — prouvé par requête.
- [x] L'audit refuse une modification et une suppression — prouvé par requête.
- [x] Index sur les accès réels : société et échéance, responsable et statut, manager, employé,
      clé de mutualisation.
- [x] `npm run db:verify` : 27 contrôles au total, sur base rejouée de zéro.

## Une conséquence à connaître côté application

Un membre non-RH peut **écrire** dans le journal d'audit mais pas le relire. Une insertion avec
`RETURNING` échoue donc pour lui : les écritures d'audit se font sans `RETURNING`. C'est écrit dans
la migration, à l'endroit où quelqu'un le cherchera.

## Dette laissée derrière

- Aucun bucket Storage n'est créé : c'est T-07, avec les liens signés.
- Aucune donnée de démonstration pour ces tables : c'est T-08.
- Les templates existent en base mais ne sont pas encore alimentés par le domaine (T-11).
