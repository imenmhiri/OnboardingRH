# T-03 — Design system et branding par société

**Couches** : components/ui, app, lib · **Agent** : ui-builder · **Dépend de** : T-01 · **État** : fait

## Pourquoi

La direction artistique pèse 35 % de l'évaluation, et le branding doit varier par société sans une
seule condition dans le code. Ce ticket pose le vocabulaire visuel que tous les écrans réutilisent.

## Périmètre

- Jetons de design : typographie, espacements, rayons, ombres, couleurs sémantiques ; thème clair et
  sombre.
- Variables CSS `--brand-*` calculées depuis l'enregistrement société et injectées sur un conteneur.
- Primitives sur base Radix : bouton, champ, select, fenêtre, onglets, infobulle, menu.
- Statuts combinant icône et texte.
- États transverses : vide, chargement, erreur.
- Page interne `/design` rendant tout deux fois, sous deux identités de société opposées.

## Ce qui a été décidé en chemin

**Le contraste est calculé, pas choisi.** Une marque mi-ton n'atteint 4.5:1 ni sur blanc ni sur noir :
un rouge de marque plafonne à 4.26:1. Choisir la couleur du texte ne peut donc pas suffire. La marque
elle-même est assombrie ou éclaircie le long de sa propre teinte jusqu'à ce que le texte devienne
lisible — elle reste la marque, elle devient utilisable.

**Les fonds tamisés passent par `light-dark()`.** Un style inline écraserait la règle de thème sombre
et laisserait une pastille claire dans une interface sombre.

## Cas limites couverts

- Couleur de marque claire : bascule sur un texte sombre, AA garanti (test nommé).
- Marque mi-ton qu'aucun texte ne rattrape : la surface est dérivée (test nommé).
- Marque blanche, noire, saturée : AA sur les trois paires, en clair et en sombre.

## Définition de terminé

- [x] Contraste 4.5:1 vérifié sur les deux palettes — **mesuré sur les pixels rendus**, 84 éléments
      textuels par thème, clair et sombre, aucun sous le seuil.
- [x] Navigation clavier et focus visible sur chaque primitive : 7 contrôles automatisés passent
      (lien d'évitement, noms accessibles, contour de focus, piège et restitution du focus, onglets
      aux flèches, pas de défilement horizontal à 390 px).
- [x] Aucune couleur de marque codée en dur hors des variables CSS.
- [x] Erreur de formulaire liée à son champ et annoncée, hiérarchie des titres correcte.

## Défauts trouvés par la vérification, et corrigés

Mesurer le rendu a trouvé trois manquements que la relecture du CSS n'avait pas vus :

| Élément | Avant | Cause |
| --- | --- | --- |
| Libellé discret | 3.49:1 | `--text-subtle` trop pâle |
| Statut « Annulée » | 3.25:1 | même jeton sur fond creusé |
| Bouton danger, thème sombre | 2.86:1 | texte blanc en dur, alors que la couleur de danger s'éclaircit avec le thème |

## Dette laissée derrière

- Les scripts de `scripts/ui-checks/` ne sont pas branchés sur la CI : ils demandent un navigateur et
  l'application démarrée. C'est le sujet de T-20.
- Playwright utilise le Chrome de la machine, son propre CDN étant inaccessible depuis ce réseau.
- La page d'accueil n'a pas été redessinée : elle le sera avec les écrans réels.
