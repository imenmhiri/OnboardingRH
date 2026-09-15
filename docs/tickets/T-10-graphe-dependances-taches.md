# T-10 — Graphe de dépendances et statuts de tâches

**Couches** : domain/tasks · **Agent** : domain-expert · **Dépend de** : T-09
**Premier jet** : branche `feat/4-task-dependency-graph`

## Pourquoi

Une tâche bloquée doit toujours pouvoir répondre à : bloquée par quoi, et qui en est le
propriétaire. Cette réponse se calcule, elle ne s'assemble pas dans un composant.

## Périmètre

- Construction du graphe, détection des cycles, dépendances inconnues, doublons.
- Transitions de statut et refus motivés.
- Explication du blocage, remontée jusqu'à la cause racine avec son responsable.
- Tâches actionnables du jour, et ce qu'une tâche débloque en se terminant.
- Mutualisation d'une tâche entre plusieurs arrivées.

## Hors périmètre

- Persistance, écran, notifications.

## Cas limites à couvrir

- **Tâche commune à plusieurs arrivées** : un seul élément, échéance de l'arrivée la plus proche.
- Dépendance annulée : elle lève le blocage au lieu de le figer.
- Chaîne de blocage à plusieurs niveaux : la cause racine n'est pas la dépendance directe.

## Définition de terminé

- [ ] L'explication du blocage nomme la tâche **et** son propriétaire.
- [ ] Aucun statut bloqué stocké en base : il se dérive du graphe.
- [ ] Chaque cas limite ci-dessus est un test nommé.
