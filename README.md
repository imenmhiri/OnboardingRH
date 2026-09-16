# OnboardingRH

[![CI](https://github.com/imenmhiri/OnboardingRH/actions/workflows/ci.yml/badge.svg)](https://github.com/imenmhiri/OnboardingRH/actions/workflows/ci.yml)

Plateforme d'intégration multi-sociétés : à partir d'une embauche validée, elle génère le parcours
adapté (société × métier × site), assigne les tâches à la RH, au manager, à l'IT et à l'employé,
calcule les échéances en jours ouvrés, relance les retards et mesure la satisfaction à J+7 et J+30.

> **État du projet** — les quatre surfaces produit (créateur de parcours, portail employé, cockpit
> RH, gestion du matériel) sont construites et reliées au vrai jeu de données, avec une passe
> d'accessibilité et de cohérence transverse (T-20) une fois les quatre en place. Le périmètre est
> découpé en tickets dans [docs/BACKLOG.md](docs/BACKLOG.md), traités un par un selon
> [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Installation

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
cp .env.example .env.local   # puis renseigner les variables
npm run dev                  # http://localhost:3000
```

Aucun service externe n'est requis pour lancer l'application en l'état ; les variables
d'environnement deviennent nécessaires au fur et à mesure que Supabase, Resend et n8n sont branchés.

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | build de production |
| `npm run test` | Vitest en mode watch |
| `npm run test:run` | Vitest en une passe (CI) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Architecture

Découpage en couches, dépendances orientées vers l'intérieur : `app` → `application` → `domain`.
Le domaine ignore Supabase, React, le réseau et l'horloge système.

```
src/
  domain/          TypeScript pur, zéro I/O — règles métier, entièrement testées
  application/     cas d'usage + ports (repositories, mailer, calendar, storage, clock)
  infrastructure/  implémentations des ports (supabase/, resend/, calendar/, storage/)
  app/             routes Next.js (App Router)
  components/      composants React ; ui/ contient les primitives
  lib/             utilitaires transverses
supabase/migrations/   schéma SQL versionné + policies RLS
supabase/seed/         jeu de données de démonstration
workflows/             exports JSON des workflows n8n
```

Trois règles sont outillées plutôt que documentées : la configuration ESLint interdit à
`src/domain/` d'importer React, Next, Supabase ou une couche extérieure, lui interdit `Date` et
`fetch` (l'horloge passe par un port injecté), et interdit à `src/application/` d'importer une
implémentation d'infrastructure.

## Choix techniques

- **Multi-sociétés par la donnée.** Aucune branche conditionnelle par société dans le code : logo,
  palette, règles, documents et jours fériés sont des données résolues à l'exécution. Le branding
  s'applique via des variables CSS (`--brand-*`) définies dans `src/app/globals.css` avec des
  valeurs de repli, remplacées par l'enregistrement de la société. Ajouter une filiale est une
  insertion en base, pas un déploiement.
- **Autorisation par la base.** La Row Level Security Supabase est la source de vérité : chaque
  table métier portera `company_id` et une policy qui la scope, dans la même migration que la table.
- **Tests sans mock.** Le domaine est composé de fonctions pures avec horloge injectée ; Vitest est
  découpé en deux projets (`domain` en environnement Node, `ui` en jsdom).
- **Accessibilité.** WCAG AA visé : navigation clavier, lien d'évitement, focus visible, et jamais
  la couleur seule pour porter une information.

## Jeu de démonstration

`npm run db:reset` rejoue les migrations puis `supabase/seed/seed.sql` : deux sociétés dissemblables
(palette, semaine de travail, sites, fériés), un template de parcours avec ses dépendances, et quatre
parcours à des stades différents — à venir, en cours, bloqué (compte IT jamais créé, en retard) et
terminé — dont une tâche mutualisée entre deux arrivées. Les dates sont relatives à `current_date` :
la démonstration reste à jour quelle que soit la date à laquelle elle est rejouée.

Un seed SQL ne sait pas compter en jours ouvrés, et recopier ce calcul en SQL dupliquerait une règle
du domaine. `npm run db:reset` enchaîne donc le seed avec `scripts/seed/align-demo-dates.ts`, qui
recalcule arrivées, échéances et questionnaires avec le vrai moteur (week-ends et fériés de chaque
société et de chaque site). `npm run db:check-dates` vérifie qu'aucune date ne s'en écarte.

### Voir les règles métier sans écran

Les règles de T-10 à T-15 (blocages, templates, responsables, relances, satisfaction, matériel) ne
sont pas encore affichées par l'interface. `npm run demo:report` les rend visibles : il lit le jeu de
démonstration et fait tourner le vrai moteur du domaine, sans rien écrire en base.

```bash
npm run db:reset      # base propre, dates alignées
npm run demo:report   # rapport lisible, ticket par ticket
```

Pour parcourir les tables elles-mêmes, Supabase Studio est disponible sur `http://127.0.0.1:54323`
tant que la stack locale tourne.

Comptes de démonstration (mot de passe commun `OnboardingDemo!2026`) :

| Rôle | Email | Société | Parcours rattaché |
| --- | --- | --- | --- |
| RH | `rh@atelier-nord.demo` | Atelier Nord | — (voit tous ceux de sa société) |
| Manager | `manager@atelier-nord.demo` | Atelier Nord | — (voit ceux de ses rattachés) |
| IT | `it@atelier-nord.demo` | Atelier Nord | — (voit les tâches de son rôle) |
| Employé | `alice@atelier-nord.demo` | Atelier Nord | son intégration, en cours |
| Employé | `claire@atelier-nord.demo` | Atelier Nord | son intégration, à venir |
| Manager **et** employé | `nadia@groupe.demo` | Atelier Nord (manager) et Méridien Gulf (employé) | — |

Le dernier compte démontre la bascule de société : même personne, rôle et marque différents selon la
société active.

## Limites connues

- Resend, l'intégration agenda et les workflows n8n ne sont pas encore branchés — les répertoires
  correspondants sont créés mais vides. Supabase, lui, est branché sur les quatre écrans.
- Pas encore de déploiement public.

## Écarts d'accessibilité et de cohérence assumés (T-20)

La passe transverse T-20 a revu les quatre écrans ensemble (clavier, noms accessibles, contraste sur
les deux palettes de démonstration, cohérence des composants et des formulations) et corrigé ce
qu'elle a trouvé de réparable sans risque — voir
[docs/tickets/T-20-passe-accessibilite.md](docs/tickets/T-20-passe-accessibilite.md) pour le détail
écran par écran. Ce qui reste, consciemment laissé de côté plutôt que tu, comme l'exige la
définition de terminé du ticket :

- **Le retour (`returned`) et l'annulation (`cancelled`) d'une demande de matériel** sont des
  transitions légales du domaine (`ALLOWED_TRANSITIONS`) mais n'ont aucune action dans l'écran
  matériel — hérité de T-19, hors périmètre métier de T-20 (qui ne touche pas aux fonctionnalités).
- **« Nouvelle demande » de matériel ne permet pas de choisir la tâche à lier** — même chose, hérité
  de T-19, changement de formulaire plutôt que d'accessibilité.
- **La réorganisation des tâches d'un template** suit l'ordre de création, sans glisser-déposer —
  hérité de T-16 ; un glisser-déposer poserait de toute façon sa propre question d'accessibilité
  (équivalent clavier) qu'il faudrait résoudre en même temps, pas en ajouter par-dessus l'existant.
- **Les erreurs Supabase par section (cockpit, matériel)** restent vérifiées en lisant le code plutôt
  qu'en simulant une panne réseau contre l'instance locale — hérité de T-18/T-19, aucun moyen simple
  trouvé de déclencher ce chemin depuis un vrai navigateur sans perturber le reste des vérifications.
- **La restitution de focus de Next.js après un `redirect()` de Server Action vers la même URL**
  (matériel : commander, remettre, reprendre ; créateur de parcours : enregistrer, dupliquer,
  supprimer) n'a pas été vérifiée indépendamment du reste de l'application — elle s'appuie sur le
  gestionnaire de route intégré à l'App Router. Les changements qui ne naviguent réellement jamais
  (attribution de matériel, dépôt de document, accusé de réception, et désormais les transitions de
  matériel via le paramètre `succes` lu en `role="status"`) sont, eux, couverts par une région vive
  explicite et vérifiés au clavier par les scripts de `scripts/ui-checks/`.
- **Le moyen de contact du portail reste un nom seul**, sans email ni téléphone — hérité de T-17,
  `profiles` ne porte pas ces champs aujourd'hui.
