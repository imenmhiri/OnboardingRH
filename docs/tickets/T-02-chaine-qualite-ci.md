# T-02 — Chaîne de qualité en intégration continue

**Couches** : outillage · **Agent** : — · **Dépend de** : T-01

## Pourquoi

La définition de « terminé » repose sur trois commandes. Tant qu'elles ne tournent pas à chaque
push, elles reposent sur la discipline de celui qui commite.

## Périmètre

- Workflow GitHub Actions : `typecheck`, `lint`, `test:run` sur chaque push et chaque PR.
- Cache des dépendances, échec bloquant sur la PR.
- Badge d'état dans le README.

## Hors périmètre

- Déploiement (T-27), tests de bout en bout.

## Définition de terminé

- [ ] Une PR dont un test échoue est visiblement rouge. *(non vérifiable tant que rien n est poussé)*
- [ ] Le workflow tourne en moins de trois minutes sur un cache chaud.
- [ ] Aucune clé ni secret dans le fichier de workflow.
