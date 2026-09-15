# T-13 — Politique de relance et d'escalade

**Couches** : domain/escalation · **Agent** : domain-expert · **Dépend de** : T-09, T-10, T-12

## Pourquoi

Le produit promet de relancer et d'escalader les retards. Sans politique explicite, cela devient une
suite de conditions éparpillées dans les workflows n8n.

## Périmètre

- Niveaux de relance selon le retard en jours ouvrés et la criticité de la tâche.
- Destinataire de chaque niveau : responsable, puis repli, puis RH.
- Garde anti-harcèlement : une relance par tâche et par jour ouvré au maximum.
- Décision pure : la politique dit quoi envoyer et à qui, elle n'envoie rien.

## Hors périmètre

- L'envoi lui-même (T-24) et son déclenchement (T-22).

## Cas limites à couvrir

- Tâche bloquée par une autre : on relance le propriétaire de la cause racine, pas la victime.
- Tâche annulée ou parcours interrompu : plus aucune relance.
- Retard s'étendant sur un pont férié : il ne compte pas comme du retard.

## Définition de terminé

- [ ] Les seuils sont des données de la société, pas des constantes.
- [ ] Aucune horloge ambiante : la date du jour est un paramètre.
- [ ] Chaque cas limite ci-dessus est un test nommé.
