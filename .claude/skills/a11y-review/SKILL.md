---
name: a11y-review
description: WCAG AA checklist for this project — keyboard navigation, accessible names in French, contrast against both brand palettes, status never conveyed by colour alone. Use before marking any UI ticket done, and when reviewing a change that touches components or screens.
---

# Vérifier l'accessibilité (WCAG AA)

Accessibility is a stated hard requirement of the brief ("navigation clavier, labels explicites et
contrastes WCAG AA"), so it is part of "done" for every UI ticket — never a follow-up.

## Clavier

- Tab through the whole screen. Every interactive element is reachable, in an order that matches the
  visual layout.
- The focus ring is always visible. `outline: none` without a designed replacement is a defect.
- Dialogs trap focus while open, restore it to the trigger on close, and close on `Escape`.
- No interaction available only on hover or only with a mouse. A row action revealed on hover must
  also appear on focus.
- Skip link to the main content on pages with a long navigation.

## Noms accessibles

- Every control has a name a screen reader can announce, **in French**.
- Icon-only buttons carry `aria-label` — "Relancer le responsable", not "Relancer" alone if the
  context is ambiguous out of order.
- Every form input has a real `<label>` tied by `htmlFor`. Placeholder text is not a label.
- Error messages are tied to their field with `aria-describedby` and announced, not only coloured red.

## Contraste

- Text ≥ 4.5:1, large text ≥ 3:1, UI component boundaries and focus indicators ≥ 3:1.
- Check against **both** brand palettes, not just the default one. Company branding is runtime data —
  a contrast that only holds for one subsidiary is a bug the graders can trigger by switching company.
- Disabled controls still need to be legible enough to read.

## Jamais la couleur seule

This project is full of status: pending, blocked, overdue, done. Each one combines an **icon and a
word**, never a coloured dot alone.

```
✗  <span className="text-red-500">●</span>
✓  <span><AlertTriangle aria-hidden /> Bloquée</span>
```

The same applies to the cockpit's charts and the satisfaction indicators.

## Sémantique

- Real HTML first: `<button>` for actions, `<a>` for navigation, `<table>` for tabular data with
  proper headers. ARIA patches semantics, it does not create them.
- One `<h1>` per page, heading levels in order, no level skipped for visual size.
- Use the Radix primitive rather than reimplementing a dialog, menu, tooltip or combobox.
- Lists of tasks are lists.

## Changements dynamiques

Completing a task, sending an escalation and loading cockpit data all change the page without
navigation. Announce the outcome through a polite live region so a screen reader user learns that the
action succeeded.

## Vérification

Keyboard pass by hand, then check contrast on the actual rendered colours for at least two company
palettes. Report what you verified and what you could not — an unverified claim of AA compliance is
worse than an honest gap.
