# T-27 — Déploiement et URL publique stable

**Couches** : outillage · **Agent** : — · **Dépend de** : T-02, T-05 · **État** : fait

## Pourquoi

Livrable noté indépendamment du code, et qui se perd toujours en fin de projet. Déployer tôt évite
de découvrir les écarts entre local et production la veille de la remise.

## Périmètre

- Déploiement continu depuis `main`, aperçu par pull request.
- Variables d'environnement de production, aucune dans le dépôt.
- Projet Supabase de production, migrations appliquées.
- Comptes de démonstration accessibles depuis l'URL publique.

## Ce qui a été fait

**Hébergement** : Vercel, connecté au dépôt GitHub `OnboardingRH`, déploiement continu depuis
`main` à chaque `git push` (aperçu automatique par pull request, comportement par défaut de
l'intégration Vercel/GitHub — rien à configurer en plus).

**Base de données** : un projet Supabase Cloud dédié (`onboardingrh-prod`, région `eu-west-3`),
distinct de l'instance locale de développement. Les 14 migrations de `supabase/migrations/` y sont
appliquées, et le jeu de données de démonstration (`supabase/seed/seed.sql`, puis
`align-demo-dates.ts` pour aligner les dates sur le vrai moteur de jours ouvrés, puis
`seed-portal-document.ts` pour le document réel d'Alice) y a été rejoué une fois, à la main, contre
cette base de production.

**URL publique** : https://onboarding-rh.vercel.app

## Décisions prises en chemin

**Les scripts de seed acceptent maintenant une cible de production, sans changer leur comportement
local.** `align-demo-dates.ts` lisait une connexion Postgres locale codée en dur
(`127.0.0.1:54322`) ; il accepte maintenant une variable `DATABASE_URL` en override, sinon retombe
sur le comportement local inchangé — `npm run db:reset` continue de fonctionner exactement comme
avant. `seed-portal-document.ts`, qui lisait `.env.local` directement, fusionne maintenant
`process.env` par-dessus ce fichier, permettant de lui passer l'URL et la clé de service de
production en une seule invocation sans toucher au fichier local. Aucun des deux changements n'est
invoqué automatiquement par un script `npm` : c'est une capacité, pas un nouveau comportement par
défaut.

**Les migrations ont été appliquées deux fois par deux chemins différents, et c'est volontaire.**
Le réseau de développement ne supportait pas la connexion directe au Postgres de Supabase (erreur
IPv6), et le premier essai du *pooler* de connexion s'est heurté à un piège découvert en marche :
Supabase peut assigner un projet à `aws-1-<region>.pooler.supabase.com` plutôt qu'au `aws-0-`
attendu par convention — l'hôte correct n'est fiable qu'en le lisant depuis le bouton « Connect » du
tableau de bord, jamais en le devinant. En attendant de le trouver, les 14 migrations ont d'abord
été appliquées en collant leur contenu concaténé dans l'éditeur SQL de Supabase (HTTPS, donc
insensible au problème IPv6) ; une fois le bon hôte de *pooler* trouvé, `supabase migration repair`
a aligné l'historique de migration du CLI sur cet état déjà réel, pour que `supabase db push` reste
utilisable normalement par la suite.

**`NEXT_PUBLIC_APP_URL` doit être de type "Plaintext/Config" sur Vercel, jamais "Secret".** Une
variable `NEXT_PUBLIC_*` est de toute façon inlinée dans le bundle JavaScript envoyé au navigateur au
moment du build — la marquer "Secret" (écriture seule) n'apporte aucune confidentialité réelle,
complique sa relecture future, et le tableau de bord Vercel le signale lui-même. Elle a été recréée
en "Config".

**Un changement de variable `NEXT_PUBLIC_*` exige un redéploiement sans cache de build.** Vercel
propose par défaut de réutiliser le cache de build lors d'un « Redeploy » ; comme la valeur est
insérée dans le code au moment de la compilation, réutiliser un build en cache aurait gardé
l'ancienne valeur. Le redéploiement final a été fait avec le cache explicitement désactivé.

**Aucune intégration Vercel automatique pour Supabase ou Resend.** Vercel propose, à l'import du
projet, de connecter automatiquement des services tiers (créerait un nouveau projet Supabase et un
compte Resend gérés par Vercel). Refusé délibérément : le projet Supabase de production était déjà
créé et configuré à la main, et une double intégration aurait introduit des variables
d'environnement concurrentes.

## Cas limites couverts

- **Base vide au premier déploiement** : le déploiement de l'application et le peuplement de la
  base sont deux étapes séparées et volontairement découplées — l'application ne suppose jamais que
  la base contient des données, chaque écran a déjà son état vide géré (T-16 à T-19).
- **Variable manquante en production** : les intégrations optionnelles (Resend, Google Calendar,
  Anthropic, n8n) sont laissées vides en production. Chacune dégrade proprement, comme vérifié en
  local pendant les tickets T-24/T-25/T-26 — confirmé de nouveau ici : le site reste utilisable sans
  elles.

## Vérifié sur l'environnement réel

- Les 14 migrations et le jeu de démonstration sont bien sur la base de production, vérifié par
  lecture directe (`SELECT` sur `journeys` avec la clé de service — 9 parcours, dates correctement
  alignées sur les jours ouvrés).
- La RLS est active en production, pas seulement en local : une lecture de `journeys` avec la clé
  publique (`anon`/`publishable`), sans session authentifiée, renvoie une liste vide plutôt qu'une
  erreur ou les données — exactement le comportement attendu.
- Une connexion réelle (`POST /auth/v1/token?grant_type=password`) avec un compte de démonstration
  a renvoyé un jeton d'accès valide.
- Les quatre rôles ont été démontrés depuis l'URL publique, par l'utilisatrice du projet elle-même :
  RH (cockpit), IT (matériel, commandes groupées visibles), employé (portail), et la bascule
  multi-sociétés (Atelier Nord → Méridien Gulf, palette dorée).
- La page de connexion et sa feuille de style se chargent correctement (`200` sur la page et sur le
  CSS compilé), vérifié directement en HTTP depuis l'extérieur.

## Définition de terminé

- [x] URL publique stable, atteignable sans VPN ni compte préalable pour la page d'accueil —
      https://onboarding-rh.vercel.app, testé depuis un navigateur ordinaire.
- [x] `.env.example` à jour et sans aucun secret — déjà vérifié avant ce ticket, confirmé de nouveau
      en listant les variables réellement nécessaires au déploiement.
- [x] Les quatre rôles peuvent être démontrés depuis l'URL publique — RH, IT, employé et bascule
      multi-sociétés, tous testés en direct sur le déploiement réel.

## Dette laissée derrière

- Aucun domaine personnalisé (explicitement hors périmètre du ticket).
- Aucune supervision avancée au-delà de ce que Vercel fournit par défaut (explicitement hors
  périmètre).
- Le jeu de données de production a été peuplé **une fois, à la main**. Si la base de production
  doit être réinitialisée plus tard (par exemple avant l'enregistrement de la vidéo), il faudra
  rejouer les trois mêmes commandes documentées ici (`seed.sql`, `align-demo-dates.ts` avec
  `DATABASE_URL`, `seed-portal-document.ts` avec les variables d'environnement de production) — ce
  n'est pas encore un script unique à tout faire d'un coup.
- Les workflows n8n (W1/W2/W3) ne sont pas déployés publiquement : ils continuent de tourner en
  local pendant le développement et la démonstration (voir `docs/SCENARIO-VIDEO.md`). Les héberger
  réellement (n8n Cloud ou un conteneur public) n'était pas demandé par ce ticket.
