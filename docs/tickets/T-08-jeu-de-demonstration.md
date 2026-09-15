# T-08 — Jeu de données de démonstration

**Couches** : supabase/seed · **Agent** : db-architect · **Dépend de** : T-04, T-06

## Pourquoi

C'est le jeu qui sera à l'écran le jour de la démonstration, et la preuve que le multi-sociétés
tient par la donnée. Il est aussi un livrable listé.

## Périmètre

- Deux sociétés volontairement dissemblables : palette, semaine de travail, sites, fériés.
- Trois à quatre parcours à des stades différents : à venir, en cours, bloqué, terminé.
- Une tâche mutualisée entre deux arrivées, une tâche en retard, un compte IT non créé.
- Comptes de démonstration pour les quatre rôles.

## Hors périmètre

- Données réelles, même anonymisées.

## Définition de terminé

- [ ] `supabase db reset` rejoue migrations et seed sans erreur.
- [ ] Chaque écran a quelque chose d'intéressant à montrer, y compris ses états d'erreur.
- [ ] Aucune donnée personnelle réelle.
