# T-26 — Synthèse IA anonymisée

**Couches** : application, infrastructure · **Agent** : automation-builder · **Dépend de** : T-14

## Pourquoi

Les verbatims de satisfaction ne se lisent pas un par un. Une synthèse par société et par site aide
la RH à voir les tendances — à condition de ne jamais ré-identifier quelqu'un.

## Périmètre

- Anonymisation avant appel : suppression des noms, emails, identifiants, mentions d'équipe.
- Synthèse des verbatims par société et par site : thèmes récurrents, points de friction.
- Seuil minimal de réponses en dessous duquel aucune synthèse n'est produite.
- Affichage dans le cockpit, avec mention explicite du caractère généré.

## Hors périmètre

- Notation automatique des managers, prédiction de départ.

## Cas limites à couvrir

- Verbatim contenant un nom propre : il ne sort pas du système.
- Trop peu de réponses : refus de produire une synthèse.
- Service indisponible : le cockpit reste utilisable sans la synthèse.

## Définition de terminé

- [ ] Aucune donnée personnelle ne quitte le système, vérifié sur des verbatims de test.
- [ ] La synthèse est signalée comme générée, jamais présentée comme un fait.
- [ ] Le seuil minimal est une donnée, pas une constante.
