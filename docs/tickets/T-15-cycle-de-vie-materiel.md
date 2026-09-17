# T-15 — Cycle de vie du matériel

**Couches** : domain/equipment, supabase · **Agent** : domain-expert + db-architect
**Dépend de** : T-06 · **État** : fait

## Pourquoi

Quatrième surface du produit : demander, attribuer, accuser réception d'un ordinateur, d'un badge,
d'accessoires — et savoir à tout moment ce qui manque pour une arrivée.

## Périmètre

- Schéma : catalogue de matériel par société, demandes, attributions, accusés de réception.
- Machine à états : demandé, commandé, attribué, remis, accusé, restitué.
- Lien avec les tâches : une remise non accusée bloque la tâche qui en dépend.

## Ce qui a été décidé en chemin

**« Attribué puis repris » n'est pas un septième état, c'est une transition dans le vocabulaire
existant.** Le cahier des charges liste exactement six états ; `assigned -> requested` couvre le cas
sans en ajouter un — le matériel redevient simplement à affecter, immédiatement réaffectable. La trace
de *pourquoi* on est revenu en arrière passe par le journal d'audit déjà en place (T-06), pas par une
colonne dédiée — même choix qu'en T-13 pour les relances.

**Le blocage d'une tâche par le matériel est un lien, pas un septième champ de statut.** Une demande
porte un `task_id` optionnel ; tant qu'elle n'est ni `acknowledged`, ni `returned`, ni `cancelled`,
elle bloque. Pas de duplication d'état entre la tâche et le matériel qui pourrait diverger.

**Le regroupement de commande ne franchit jamais une frontière de société**, même si deux filiales ont
un article au nom identique dans leur catalogue — deux lignes de catalogue distinctes, deux commandes
distinctes.

**Seul l'accusé de réception est un geste que l'employé fait lui-même.** La policy RLS ne vérifie que
la destination du changement (`status = 'acknowledged'`) ; la légalité de la transition de départ
(`handed_over -> acknowledged`, pas `requested -> acknowledged`) reste la responsabilité du domaine —
même séparation des responsabilités qu'ailleurs dans le projet : la RLS décide *qui*, le domaine
décide *quoi*.

## Cas limites couverts

- **Matériel attribué puis repris avant l'arrivée** : `assigned -> requested` autorisé, redevient
  affectable (trois tests) ; tracé dans l'audit et vérifié sur une vraie ligne du jeu de démonstration.
- **Accusé de réception jamais signé** : la demande reste ouverte, bloque sa tâche liée, remonte
  comme telle (cinq tests) ; vérifié sur le badge de Diego dans le parcours bloqué.
- **Même modèle commandé pour plusieurs arrivées simultanées** : regroupement en une commande unique,
  jamais entre deux sociétés (cinq tests) ; vérifié sur les ordinateurs de Claire et Diego, groupés en
  une commande de deux. *Corrigé depuis : ce regroupement ignorait la date d'arrivée ; il se fait
  désormais par semaine d'arrivée (voir T-19, « Correction après livraison »).*

## Définition de terminé

- [x] Toute transition interdite est refusée avec un motif exploitable par l'interface — trois codes
      (`same_status`, `terminal_status`, `illegal_transition`), chacun porte la paire d'états en cause.
- [x] Le catalogue est une donnée par société — table `equipment_catalog_items`, `unique(company_id,
      name)`.
- [x] Machine à états entièrement testée — 20 tests sur le module.

## Vérifié sur les données réelles

```
Diego Retardé      Badge d'accès                  handed_over
  -> attend un accuse = true, bloque la tache liee = true

Trace de reprise : { "from": "assigned", "to": "requested",
  "reason": "Arrivée décalée : badge remis au pool commun avant d'être réaffecté." }

Commandes a grouper :
  Ordinateur portable standard, quantite 2, parcours [Claire Collègue, Diego Retardé]
```

61 contrôles d'isolation au total : l'IT lit le catalogue de sa société, l'employé voit son propre
matériel et peut **uniquement** l'accuser reçu — une tentative de le faire avancer vers un autre statut,
ou d'en créer une demande, est refusée par la RLS.

## Un défaut trouvé en vérifiant, dans mon propre outillage

`scripts/seed/align-demo-dates.ts` (écrit pour corriger T-08/T-14) recalculait les dates de **tous**
les parcours de la société, y compris les parcours jetables que `npm run db:verify` insère pour
éprouver la RLS — jamais nettoyés entre deux exécutions, et portant par coïncidence le même nom
qu'une vraie personne du jeu de démonstration (« Alice Arrivante »). Enchaîner `db:verify` puis
`db:check-dates` faisait donc remonter de fausses incohérences. Corrigé : le script se restreint
maintenant aux parcours du seed de démonstration, reconnaissables à leur préfixe d'identifiant.

## Dette laissée derrière

- Aucun écran de gestion (T-19) : les cas d'usage d'orchestration (créer une demande, l'assigner,
  générer une commande groupée) n'existent pas encore, seul le domaine pur est prêt.
- Pas d'intégration à un outil d'inventaire externe, explicitement hors périmètre.
- Le catalogue de Méridien Gulf existe dans le seed mais n'a aucune demande liée : aucun parcours n'y
  est encore posé (dette déjà notée en T-08).
