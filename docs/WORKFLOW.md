# Workflow de développement agentique

Ce document décrit comment le travail avance sur ce projet quand une partie de l'implémentation est
déléguée à des agents. Le détail pas-à-pas d'un ticket est dans la skill `new-feature` ; ici on décrit
la boucle générale, le rôle de chaque agent et ce qui fait qu'un ticket est terminé.

## Les agents

| Agent | Périmètre | Quand l'appeler |
| --- | --- | --- |
| `domain-expert` | `src/domain/` — règles métier pures + tests Vitest | Le ticket porte une règle : calcul d'échéance, dépendances, escalade, scoring |
| `db-architect` | `supabase/` — schéma, migrations, RLS | Le ticket ajoute ou modifie des données, ou touche à l'autorisation |
| `ui-builder` | `src/app/`, `src/components/` | Le ticket produit un écran ou un composant |
| `automation-builder` | `workflows/`, emails, agenda, synthèse IA | Le ticket touche W1, W2, W3 ou une notification |
| `code-reviewer` | lecture seule | Avant toute PR, et au moindre doute sur un diff |

Un agent ne sort pas de son périmètre. Si `ui-builder` a besoin d'une règle métier, la règle est
écrite par `domain-expert` et l'UI la consomme — elle ne la réimplémente pas dans un composant.

## La boucle

```
Issue GitHub
   └─ cadrage : ce qui sera vrai une fois le ticket fini + couches touchées
        └─ domaine + tests          (domain-expert)
             └─ migration + RLS     (db-architect)
                  └─ ports / cas d'usage
                       └─ interface (ui-builder)
                            └─ automatisation (automation-builder)
                                 └─ revue (code-reviewer)
                                      └─ PR
```

L'ordre n'est pas décoratif. Construire depuis l'UI éparpille les règles dans les composants et les
nœuds n8n — exactement ce que pénalisent les critères « qualité du code » et « multi-sociétés sans
dupliquer le code ».

Toutes les étapes ne s'appliquent pas à tous les tickets. Un ticket purement visuel n'a ni domaine ni
migration ; un ticket de règle métier peut s'arrêter après les tests.

## Ce qui peut avancer en parallèle

Les couches d'un même ticket sont séquentielles, mais des **tickets** indépendants peuvent avancer en
parallèle sur des branches séparées. Les zones sans recouvrement :

- le moteur de dates (`domain/scheduling`) et le design system (`components/ui`) ;
- les workflows n8n et le portail employé ;
- la gestion matériel et le questionnaire de satisfaction.

En revanche, le schéma Supabase est un goulot d'étranglement : deux migrations écrites en parallèle
entrent en conflit sur l'ordre d'application. Un seul ticket touche `supabase/migrations/` à la fois.

## Définition de « terminé »

Un ticket n'est pas fini tant que les six points suivants ne sont pas vrais :

1. `npm run typecheck`, `npm run lint` et `npm run test:run` passent.
2. Toute règle métier introduite a un test voisin, et les cas limites du cahier des charges que le
   ticket touche sont couverts nommément.
3. Aucune branche conditionnelle sur l'identité d'une société.
4. Toute nouvelle table a la RLS activée et une policy, dans la même migration.
5. Si le ticket produit de l'UI : états vide / chargement / erreur dessinés, navigation clavier
   vérifiée, contraste AA vérifié sur deux palettes de sociétés.
6. Si le ticket touche un workflow n8n : le JSON est ré-exporté dans `workflows/` et commité.

## Branches, commits, PR

- Branche : `feat/<numéro>-<slug>`, `fix/…`, `chore/…`, `docs/…` — slug en anglais.
- Commits : Conventional Commits, une intention par commit. **L'historique est un livrable évalué** —
  il doit se lire comme le récit du projet, pas comme une suite de `wip`.
- Attribution des commits rédigés avec l'assistant :
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- PR : ce qui change, les cas limites couverts, ce qui a été vérifié à la main, ce qui est hors
  périmètre volontairement. `gh pr create --fill` puis complétion.

## Honnêteté sur la vérification

Un agent qui n'a pas pu lancer l'application le dit. « Écran construit, non vérifié dans le
navigateur » est une information utile ; « écran terminé et testé » alors que rien n'a été ouvert fait
perdre du temps à tout le monde et coûte des points le jour de la démonstration.

Cette règle vaut aussi pour les migrations non appliquées et les workflows n8n non exécutés.

## Livrables à ne pas oublier

Ces éléments sont notés indépendamment du code et se perdent facilement en fin de projet :

- application déployée avec une **URL publique stable** ;
- `README.md` : installation, architecture, choix et limites ;
- `.env.example` **sans aucun secret** ;
- exports JSON des workflows n8n + jeu de données de démonstration ;
- vidéo commentée de 3 à 5 minutes.

Les trois premiers se maintiennent au fil de l'eau — un README écrit la veille de la remise se voit.
