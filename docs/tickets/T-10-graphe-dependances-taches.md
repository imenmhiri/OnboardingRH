# T-10 — Graphe de dépendances et statuts de tâches

**Couches** : domain/tasks · **Agent** : domain-expert · **Dépend de** : T-09 · **État** : fait

## Pourquoi

Une tâche bloquée doit toujours pouvoir répondre à : bloquée par quoi, et qui en est le
propriétaire. Cette réponse se calcule, elle ne s'assemble pas dans un composant.

## Périmètre

- Construction du graphe, détection des cycles, dépendances inconnues, doublons.
- Transitions de statut et refus motivés.
- Explication du blocage, remontée jusqu'à la cause racine avec son responsable.
- Tâches actionnables du jour, et ce qu'une tâche débloque en se terminant.
- Mutualisation d'une tâche entre plusieurs arrivées.

## Ce qui a été décidé en chemin

**« Bloquée » n'est pas un statut stocké.** Les statuts en base sont `pending`, `in_progress`,
`done`, `cancelled` — vérifié dans l'enum de la migration T-06, il n'y a pas de valeur `blocked`. Le
blocage se dérive du graphe à chaque lecture : un drapeau stocké deviendrait faux à la seconde où la
tâche bloquante est terminée, et personne ne saurait lequel des deux croire.

**Une dépendance annulée lève le blocage** au lieu de le figer. Une tâche annulée ne se terminera
jamais ; la maintenir bloquante condamnerait tout ce qui en dépend.

**L'annulation est toujours permise, même bloquée.** Une embauche qui ne se fait pas ne doit pas
laisser derrière elle une tâche impossible à solder.

## Cas limites couverts

- **Tâche commune à plusieurs arrivées** : un seul élément, portant l'échéance de l'arrivée la plus
  proche, soldé en une fois — et les membres qui refusent sont signalés, pas ignorés.
- **Dépendance annulée** : elle lève le blocage (test nommé).
- **Chaîne de blocage à plusieurs niveaux** : la cause racine n'est pas la dépendance directe
  (test nommé, et vérifié sur les vraies données, voir plus bas).

## Définition de terminé

- [x] L'explication du blocage nomme la tâche **et** son propriétaire — rôle toujours, personne
      quand elle est attribuée (voir la réserve ci-dessous).
- [x] Aucun statut bloqué stocké en base : l'enum `task_status` ne contient pas `blocked`.
- [x] Chaque cas limite ci-dessus est un test nommé — 30 tests sur le module, 143 au total.

## Vérifié sur les données réelles

Le moteur a été exécuté sur le parcours bloqué du jeu de démonstration (T-08), pas seulement sur des
fixtures :

```
Contrat signé                      done       -> rien ne bloque
Créer le compte IT                 pending    -> rien ne bloque
Commander le badge d'accès         done       -> rien ne bloque
Préparer le poste de travail       pending    -> Créer le compte IT (it, non attribuée)
Accueil et remise du matériel      pending    -> Créer le compte IT (it, non attribuée)
Point de fin de première semaine   pending    -> Créer le compte IT (it, non attribuée)

Actionnables aujourd'hui : Créer le compte IT
```

Les trois tâches bloquées remontent à la même cause racine, alors que ce n'est la dépendance
*directe* d'aucune des deux dernières : le moteur traverse bien la chaîne. Et `actionableTasks` ne
renvoie qu'une seule tâche — la seule chose qu'on puisse réellement faire aujourd'hui pour débloquer
le reste.

## Une réserve, qui est le sujet du ticket suivant

Sur ces données, la cause racine est **non attribuée** : `ownerId` est nul, donc l'explication nomme
le rôle (`it`) sans pouvoir nommer une personne. Ce n'est pas un défaut du calcul — on ne peut pas
nommer quelqu'un qui n'existe pas — mais cela montre pourquoi une tâche pourrit : personne ne l'a
prise. C'est exactement ce que résout **T-12**, résolution des responsables et chaîne de repli.

## Dette laissée derrière

- Le type `Task` du domaine ne porte pas encore `expectedDocument`, alors que la table l'a : ce
  champ descend du template, il arrivera avec T-11.
- Aucun repository ne lit ce graphe depuis la base : le branchement viendra avec le cockpit (T-18).
