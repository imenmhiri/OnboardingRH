# T-05 — Authentification et résolution de la société active

**Couches** : domain, application, infrastructure, app · **Agent** : db-architect + ui-builder
**Dépend de** : T-04 · **État** : fait

## Pourquoi

Chaque écran a besoin de savoir qui regarde, avec quel rôle, et pour quelle société — c'est ce qui
alimente à la fois la RLS et le branding.

## Périmètre

- Connexion par email et mot de passe, session portée par les cookies, déconnexion.
- Résolution de la société active et injection de ses variables de marque.
- Sélecteur de société pour un utilisateur membre de plusieurs filiales.
- Garde de route par rôle, avec une issue explicite pour chaque refus.

## Ce qui a été décidé en chemin

**Une société demandée dont on n'est pas membre est refusée par son nom**, pas remplacée en silence
par une autre. Un remplacement discret renverrait la première société venue à une URL forgée, et
personne ne saurait qu'une tentative a eu lieu.

**La connexion passe par la racine**, qui aiguille selon le rôle : la session écrite pendant l'action
n'est pas encore relisible dans la même requête.

**L'échec de connexion dit la même chose pour un compte inconnu et un mot de passe faux.** Distinguer
les deux révélerait à un inconnu qui travaille dans l'entreprise.

## Cas limites couverts

- Membre de deux sociétés : la bascule change la société, le rôle, la marque et la destination.
- Utilisateur sans aucune appartenance : message explicite et bouton de déconnexion.
- Société rattachée introuvable : anomalie signalée comme telle, pas masquée par une marque par défaut.
- Cookie de société forgé : refus explicite, avec un geste pour revenir à sa société.

## Définition de terminé

- [x] Aucune donnée d'une autre société ne transite, même par URL ou cookie forgé — vérifié en
      pilotant un vrai navigateur sur la vraie base.
- [x] La marque affichée provient de la base : la bascule de société repeint l'application, et la
      couleur observée est bien celle de l'enregistrement.
- [x] Parcours de connexion navigable au clavier, erreur annoncée, contraste AA sur les deux thèmes.
- [x] `npm run db:verify` : 13 contrôles d'isolation. `scripts/ui-checks/auth-flow.mjs` : 14 contrôles
      de parcours. `typecheck`, `lint`, 37 tests Vitest.

## Deux défauts trouvés par la vérification, et corrigés

| Défaut | Cause |
| --- | --- |
| Boucle de redirection infinie sur un cookie de société invalide | un Server Component ne peut pas écrire de cookie pendant son rendu ; l'effacer avant de rediriger était sans effet |
| Compte sans société bloqué entre connexion et racine | la racine renvoyait vers la connexion pour **tout** échec de session, y compris une absence d'appartenance |

Aucun des deux n'était visible à la relecture du code.

## Dette laissée derrière

- Les comptes de vérification sont créés par `scripts/ui-checks/auth-fixtures.mjs`, hors du jeu de
  démonstration : c'est T-08 qui produira les comptes de démonstration.
- Pas de réinitialisation de mot de passe ni d'invitation : hors périmètre, à ouvrir si nécessaire.
- Cockpit et portail ne sont que des coquilles : leur contenu est T-18 et T-17.
