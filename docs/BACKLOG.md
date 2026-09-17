# Backlog

Un fichier par ticket dans [tickets/](tickets/). Chaque ticket dit pourquoi il existe, ce qu'il
couvre, ce qu'il ne couvre pas, les cas limites à tenir et ce qui doit être vrai pour le déclarer
terminé. L'ordre des identifiants est un ordre de dépendances, pas un calendrier.

Le déroulé d'un ticket est décrit dans la skill `new-feature` ; la boucle générale et la définition
de terminé commune sont dans [WORKFLOW.md](WORKFLOW.md).

## Socle

| # | Ticket | Couches | Agent | Dépend de | État |
| --- | --- | --- | --- | --- | --- |
| T-01 | [Socle applicatif et garde-fous](tickets/T-01-socle-applicatif.md) | outillage | — | — | fait |
| T-02 | [Chaîne de qualité en CI](tickets/T-02-chaine-qualite-ci.md) | outillage | — | T-01 | fait |
| T-03 | [Design system et branding](tickets/T-03-design-system-branding.md) | components/ui | ui-builder | T-01 | fait |

## Données et autorisation

| # | Ticket | Couches | Agent | Dépend de | État |
| --- | --- | --- | --- | --- | --- |
| T-04 | [Sociétés, sites, membres, fériés](tickets/T-04-schema-societes-sites-feries.md) | supabase | db-architect | T-01 | fait |
| T-05 | [Authentification et société active](tickets/T-05-authentification-societe-active.md) | app, infra | db-architect, ui-builder | T-04 | fait |
| T-06 | [Parcours, tâches, documents](tickets/T-06-schema-parcours-taches-documents.md) | supabase | db-architect | T-04 | fait |
| T-07 | [Stockage privé et liens signés](tickets/T-07-storage-liens-signes.md) | infra | db-architect | T-06 | fait |
| T-08 | [Jeu de démonstration](tickets/T-08-jeu-de-demonstration.md) | supabase/seed | db-architect | T-04, T-06 | fait |

## Domaine métier

| # | Ticket | Couches | Agent | Dépend de | État |
| --- | --- | --- | --- | --- | --- |
| T-09 | [Jours ouvrés et échéances](tickets/T-09-moteur-jours-ouvres.md) | domain/scheduling | domain-expert | T-01 | fait |
| T-10 | [Graphe de dépendances](tickets/T-10-graphe-dependances-taches.md) | domain/tasks | domain-expert | T-09 | fait |
| T-11 | [Templates et instanciation](tickets/T-11-templates-instanciation-parcours.md) | domain/templates | domain-expert | T-09, T-10 | fait |
| T-12 | [Responsables et repli](tickets/T-12-resolution-responsables.md) | domain/tasks | domain-expert | T-10, T-11 | fait |
| T-13 | [Relance et escalade](tickets/T-13-relance-escalade.md) | domain/escalation | domain-expert | T-09, T-10, T-12 | fait |
| T-14 | [Satisfaction J+7 / J+30](tickets/T-14-satisfaction-j7-j30.md) | domain/surveys | domain-expert, db-architect | T-06, T-09 | fait |
| T-15 | [Cycle de vie du matériel](tickets/T-15-cycle-de-vie-materiel.md) | domain/equipment | domain-expert, db-architect | T-06 | fait |

## Surfaces produit

| # | Ticket | Couches | Agent | Dépend de | État |
| --- | --- | --- | --- | --- | --- |
| T-16 | [Créateur de parcours](tickets/T-16-createur-de-parcours.md) | app | ui-builder | T-03, T-06, T-11 | fait |
| T-17 | [Portail employé](tickets/T-17-portail-employe.md) | app | ui-builder | T-03, T-05, T-06, T-07 | fait |
| T-18 | [Cockpit RH](tickets/T-18-cockpit-rh.md) | app | ui-builder | T-03, T-06, T-10, T-12, T-14 | fait |
| T-19 | [Gestion du matériel](tickets/T-19-gestion-materiel.md) | app | ui-builder | T-03, T-15 | fait |
| T-20 | [Passe d'accessibilité](tickets/T-20-passe-accessibilite.md) | app | ui-builder | T-16 à T-19 | fait |

## Automatisations et IA

| # | Ticket | Couches | Agent | Dépend de | État |
| --- | --- | --- | --- | --- | --- |
| T-21 | [W1 embauche validée](tickets/T-21-w1-embauche-validee.md) | workflows | automation-builder | T-11, T-12 | fait |
| T-22 | [W2 retard critique](tickets/T-22-w2-retard-critique.md) | workflows | automation-builder | T-13, T-24 | fait |
| T-23 | [W3 revue J+30](tickets/T-23-w3-revue-j30.md) | workflows | automation-builder | T-14, T-24 | fait |
| T-24 | [Emails transactionnels](tickets/T-24-emails-resend.md) | infra/resend | automation-builder | T-07, T-12 | fait |
| T-25 | [Agenda première semaine](tickets/T-25-agenda-premiere-semaine.md) | infra/calendar | automation-builder | T-11, T-17 | fait |
| T-26 | [Synthèse IA anonymisée](tickets/T-26-synthese-ia-anonymisee.md) | application | automation-builder | T-14 | fait |

## Livraison

| # | Ticket | Couches | Agent | Dépend de | État |
| --- | --- | --- | --- | --- | --- |
| T-27 | [Déploiement et URL publique](tickets/T-27-deploiement-url-publique.md) | outillage | — | T-02, T-05 | fait |
| T-28 | [Documentation et vidéo](tickets/T-28-documentation-et-demonstration.md) | docs | — | T-16 à T-26 | à faire |

## Cas limites du cahier des charges

Chacun est rattaché à un ticket qui doit le couvrir par un test nommé.

| Cas limite | Ticket |
| --- | --- |
| Date d'arrivée reportée, recalcul des échéances | T-09, aussi T-25 |
| Manager absent, responsable de repli | T-12 |
| Employé sans email personnel | T-24, aussi T-17 et T-23 |
| Tâche commune à plusieurs arrivées | T-10, aussi T-19 |
| Fin de contrat avant J+30 | T-14, aussi T-23 |

## Note historique

Les quatre premiers tickets du domaine (T-04, T-09, T-10, T-11) ont eu un premier jet écrit avant
que ce backlog ne soit posé, sur des branches qui traînaient l'historique d'un ancien découpage.
Chacun a été repris depuis `main`, isolé de ce qui ne lui appartenait pas, relu, complété et vérifié
contre une base Supabase réelle avant d'être mergé. Les quatre sont aujourd'hui « fait » ci-dessus.
