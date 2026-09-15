# T-18 — Cockpit RH

**Couches** : app, components · **Agent** : ui-builder
**Dépend de** : T-03, T-06, T-10, T-12, T-14

## Pourquoi

C'est l'écran de pilotage : il doit répondre d'un coup d'oeil à ce qui arrive, ce qui coince, et qui
doit agir.

## Périmètre

- Arrivées à venir, par site et par semaine.
- Tâches bloquées, avec la cause racine et son propriétaire affichés directement.
- Comptes non créés et matériel manquant avant une arrivée imminente.
- Satisfaction J+7 et J+30, avec les signaux faibles remontés.
- Filtres par site, par métier, par responsable.

## Hors périmètre

- Export comptable, tableau de bord multi-groupes.

## Cas limites à couvrir

- Aucune arrivée à venir : l'écran reste informatif.
- Volume important : la liste reste lisible et navigable au clavier.
- Tâche non attribuable faute de responsable résolu.

## Définition de terminé

- [ ] Le blocage affiché vient de domain/tasks, il n'est pas recalculé dans le composant.
- [ ] Chaque statut combine icône et texte, jamais la couleur seule.
- [ ] États vide, chargement et erreur dessinés.
- [ ] Contraste AA vérifié sur deux palettes de sociétés.
