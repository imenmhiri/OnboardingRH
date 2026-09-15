# T-14 — Satisfaction J+7 / J+30 et signal faible

**Couches** : domain/surveys, supabase · **Agent** : domain-expert + db-architect
**Dépend de** : T-06, T-09

## Pourquoi

C'est la mesure qui ferme la boucle : le parcours a-t-il fonctionné pour la personne qui l'a vécu.

## Périmètre

- Schéma des questionnaires et des réponses, RLS comprise.
- Planification des envois à J+7 et J+30 en jours ouvrés.
- Score de satisfaction et détection de signal faible : note basse, chute entre J+7 et J+30,
  commentaire négatif sur un thème récurrent.
- Agrégation par société et par site, sans jamais ré-identifier un répondant.

## Hors périmètre

- Envoi des emails (T-24), synthèse IA (T-26).

## Cas limites à couvrir

- **Fin de contrat avant J+30** : le questionnaire est annulé, pas envoyé puis ignoré.
- Employé sans email personnel : passage par le canal alternatif.
- Aucun répondant : l'agrégat affiche une absence de donnée, pas un zéro.

## Définition de terminé

- [ ] Le cas fin de contrat avant J+30 est un test nommé.
- [ ] Un agrégat portant sur trop peu de réponses ne permet pas de ré-identifier quelqu'un.
- [ ] Le scoring se teste sans mock.
