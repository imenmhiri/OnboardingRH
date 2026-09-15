# T-05 — Authentification et résolution de la société active

**Couches** : app, application, infrastructure · **Agent** : db-architect + ui-builder
**Dépend de** : T-04

## Pourquoi

Chaque écran a besoin de savoir qui regarde, avec quel rôle, et pour quelle société — c'est ce qui
alimente à la fois la RLS et le branding.

## Périmètre

- Connexion Supabase, session côté serveur, déconnexion.
- Résolution de la société active et injection de ses variables de marque.
- Sélecteur de société pour un utilisateur membre de plusieurs filiales.
- Garde de route par rôle, avec redirection explicite plutôt que page blanche.

## Hors périmètre

- Gestion fine des invitations et du cycle de vie des comptes.

## Cas limites à couvrir

- Utilisateur membre de deux sociétés : la bascule change la marque et les données.
- Utilisateur sans aucune appartenance : message explicite, pas d'erreur brute.

## Définition de terminé

- [ ] Aucune donnée d'une autre société ne transite, même si l'URL est forgée.
- [ ] La marque affichée provient de la base, jamais d'une constante.
- [ ] Parcours de connexion navigable entièrement au clavier.
