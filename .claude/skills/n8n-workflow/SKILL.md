---
name: n8n-workflow
description: How to build, secure and export the n8n workflows for this project (W1 validated hire, W2 critical delay, W3 D+30 review) — where the business rules must live, webhook authentication, privacy constraints, and committing the JSON exports that are a required deliverable.
---

# Construire et exporter un workflow n8n

## La règle principale

**n8n orchestre, l'application décide.** Which template applies, how a due date lands on a working
day, when an escalation fires, how satisfaction is scored — all of that lives in `src/domain/` and is
reached through an authenticated API route. A Function node that recomputes a date is a second source
of truth that will drift from the tested one.

A workflow node should read: call endpoint, branch on the answer, notify. Not: calculate.

## Les trois workflows

**W1 — Embauche validée.** Hire validated → app selects the journey template (company × job × site)
and instantiates the tasks with computed due dates → invite the owners → schedule the welcome email
as a **deferred** send timed relative to the arrival date, not sent at creation time. A postponed
arrival must reschedule it rather than leave a stale send.

**W2 — Retard critique.** Scheduled scan for passed due dates → remind the task owner → if still open
at D+1, escalate to the manager → append every step to the audit trail. Deduplicate: a task overdue
for a week must not generate seven identical escalations.

**W3 — Bilan J+30.** Send the questionnaire → collect responses → app computes the satisfaction score
→ generate an **anonymised** AI summary → raise an HR alert if the signal is weak. A contract ending
before D+30 cancels the questionnaire instead of sending it.

## Sécurité des webhooks

Every webhook authenticates its caller — a shared secret header or a signature, checked before any
side effect. An unauthenticated endpoint that creates tasks or sends mail is an open door, and it is
the kind of thing a reviewer tests first.

Payloads carry **identifiers, not personal data**. If the workflow needs a name to render an email, it
fetches it from an authenticated endpoint at send time.

## Confidentialité

- No personal document as an attachment, ever. Emails carry a short-lived signed link.
- Before any text reaches an AI model, strip names, emails, team identifiers and anything
  re-identifying, and aggregate small cohorts rather than summarising one person's free-text answers.
  Label the output as aggregated.
- An employee without a personal email still has to be reached: fall back to the professional address,
  or to the manager, and record which channel was used.

## Exporter

The JSON exports are a **required deliverable** — they are graded, and a stale export is worse than
none.

1. In n8n: open the workflow → `…` menu → **Download**.
2. Save as `workflows/<slug>.json` (`w1-validated-hire.json`, `w2-critical-delay.json`,
   `w3-day-30-review.json`).
3. Strip credentials from the export. Credentials are referenced by name; the environment variables
   they need are documented in `.env.example` — with no secret values.
4. Commit with the change that motivated it, not in a separate cleanup pass.

Re-export after **every** change to a workflow, including a node rename.

## Documenter

Each workflow gets a short entry in the README: what triggers it, what it calls, what it sends, and
which environment variables it needs.
