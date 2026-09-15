# T-21 — W1 : embauche validée déclenche le parcours

**Couches** : workflows, app/api, application · **Agent** : automation-builder
**Dépend de** : T-11, T-12

## Pourquoi

Premier workflow du cahier des charges : une embauche validée doit produire un parcours complet
sans intervention humaine.

## Périmètre

- Webhook n8n authentifié par secret partagé, entrée validée.
- Appel du cas d'usage qui sélectionne le template et instancie le parcours.
- Notification des responsables, création des évènements d'agenda.
- Export JSON du workflow dans `workflows/`.

## Hors périmètre

- Les règles de sélection et de calcul, qui vivent dans le domaine (T-09, T-11).

## Cas limites à couvrir

- Même embauche reçue deux fois : idempotence, pas de parcours en double.
- Aucun template correspondant : échec explicite et alerte RH, pas un parcours vide.
- Date d'arrivée dans le passé.

## Définition de terminé

- [ ] Aucune règle métier dans un noeud n8n : le workflow appelle, il ne décide pas.
- [ ] Webhook refusé sans secret valide, vérifié.
- [ ] Aucune donnée personnelle dans le payload, uniquement des identifiants.
- [ ] JSON exporté et commité, exécution réelle constatée.
