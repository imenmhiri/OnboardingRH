# T-01 — Socle applicatif et garde-fous d'architecture

**Couches** : outillage · **Agent** : — · **Dépend de** : — · **État** : fait (`main`)

## Pourquoi

Aucun ticket métier ne peut être « terminé » tant que `typecheck`, `lint` et `test:run` n'existent
pas. Ce ticket rend les règles d'architecture exécutables plutôt que documentées.

## Périmètre

- Next.js App Router, TypeScript `strict`, Tailwind, Vitest, ESLint.
- Arborescence `domain` / `application` / `infrastructure` / `app` / `components` / `lib`,
  plus `supabase/migrations`, `supabase/seed`, `workflows`.
- Règles ESLint qui interdisent à `src/domain/` d'importer React, Next, Supabase ou une couche
  extérieure, et d'utiliser `Date` ou `fetch` ; et à `src/application/` d'importer `infrastructure/`.
- Deux projets Vitest : `domain` en environnement Node, `ui` en jsdom.
- `.env.example` sans secret, README d'installation.

## Hors périmètre

- Toute règle métier, tout écran, toute migration.

## Définition de terminé

- [x] `npm run dev`, `build`, `test:run`, `lint`, `typecheck` passent.
- [x] Une violation des règles de couches échoue au lint, vérifié sur un fichier sonde.
- [x] README : installation, architecture, choix, limites connues.
