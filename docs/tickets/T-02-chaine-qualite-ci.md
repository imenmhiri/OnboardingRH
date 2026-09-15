# T-02 — Chaîne de qualité en intégration continue

**Couches** : outillage · **Agent** : — · **Dépend de** : T-01 · **État** : fait

## Pourquoi

La définition de terminé repose sur trois commandes. Tant qu'elles ne tournent pas à chaque push,
elles reposent sur la discipline de celui qui commite.

## Périmètre

- Workflow GitHub Actions : `typecheck`, `lint`, `test:run` sur chaque push vers `main` et sur
  chaque pull request.
- Cache des dépendances, annulation du run précédent sur une même branche, droits en lecture seule.
- Badge d'état dans le README.

## Hors périmètre

- `npm run build`, couvert au moment du déploiement (T-27).
- Tests de bout en bout, déploiement.

## Définition de terminé

- [x] Une PR dont un test échoue est visiblement rouge — voir la réserve ci-dessous.
- [x] Le workflow tourne en moins de trois minutes : 41 s sur un cache froid (run CI #1).
- [x] Aucune clé ni secret dans le fichier de workflow.

## Ce qui a été constaté, et ce qui ne l'a pas été

Run vert sur `main` en 41 secondes, confirmé dans l'onglet Actions du dépôt.

Le rendu rouge sur une pull request n'a pas été observé directement. Une branche portant un test
volontairement faux a été poussée pour cela, puis supprimée sans que le rouge attendu ait été
constaté sur une PR. Ce qui est établi à la place : ce test fait sortir `npm run test:run` en code
1 en local, et le job CI ne fait que propager ce code de sortie. Le maillon non vérifié est donc
l'affichage de GitHub, pas la détection de l'échec.

À reprendre au premier ticket qui ouvrira une vraie pull request.

## Dette laissée derrière

- `test:run` porte encore `--passWithNoTests` : la CI serait verte avec zéro test. À retirer en T-09.
- Le badge du README ne s'affichera pas tant que le dépôt est privé.
- La CI tourne sur Node 22, le développement local sur Node 24.
