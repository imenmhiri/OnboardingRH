---
name: new-feature
description: The end-to-end workflow for implementing a GitHub issue in this repo — branch naming, domain-first order of work, test expectations, commit hygiene and pull request contents. Use when starting work on a ticket, or when asked "how do we do a feature here".
---

# Implémenter un ticket

The order below exists because this codebase puts its business rules in a pure core. Building inward
out (UI first) produces rules scattered across components and workflows, which is exactly what the
code-quality and multi-company criteria penalise.

## 1. Cadrer

Read the issue. Restate in one sentence what will be true when it is done, and identify which layers
it touches. If the issue turns out to cover more than one shippable change, say so before writing
code — split it rather than opening a sprawling PR.

Check the issue against the brief's edge cases: does this feature need to survive a postponed arrival,
an absent manager, an employee without a personal email, a task shared across arrivals, or a contract
ending before D+30? If yes, those are part of *this* ticket.

## 2. Brancher

```bash
git switch main
git pull
git switch -c feat/<issue-number>-<short-slug>
```

Prefixes: `feat/`, `fix/`, `chore/`, `docs/`. Slug in English, kebab-case.

## 3. Domaine et tests d'abord

If the ticket involves a business rule, it starts in `src/domain/` with a sibling `*.test.ts`. Write
the test first where the rule is well specified — the brief is precise enough that most of them are.

The domain stays pure: no I/O, no `new Date()`, no company branching. Delegate to the `domain-expert`
agent when the rule is substantial.

Run `npm run test:run` before moving on. A failing or absent test here means the rest of the work is
built on sand.

## 4. Persistance

New tables or columns go in a fresh timestamped migration under `supabase/migrations/`, with RLS
enabled in the **same** migration. Never edit an applied migration. Delegate to `db-architect`.

## 5. Ports et cas d'usage

Wire the domain to the outside through `application/ports` interfaces implemented in
`infrastructure/`. A use case orchestrates; it holds no rules of its own.

## 6. Interface

Server Components by default, Server Actions for mutations, no Supabase calls from components.
Build the empty, loading and error states — they are graded. Keyboard navigation, accessible names
and AA contrast are part of "done", not a follow-up ticket. Delegate to `ui-builder`.

## 7. Automatisation

If the ticket touches W1/W2/W3, the rule lives in the domain and n8n only orchestrates. Re-export the
workflow JSON into `workflows/` and commit it — it is a required deliverable. Delegate to
`automation-builder`.

## 8. Vérifier

```bash
npm run typecheck
npm run lint
npm run test:run
```

Then run the app and actually use the feature. If you could not verify it in the browser, say so
explicitly instead of reporting it as working.

## 9. Commiter

Conventional Commits, one intention per commit. The commit history is an explicitly graded deliverable
("historique de commits lisible") — a single `wip` blob at the end costs points.

```
feat(scheduling): compute due dates on working days

Closes #5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## 10. Revue et PR

Run the `code-reviewer` agent on the diff first and address what it finds.

```bash
git push -u origin HEAD
gh pr create --fill
```

The PR description states what changed, which edge cases are covered, what was verified manually, and
what was deliberately left out.
