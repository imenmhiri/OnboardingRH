# T-07 — Stockage privé et liens signés

**Couches** : infrastructure, application · **Agent** : db-architect · **Dépend de** : T-06

## Pourquoi

Contrainte non négociable : aucun document personnel dans un email ni dans un payload de webhook.
Seul circule un lien signé à durée limitée.

## Périmètre

- Buckets privés par société, politiques d'accès.
- Port `Storage` : dépôt, suppression, génération d'URL signée à expiration courte.
- Contrôle de type et de taille au dépôt.
- Traçabilité : qui a généré un lien, pour quelle pièce, quand.

## Hors périmètre

- Antivirus, signature électronique.

## Cas limites à couvrir

- Lien expiré : message clair et possibilité d'en regénérer un.
- Document déposé sur le mauvais parcours : suppression et trace.

## Définition de terminé

- [ ] Aucun bucket public.
- [ ] Une URL signée expirée ne donne plus accès au fichier, vérifié.
- [ ] Aucune pièce jointe dans un email ni dans un webhook, vérifié sur un envoi réel.
