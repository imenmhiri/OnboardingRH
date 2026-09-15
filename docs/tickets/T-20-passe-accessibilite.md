# T-20 — Passe d'accessibilité et cohérence visuelle

**Couches** : app, components · **Agent** : ui-builder · **Dépend de** : T-16, T-17, T-18, T-19

## Pourquoi

L'accessibilité vérifiée écran par écran laisse passer les incohérences entre écrans. Ce ticket
regarde le produit comme un tout, une fois les quatre surfaces en place.

## Périmètre

- Revue selon la skill `a11y-review` sur chaque écran.
- Ordre de tabulation, pièges de focus, libellés de dialogues et de menus.
- Annonces dynamiques : chargement, succès, erreur.
- Cohérence : mêmes composants, mêmes espacements, mêmes formulations d'un écran à l'autre.
- Vérification de contraste sur les deux palettes de démonstration.

## Hors périmètre

- Audit RGAA complet et certification.

## Définition de terminé

- [ ] Chaque écran est utilisable sans souris, du début à la fin d'une tâche réelle.
- [ ] Aucun contrôle sans nom accessible en français.
- [ ] Aucune information portée par la couleur seule.
- [ ] Les écarts restants sont écrits dans le README plutôt que tus.
