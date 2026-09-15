# T-09 — Moteur de jours ouvrés et d'échéances

**Couches** : domain/scheduling · **Agent** : domain-expert · **Dépend de** : T-01
**Premier jet** : branche `feat/2-working-day-scheduling`

## Pourquoi

Toutes les échéances du produit en dépendent. Une erreur ici se voit partout, et une échéance
calculée avec l'horloge système n'est pas testable.

## Périmètre

- Type de date civile sans fuseau, et son arithmétique.
- Calendrier de travail : week-end configurable et jours fériés, résolus par société et par site.
- Ajout et retrait de jours ouvrés, comptage entre deux dates, retard en jours ouvrés.
- Calcul des échéances d'un parcours à partir d'offsets relatifs à l'arrivée.

## Hors périmètre

- Lecture en base des jours fériés (T-04), relances (T-13).

## Cas limites à couvrir

- **Date d'arrivée reportée** : recalcul de l'ensemble des échéances, pas une translation.
- Échéance antérieure à l'arrivée (compte IT à J-2).
- Pont férié traversé, changement d'année, année bissextile.
- Société dont le week-end n'est pas samedi/dimanche.

## Définition de terminé

- [ ] Aucun `new Date()` ni `Date.now()` dans le module.
- [ ] Chaque cas limite ci-dessus est un test nommé.
- [ ] Le module se teste sans aucun mock.
