# T-13 — Politique de relance et d'escalade

**Couches** : domain/escalation, supabase · **Agent** : domain-expert · **Dépend de** : T-09, T-10, T-12
**État** : fait

## Pourquoi

Le produit promet de relancer et d'escalader les retards. Sans politique explicite, cela devient une
suite de conditions éparpillées dans les workflows n8n.

## Périmètre

- Niveaux de relance selon le retard en jours ouvrés et la criticité de la tâche.
- Destinataire de chaque niveau : responsable, puis repli, puis RH.
- Garde anti-harcèlement : une relance par tâche et par jour ouvré au maximum.
- Décision pure : la politique dit quoi envoyer et à qui, elle n'envoie rien.

## Ce qui a été décidé en chemin

**On ne sélectionne que les tâches actionnables, jamais les bloquées directement.** C'est ce qui
encode « on relance la cause racine, pas la victime » : `selectEscalationCandidates` réutilise
`actionableTasks` de `domain/tasks` (T-10), qui exclut par construction toute tâche dont une
dépendance n'est pas levée. Si une tâche bloquée est en retard, sa cause racine l'est nécessairement
aussi, et c'est elle — actionnable — qui apparaît comme candidate. Aucune logique de « remontée vers
la racine » à écrire séparément : c'est une conséquence directe de réutiliser le bon filtre.

**Le niveau retenu est le plus élevé atteint, pas le premier.** Une tâche à 4 jours de retard avec
des seuils à 1, 3 et 6 jours obtient le niveau 3 jours (manager), pas le niveau 1 jour (propriétaire)
qui serait trouvé en premier dans une liste non ordonnée.

**Le journal d'audit existant porte la dernière relance**, sans table dédiée : l'action
`task.reminder_sent` (à écrire par T-22/T-24) suffit à répondre « quand la dernière relance a-t-elle
été envoyée pour cette tâche ». Une table de plus aurait dupliqué ce que l'audit fait déjà.

## Cas limites couverts

- **Tâche bloquée par une autre** : seule la cause racine actionnable est candidate ; la victime ne
  l'est jamais, et redevient candidate dès que la cause racine est soldée ou annulée (trois tests).
- **Tâche annulée ou parcours interrompu** : aucune candidature, quel que soit le retard (deux tests).
- **Retard sur un pont férié** : le jour férié ne compte pas, via `workingDaysLate` de T-09, déjà
  testé pour ce cas — réutilisé, pas réécrit.

## Définition de terminé

- [x] Les seuils sont des données de la société — table `escalation_levels`, une ligne par société,
      criticité et seuil. Les deux sociétés du jeu de démonstration ont des seuils différents :
      Atelier Nord relance dès 1 jour ouvré, Méridien Gulf attend 2 jours.
- [x] Aucune horloge ambiante : `today` est un paramètre de `decideEscalation` et de
      `selectEscalationCandidates`, jamais lu en interne.
- [x] Chaque cas limite ci-dessus est un test nommé — 20 tests sur le module.

## Vérifié sur les données réelles

Le moteur a tourné sur le parcours bloqué du jeu de démonstration, avec sa tâche IT marquée critique
dans le seed :

```
Créer le compte IT    critique=critical  retard=7j  -> hr_admin (Rachel Renard)
```

Les deux seuils critiques d'Atelier Nord (manager à 1 jour, RH à 2 jours) sont franchis par un retard
de 7 jours ; le module retient bien le plus élevé et escalade directement à la RH, pas au manager.

## Un défaut de mon script de vérification, pas du produit

Mon script mappait les colonnes SQL (`after_working_days_late`) directement sur le type du domaine
(`afterWorkingDaysLate`) sans conversion : toutes les comparaisons de seuil échouaient silencieusement
contre `undefined`. Corrigé dans le script ; le module lui-même n'a jamais été en cause.

## Dette laissée derrière

- Rien n'appelle encore ce module en production : c'est le sujet de W2 (T-22), qui tournera une fois
  par jour ouvré et écrira l'action `task.reminder_sent` que ce ticket suppose déjà exister.
- La criticité d'une tâche est portée par la colonne, mais rien ne la fait encore descendre du
  template à l'instance à l'instanciation (T-11 ne la reportait pas) — à corriger quand W1 (T-21)
  branchera réellement l'instanciation.
