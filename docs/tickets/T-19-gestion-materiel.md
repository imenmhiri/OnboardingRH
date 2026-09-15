# T-19 — Écrans de gestion du matériel

**Couches** : app, components · **Agent** : ui-builder · **Dépend de** : T-03, T-15

## Pourquoi

Quatrième surface : elle sert trois personnes différentes — l'IT qui prépare, la RH qui suit,
l'employé qui accuse réception.

## Périmètre

- Demande de matériel depuis un parcours, à partir du catalogue de la société.
- File de préparation pour l'IT, groupée par arrivée et par échéance.
- Attribution d'un matériel identifié, puis remise.
- Accusé de réception par l'employé depuis son portail.

## Hors périmètre

- Gestion de stock, achats, amortissement.

## Cas limites à couvrir

- Même matériel demandé pour plusieurs arrivées le même jour.
- Accusé de réception en retard : la tâche liée reste ouverte.
- Matériel repris avant l'arrivée.

## Définition de terminé

- [ ] Les trois rôles voient uniquement ce qui les concerne, garanti par la RLS.
- [ ] États vide, chargement et erreur dessinés.
- [ ] Parcours d'accusé de réception utilisable au clavier et sur mobile.
