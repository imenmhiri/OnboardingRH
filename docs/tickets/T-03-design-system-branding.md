# T-03 — Design system et branding par société

**Couches** : components/ui, app · **Agent** : ui-builder · **Dépend de** : T-01

## Pourquoi

La direction artistique pèse 35 % de l'évaluation, et le branding doit varier par société sans une
seule condition dans le code. Ce ticket pose le vocabulaire visuel que tous les écrans réutilisent.

## Périmètre

- Échelles typographiques, espacements, rayons, ombres, densité ; thème clair et sombre.
- Variables CSS `--brand-*` injectées depuis l'enregistrement société sur un conteneur racine.
- Primitives sur base Radix : bouton, champ, select, dialogue, onglets, tooltip, menu.
- Composants de statut combinant **icône + texte** — jamais la couleur seule.
- États transverses dessinés une fois : vide, chargement (squelettes), erreur.
- Page de démonstration interne listant les primitives sur deux palettes de sociétés.

## Hors périmètre

- Les écrans métier eux-mêmes (T-16 à T-19).

## Cas limites à couvrir

- Une société dont la couleur de marque est claire : le contraste du texte sur bouton reste AA.
- Un nom de société long qui ne casse pas l'en-tête.

## Définition de terminé

- [ ] Contraste 4.5:1 vérifié sur les deux palettes de démonstration.
- [ ] Navigation clavier et focus visible sur chaque primitive interactive.
- [ ] Aucune couleur de marque codée en dur hors des variables CSS.
