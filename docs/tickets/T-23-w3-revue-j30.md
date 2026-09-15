# T-23 — W3 : revue J+30

**Couches** : workflows, application · **Agent** : automation-builder · **Dépend de** : T-14, T-24

## Pourquoi

Troisième workflow : il ferme le parcours et alimente la mesure de satisfaction.

## Périmètre

- Déclenchement planifié, sélection des parcours arrivés à J+30 en jours ouvrés.
- Envoi du questionnaire, relance unique si absence de réponse.
- Clôture du parcours et archivage.
- Export JSON du workflow dans `workflows/`.

## Hors périmètre

- Scoring et signaux faibles (T-14), synthèse IA (T-26).

## Cas limites à couvrir

- **Fin de contrat avant J+30** : aucun envoi, parcours clos autrement.
- Employé sans email personnel : canal alternatif.
- Parcours reporté après l'échéance initiale de J+30.

## Définition de terminé

- [ ] Aucun questionnaire envoyé à un contrat terminé, vérifié sur le jeu de démonstration.
- [ ] Le lien du questionnaire est signé et limité dans le temps.
- [ ] JSON exporté et commité, exécution réelle constatée.
