# T-24 — Emails transactionnels

**Couches** : infrastructure/resend, application · **Agent** : automation-builder
**Dépend de** : T-07, T-12

## Pourquoi

Tout ce que le système décide finit par un message à quelqu'un. La contrainte de confidentialité se
joue ici.

## Périmètre

- Port `Mailer` et son implémentation Resend.
- Gabarits en français : bienvenue, tâche assignée, relance, escalade, questionnaire.
- Personnalisation par la marque de la société, depuis la base.
- Liens signés à durée limitée, jamais de pièce jointe.
- Trace des envois, gestion des échecs et des rejets.

## Hors périmètre

- Campagnes marketing, préférences de désabonnement.

## Cas limites à couvrir

- **Employé sans email personnel** : bascule vers le canal alternatif, sans échec silencieux.
- Adresse invalide ou rejetée : la tâche reste ouverte et la RH est prévenue.
- Société sans logo : le gabarit reste présentable.

## Définition de terminé

- [ ] Aucun document personnel en pièce jointe, vérifié sur un envoi réel.
- [ ] Les gabarits sont lisibles en texte brut comme en HTML.
- [ ] Aucune clé d'API dans le dépôt.
