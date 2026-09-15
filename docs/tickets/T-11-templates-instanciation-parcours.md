# T-11 — Sélection du template et instanciation du parcours

**Couches** : domain/templates · **Agent** : domain-expert · **Dépend de** : T-09, T-10
**Premier jet** : branche `feat/5-journey-template-instantiation`

## Pourquoi

C'est le point où société × métier × site devient un parcours concret — et le premier endroit où la
tentation d'une condition par société apparaît.

## Périmètre

- Sélection du template le plus spécifique parmi les lignes de la société.
- Instanciation : échéances calculées, dépendances réécrites, pièce attendue reportée.
- Refus explicite d'un template circulaire, incomplet ou ambigu.

## Hors périmètre

- Écran de création de template (T-16), attribution des responsables (T-12).

## Cas limites à couvrir

- Deux templates également spécifiques : ambiguïté signalée, jamais départagée par l'ordre des lignes.
- Aucun template correspondant : refus explicite.
- Template d'une autre société : jamais sélectionné.

## Définition de terminé

- [ ] Aucune condition sur l'identité d'une société.
- [ ] Les identifiants de tâches viennent d'une fonction injectée, pas d'un aléa interne.
- [ ] Un template invalide est refusé avant création du parcours, avec le défaut nommé.
