# OnboardingRH

Plateforme d'intégration multi-sociétés : à partir d'une embauche validée, elle génère le parcours
adapté (société × métier × site), assigne les tâches à la RH, au manager, à l'IT et à l'employé,
calcule les échéances en jours ouvrés, relance les retards et mesure la satisfaction à J+7 et J+30.

> **État du projet** — socle technique en place (Next.js, TypeScript strict, Tailwind, Vitest,
> découpage en couches). Les fonctionnalités métier arrivent ticket par ticket ; voir
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

## Limites connues

- Supabase, Resend, l'intégration agenda et les workflows n8n ne sont pas encore branchés — les
  répertoires correspondants sont créés mais vides.
- Pas encore de déploiement public ni de jeu de données de démonstration.
