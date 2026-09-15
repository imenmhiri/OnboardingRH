# T-15 — Cycle de vie du matériel

**Couches** : domain/equipment, supabase · **Agent** : domain-expert + db-architect
**Dépend de** : T-06

## Pourquoi

Quatrième surface du produit : demander, attribuer, accuser réception d'un ordinateur, d'un badge,
d'accessoires — et savoir à tout moment ce qui manque pour une arrivée.

## Périmètre

- Schéma : catalogue de matériel par société, demandes, attributions, accusés de réception.
- Machine à états : demandé, commandé, attribué, remis, accusé, restitué.
- Lien avec les tâches : une remise non accusée bloque la tâche qui en dépend.

## Hors périmètre

- Écrans (T-19), intégration à un outil d'inventaire externe.

## Cas limites à couvrir

- Matériel attribué puis repris avant l'arrivée.
- Accusé de réception jamais signé : la tâche reste ouverte et remonte au cockpit.
- Même modèle commandé pour plusieurs arrivées simultanées.

## Définition de terminé

- [ ] Toute transition interdite est refusée avec un motif exploitable par l'interface.
- [ ] Le catalogue est une donnée par société.
- [ ] Machine à états entièrement testée.
