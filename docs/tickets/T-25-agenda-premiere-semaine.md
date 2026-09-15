# T-25 — Agenda de la première semaine

**Couches** : infrastructure/calendar, application · **Agent** : automation-builder
**Dépend de** : T-11, T-17

## Pourquoi

L'agenda est ce qui rend l'intégration concrète pour l'employé et pour son équipe.

## Périmètre

- Port `Calendar` et implémentation Google Calendar ou Outlook.
- Création des évènements de la première semaine à partir du parcours.
- Mise à jour et annulation lorsque les dates changent.
- Affichage de l'agenda dans le portail employé.

## Hors périmètre

- Synchronisation bidirectionnelle, gestion des disponibilités.

## Cas limites à couvrir

- **Date d'arrivée reportée** : les évènements déjà créés sont déplacés, pas dupliqués.
- Participant sans compte agenda d'entreprise.
- Fuseau horaire différent entre le site et le siège.

## Définition de terminé

- [ ] Un report de date ne laisse aucun évènement orphelin.
- [ ] Aucune donnée sensible dans le titre ou la description des évènements.
- [ ] Échec d'intégration dégradé proprement : le portail reste utilisable.
