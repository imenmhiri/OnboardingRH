# T-16 — Créateur de parcours

**Couches** : app, components · **Agent** : ui-builder · **Dépend de** : T-03, T-06, T-11

## Pourquoi

Première surface produit : c'est là que la RH décrit un parcours sans passer par un développeur.

## Périmètre

- Liste des templates de la société, avec leurs critères de sélection.
- Édition d'une tâche de template : titre, responsable relatif, délai en jours ouvrés,
  dépendances, pièce attendue.
- Visualisation de l'enchaînement des dépendances et détection visuelle d'un cycle.
- Aperçu : pour une date d'arrivée donnée, les échéances réelles que le template produirait.
- Duplication d'un template vers un autre métier ou un autre site.

## Hors périmètre

- Édition collaborative en temps réel, versionnage des templates.

## Cas limites à couvrir

- Template sans aucune tâche.
- Dépendance supprimée alors qu'une autre tâche s'y réfère.
- Délai négatif, qui place la tâche avant l'arrivée.

## Définition de terminé

- [ ] États vide, chargement et erreur dessinés.
- [ ] Formulaires navigables au clavier, chaque contrôle porte un label explicite.
- [ ] Les erreurs de validation sont annoncées aux lecteurs d'écran, pas seulement colorées.
- [ ] Contraste AA vérifié sur deux palettes de sociétés.
