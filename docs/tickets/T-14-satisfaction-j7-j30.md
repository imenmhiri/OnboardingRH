# T-14 — Satisfaction J+7 / J+30 et signal faible

**Couches** : domain/surveys, supabase · **Agent** : domain-expert + db-architect
**Dépend de** : T-06, T-09 · **État** : fait

## Pourquoi

C'est la mesure qui ferme la boucle : le parcours a-t-il fonctionné pour la personne qui l'a vécu.

## Périmètre

- Schéma des questionnaires, des réponses et des seuils, RLS comprise.
- Planification des envois à J+7 et J+30 en jours ouvrés.
- Score de satisfaction et détection de signal faible : note basse, chute entre J+7 et J+30, thème
  récurrent.
- Agrégation par société et par site, sans jamais ré-identifier un répondant.

## Ce qui a été décidé en chemin

**Un questionnaire sans objet est annulé à la planification, pas envoyé puis ignoré.** Demander à
quelqu'un parti depuis dix jours comment se passe son premier mois n'est pas une mesure, c'est du bruit
— et une maladresse. Le dernier jour du contrat compte encore : un contrat qui finit le jour même du
questionnaire le maintient.

**Une réponse est lisible par son auteur et par la RH, pas par le manager.** La RH doit pouvoir agir
sur un signal faible, sans quoi une alerte anonyme ne sert à rien ; un manager qui lit « 2/5 » sous le
nom de son arrivant, en revanche, abîme précisément la relation qu'on mesure. Décision écrite en tête
de la migration, et prouvée par requête.

**Sous le seuil d'anonymat, on ne publie même pas le nombre de répondants.** « 1 réponse sur ce site »
suffit à savoir de qui il s'agit : l'agrégat renvoie `too_few` sans moyenne ni décompte.

**Aucun répondant n'est pas une satisfaction nulle.** L'agrégat renvoie `no_data`, jamais `0`, et un
site sans réponse reste listé plutôt que de disparaître du tableau.

**Un thème ne compte qu'une fois par réponse.** Sinon une seule personne insistante ferait passer son
sujet pour un problème collectif.

## Cas limites couverts

- **Fin de contrat avant J+30** : questionnaire J+30 annulé avec le motif `contract_ended_before`
  (test nommé) ; les deux annulés si le contrat finit avant J+7 ; maintenu si la fin tombe le jour
  même. Et côté base, un questionnaire annulé **refuse** toute réponse — vérifié par requête.
- **Employé sans email personnel** : adresse professionnelle d'abord, personnelle à défaut, lien sur
  le portail sans aucune adresse — le questionnaire n'est jamais abandonné faute d'email.
- **Aucun répondant** : `no_data`, pas un zéro (test nommé).

## Définition de terminé

- [x] Le cas fin de contrat avant J+30 est un test nommé — trois, en réalité.
- [x] Un agrégat portant sur trop peu de réponses ne permet pas de ré-identifier quelqu'un — ni
      moyenne, ni nombre exact de répondants sous le seuil, fixé par société avec un plancher à 2.
- [x] Le scoring se teste sans mock — 24 tests, fonctions pures.

## Vérifié sur les données réelles

Le domaine a recalculé la planification des parcours du jeu de démonstration, détecté les signaux et
agrégé par site :

```
Diego Retardé   cdd fin=2026-09-19  day_7   2026-09-16 -> scheduled
Diego Retardé   cdd fin=2026-09-19  day_30  2026-10-19 -> cancelled (contract_ended_before)

Signaux faibles sur le parcours de Farida :
  low_rating (day_30, 2) + rating_drop (4 -> 2)

Agregats par site (seuil 5) : lille -> too_few, strasbourg -> no_data
```

Neuf contrôles RLS supplémentaires : l'employé voit et remplit son questionnaire, un collègue ne voit
ni ne répond à sa place, le manager ne lit pas la réponse, la RH la lit, un questionnaire annulé
refuse la réponse, une réponse ne se réécrit pas. 55 contrôles d'isolation au total.

## Deux défauts trouvés en vérifiant

**Dans mon code de test** : une variable redéclarée dans la suite d'isolation provoquait une
`SyntaxError`. La suite parcours ne s'exécutait plus, celle du stockage non plus — et un filtre `grep`
sur la sortie masquait l'erreur, laissant voir une seule ligne « PASSENT ». Corrigé ; la vérification
contrôle désormais le code de sortie et le décompte des contrôles, pas une ligne de texte.

**Dans le jeu de démonstration, non corrigé — voir la dette** : le seed pose les dates en décalages
*calendaires* (`current_date + 4`) alors que le domaine les calcule en jours *ouvrés*. Le statut de
chaque questionnaire est juste, mais les dates diffèrent de celles que le moteur produirait — Farida a
même un J+7 posé un dimanche.

## Dette laissée derrière

- **Dates du seed incohérentes avec le moteur**, pour les questionnaires comme pour les échéances de
  tâches posées en T-08. Un seed SQL ne peut pas appeler `domain/scheduling`, et réécrire le calcul
  des jours ouvrés en SQL dupliquerait une règle que CLAUDE.md impose de garder dans le domaine. La
  bonne correction est un script de seed qui passe par le domaine ; c'est un ticket à part entière.
- Rien ne crée encore les questionnaires en production : c'est W3 (T-23), qui appellera
  `planSurveys` et `resolveSurveyChannel`.
- Aucune suppression de réponse n'est possible, pas même pour un droit à l'effacement : hors périmètre,
  à traiter avant toute mise en production réelle.
