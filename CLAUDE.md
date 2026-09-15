# OnboardingRH — Parcours d'intégration multi-sociétés

## Contexte produit

Plateforme qui orchestre l'intégration d'un nouvel employé entre **RH, manager, IT et l'employé**, à
travers plusieurs sociétés d'un même groupe. À partir d'une embauche validée, le système génère le
parcours adapté (société × métier × site), assigne les tâches aux bons responsables, calcule les
échéances en jours ouvrés, relance et escalade les retards, puis mesure la satisfaction à J+7 et J+30.

Quatre surfaces produit :

1. **Créateur de parcours** — templates de tâches (responsable relatif, dépendances, délai, pièce attendue).
2. **Portail employé** — bienvenue personnalisée, documents, contacts, agenda de la 1re semaine, progression.
3. **Cockpit RH** — arrivées à venir, tâches bloquées, comptes non créés, satisfaction J+7/J+30.
4. **Gestion matériel** — demande, attribution et accusé de réception (ordinateur, badge, accessoires).

Pondération d'évaluation : produit & direction artistique 35 %, fonctionnalités métier 25 %,
automatisations/IA 25 %, qualité du code 10 %, documentation 5 %. **La direction artistique compte
plus que tout le reste** — une fonctionnalité livrée avec une UI négligée vaut moins qu'une
fonctionnalité plus modeste et soignée.

## Stack

| Rôle | Choix |
| --- | --- |
| Application | Next.js (App Router, React Server Components) + TypeScript `strict` |
| UI | Tailwind CSS + primitives Radix |
| Données / Auth / Fichiers | Supabase (Postgres, RLS, Storage) |
| Automatisations | n8n — workflows exportés en JSON dans `workflows/` |
| Emails | Resend |
| Agenda | Google Calendar / Outlook |
| Tests | Vitest + Testing Library |

## Architecture

Découpage en couches, **dépendances toujours orientées vers l'intérieur** :
`app` → `application` → `domain`. Le domaine ignore Supabase, React, le réseau et l'horloge système.

```
src/
  domain/          TypeScript pur, zéro I/O — le cœur métier, entièrement testé
    companies/     résolution de la configuration société (branding, règles, documents)
    scheduling/    jours ouvrés, jours fériés, calcul d'échéances
    templates/     sélection du template et instanciation du parcours
    tasks/         graphe de dépendances, transitions de statut, explication du blocage
    escalation/    politique de relance et d'escalade
    surveys/       scoring de satisfaction, détection de signal faible
    equipment/     cycle de vie du matériel
  application/     cas d'usage ; orchestre le domaine et les ports
    ports/         interfaces (repositories, mailer, calendar, storage, clock)
    use-cases/
  infrastructure/  implémentations des ports (supabase/, resend/, calendar/, storage/)
  app/             routes Next.js — (hr)/ (portal)/ (admin)/ api/
  components/      composants React ; ui/ contient les primitives
  lib/             utilitaires transverses
supabase/migrations/   schéma SQL versionné + policies RLS
supabase/seed/         jeu de données de démonstration
workflows/             exports JSON des workflows n8n
docs/                  architecture, décisions, workflow de développement
```

### Règles d'architecture non négociables

**Multi-sociétés.** Jamais de `if (company.slug === '…')` ni de branche conditionnelle par société
dans le code. Toute variation — logo, palette, règles, documents, templates de parcours, jours
fériés — est une **donnée** stockée en base et résolue à l'exécution. Ajouter une filiale doit être
une insertion en base, jamais un déploiement. Le branding s'applique via des variables CSS injectées
depuis l'enregistrement société.

**Dates.** Toute échéance passe par `domain/scheduling`. Aucun `new Date()` ni `Date.now()` dans
`domain/` ou `application/` — l'horloge est injectée via le port `Clock`, ce qui rend les scénarios
temporels testables. Un jour ouvré exclut les week-ends **et** les jours fériés configurés pour la
société et le site concernés.

**Données sensibles.** La RLS est la source de vérité de l'autorisation, pas le code applicatif :
chaque table métier porte `company_id` et une policy qui la scope. Rôles : `hr_admin`, `manager`,
`it`, `employee`. Aucun document personnel n'est joint à un email ni transmis dans un payload de
webhook — les notifications ne contiennent qu'un **lien signé à durée limitée**.

**Dépendances de tâches.** Une tâche bloquée doit toujours pouvoir répondre à « bloquée par quoi, et
qui en est le propriétaire ». Cette explication est calculée dans `domain/tasks`, pas dans l'UI.

**Accessibilité (WCAG AA).** Navigation clavier complète, labels explicites sur tout contrôle,
contraste 4.5:1 sur le texte. Jamais la couleur seule pour porter une information : un statut
combine icône + texte.

## Conventions

- **Langue** — code, identifiants, commentaires, branches et commits en **anglais** ; textes
  d'interface, emails et documentation utilisateur en **français**.
- **Commits** — Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`),
  une intention par commit. L'historique est un livrable évalué : il doit se lire.
- **Nommage** — fichiers `kebab-case.ts`, types et composants `PascalCase`, fonctions `camelCase`,
  tables et colonnes Postgres `snake_case`.
- **Pas de commentaire décoratif.** On commente le *pourquoi* non évident (règle métier, contrainte
  légale, contournement), jamais le *quoi*.

## Tests

Vitest. Tout module de `src/domain/` possède un `<nom>.test.ts` voisin. Le domaine se teste **sans
mock** : fonctions pures et horloge injectée. Les cas limites du cahier des charges sont des tests
nommés explicitement, pas des intentions :

- date d'arrivée reportée (recalcul de l'ensemble des échéances) ;
- manager absent (résolution du responsable de repli) ;
- employé sans email personnel ;
- tâche commune à plusieurs arrivées ;
- fin de contrat avant J+30 (annulation du questionnaire).

Une règle métier sans test ne part pas en revue.

## Workflow de développement

Voir [docs/WORKFLOW.md](docs/WORKFLOW.md). En résumé : une issue GitHub → une branche → domaine et
tests d'abord → infrastructure → UI → PR. Les agents spécialisés sont dans `.claude/agents/`, les
procédures réutilisables dans `.claude/skills/`.

## Commandes

```bash
npm run dev          # serveur de développement
npm run build        # build de production
npm run test         # Vitest (watch)
npm run test:run     # Vitest (une passe, pour la CI)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```
