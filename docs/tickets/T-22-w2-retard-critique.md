# T-22 — W2 : retard critique, relance et escalade

**Couches** : workflows, application · **Agent** : automation-builder · **Dépend de** : T-13, T-24

## Pourquoi

Deuxième workflow : sans lui, les retards restent visibles dans le cockpit mais personne n'est
prévenu.

## Périmètre

- Déclenchement planifié, un passage par jour ouvré.
- Lecture des tâches en retard, application de la politique d'escalade du domaine.
- Envoi des relances, écriture de la trace.
- Export JSON du workflow dans `workflows/`.

## Hors périmètre

- La politique elle-même (T-13).

## Cas limites à couvrir

- Jour férié de la société : pas de relance ce jour-là.
- Tâche bloquée par une autre : le destinataire est le propriétaire de la cause racine.
- Relance déjà envoyée le même jour ouvré : pas de doublon.

## Définition de terminé

- [ ] Les seuils viennent de la base, pas du workflow.
- [ ] Une exécution à blanc montre qui aurait été relancé, et pourquoi.
- [ ] JSON exporté et commité, exécution réelle constatée.
