# T-12 — Résolution des responsables et responsable de repli

**Couches** : domain/tasks, application, infrastructure, supabase · **Agent** : domain-expert
**Dépend de** : T-10, T-11 · **État** : fait

## Pourquoi

Un template désigne un rôle relatif : le manager de l'employé. Si personne ne répond à ce rôle, la
tâche reste orpheline et le parcours s'arrête sans que personne ne le sache.

## Périmètre

- Résolution d'un responsable relatif vers une personne, à partir des rattachements.
- Chaîne de repli configurée en base : manager, puis manager du manager, puis RH.
- Marquage explicite des tâches non attribuables, remontées au cockpit.

## Ce qui a été décidé en chemin

**Une tâche d'équipe n'est pas une tâche orpheline.** C'est la distinction qui structure tout le
module. Une tâche IT sans propriétaire nommé est normale : la policy écrite en T-06 la rend déjà
visible à toute l'équipe qui porte le rôle (`has_company_role(company_id, array[owner_role])`). Une
tâche que la chaîne n'a pas su attribuer, elle, est orpheline et doit remonter. Les confondre ferait
soit crier au loup sur chaque tâche IT, soit laisser pourrir les vraies orphelines.

**L'absence se juge à la date d'échéance, pas à la création.** Un manager présent aujourd'hui peut
être en congés le jour où la tâche tombe — et c'est le cas fréquent, puisque les tâches d'un parcours
s'étalent sur plusieurs semaines. Trois tests couvrent les trois positions : avant, pendant, après.

**Plusieurs RH possibles : on trie avant de choisir.** Sans tri, le responsable désigné dépendrait de
l'ordre de retour du `SELECT`, et deux exécutions donneraient deux résultats.

**Aucune chaîne configurée ne donne pas un responsable par défaut.** La tâche remonte comme non
attribuable, ce qui se voit, plutôt que d'être attribuée au hasard, ce qui ne se voit pas.

## Cas limites couverts

- **Manager absent** : la chaîne de repli s'applique et le remplacement est tracé (tests nommés, pour
  le manager inexistant comme pour le manager en congés).
- **Manager en congés à la date d'échéance** : repli seulement si l'échéance tombe dans la période,
  pas avant, pas après (trois tests nommés).
- **Rôle IT porté par une équipe** : attribution à l'équipe, sans propriétaire nommé, et repli
  uniquement si l'équipe entière est absente.

## Définition de terminé

- [x] La chaîne de repli est une donnée, pas une constante du code — table `assignment_rules`, une
      ligne par société et par rôle. Les deux sociétés du jeu de démonstration ont d'ailleurs des
      chaînes **différentes** : `manager > manager_of_manager > hr_admin` chez Atelier Nord,
      `manager > hr_admin` chez Méridien Gulf, où il n'y a pas d'échelon intermédiaire.
- [x] Toute substitution est tracée : qui remplace qui, et pourquoi — `task.owner_substituted` et
      `task.unassignable` dans le journal d'audit, avec le maillon sauté et le motif.
- [x] Le cas limite « manager absent » est un test nommé — deux, en réalité.

## Vérifié sur les données réelles

Le module a tourné sur le parcours en cours du jeu de démonstration, avec le manager réellement mis
en congés dans le seed :

```
Chaines chargees depuis la base :
  manager    -> manager > manager_of_manager > hr_admin
  it         -> it_team > hr_admin

Absences : Marc Manceau du 2026-09-10 au 2026-09-20 (Congés)

Contrat signé                      2026-09-06   -> Rachel Renard
Créer le compte IT                 2026-09-09   -> equipe it
Préparer le poste de travail       2026-09-10   -> equipe it
Accueil et remise du matériel      2026-09-11   -> Rachel Renard [remplace : manager/absent_on_due_date]
Point de fin de première semaine   2026-09-18   -> Rachel Renard [remplace : manager/absent_on_due_date]
```

Les tâches dont l'échéance tombe avant le départ gardent leur responsable ; celles qui tombent
pendant l'absence basculent, avec le motif écrit. Les tâches IT vont à l'équipe sans être considérées
comme orphelines.

## Un défaut de mon script de vérification, pas du produit

Le pilote `pg` rend un tableau d'enum sous forme de chaîne brute `{a,b,c}`, alors que PostgREST le
rend en JSON. Mon script brut s'est cassé dessus ; j'ai vérifié séparément que le chemin de
production — supabase-js — renvoie bien un tableau JavaScript, donc l'adaptateur est correct.

## Dette laissée derrière

- Dans le jeu de démonstration, le « manager du manager » et la RH sont la même personne (Rachel
  Renard) : la chaîne fonctionne, mais la démonstration serait plus lisible avec un directeur
  distinct. À étoffer si la vidéo en a besoin.
- La résolution n'est pas encore appelée à l'instanciation d'un parcours : `assignJourneyOwners`
  existe et est testé, mais rien ne l'invoque tant que W1 (T-21) n'existe pas.
- Les tâches non attribuables ne remontent nulle part visuellement : le cockpit est T-18.
