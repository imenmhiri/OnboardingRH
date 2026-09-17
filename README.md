# OnboardingRH

[![CI](https://github.com/imenmhiri/OnboardingRH/actions/workflows/ci.yml/badge.svg)](https://github.com/imenmhiri/OnboardingRH/actions/workflows/ci.yml)

Plateforme d'intégration multi-sociétés : à partir d'une embauche validée, elle génère le parcours
adapté (société × métier × site), assigne les tâches à la RH, au manager, à l'IT et à l'employé,
calcule les échéances en jours ouvrés, relance les retards et mesure la satisfaction à J+7 et J+30.

> **État du projet** — les quatre surfaces produit (créateur de parcours, portail employé, cockpit
> RH, gestion du matériel) sont construites et reliées au vrai jeu de données, avec une passe
> d'accessibilité et de cohérence transverse (T-20) une fois les quatre en place. Le périmètre est
> découpé en tickets dans [docs/BACKLOG.md](docs/BACKLOG.md), traités un par un selon
> [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Installation

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
cp .env.example .env.local   # puis renseigner les variables
npm run dev                  # http://localhost:3000
```

Aucun service externe n'est requis pour lancer l'application en l'état ; les variables
d'environnement deviennent nécessaires au fur et à mesure que Supabase, Resend et n8n sont branchés.

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | build de production |
| `npm run test` | Vitest en mode watch |
| `npm run test:run` | Vitest en une passe (CI) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Architecture

Découpage en couches, dépendances orientées vers l'intérieur : `app` → `application` → `domain`.
Le domaine ignore Supabase, React, le réseau et l'horloge système.

```
src/
  domain/          TypeScript pur, zéro I/O — règles métier, entièrement testées
  application/     cas d'usage + ports (repositories, mailer, calendar, storage, clock)
  infrastructure/  implémentations des ports (supabase/, resend/, calendar/, storage/)
  app/             routes Next.js (App Router)
  components/      composants React ; ui/ contient les primitives
  lib/             utilitaires transverses
supabase/migrations/   schéma SQL versionné + policies RLS
supabase/seed/         jeu de données de démonstration
workflows/             exports JSON des workflows n8n
```

Trois règles sont outillées plutôt que documentées : la configuration ESLint interdit à
`src/domain/` d'importer React, Next, Supabase ou une couche extérieure, lui interdit `Date` et
`fetch` (l'horloge passe par un port injecté), et interdit à `src/application/` d'importer une
implémentation d'infrastructure.

## Choix techniques

- **Multi-sociétés par la donnée.** Aucune branche conditionnelle par société dans le code : logo,
  palette, règles, documents et jours fériés sont des données résolues à l'exécution. Le branding
  s'applique via des variables CSS (`--brand-*`) définies dans `src/app/globals.css` avec des
  valeurs de repli, remplacées par l'enregistrement de la société. Ajouter une filiale est une
  insertion en base, pas un déploiement.
- **Autorisation par la base.** La Row Level Security Supabase est la source de vérité : chaque
  table métier portera `company_id` et une policy qui la scope, dans la même migration que la table.
- **Tests sans mock.** Le domaine est composé de fonctions pures avec horloge injectée ; Vitest est
  découpé en deux projets (`domain` en environnement Node, `ui` en jsdom).
- **Accessibilité.** WCAG AA visé : navigation clavier, lien d'évitement, focus visible, et jamais
  la couleur seule pour porter une information.

## Jeu de démonstration

`npm run db:reset` rejoue les migrations puis `supabase/seed/seed.sql` : deux sociétés dissemblables
(palette, semaine de travail, sites, fériés), un template de parcours avec ses dépendances, et quatre
parcours à des stades différents — à venir, en cours, bloqué (compte IT jamais créé, en retard) et
terminé — dont une tâche mutualisée entre deux arrivées. Les dates sont relatives à `current_date` :
la démonstration reste à jour quelle que soit la date à laquelle elle est rejouée.

Un seed SQL ne sait pas compter en jours ouvrés, et recopier ce calcul en SQL dupliquerait une règle
du domaine. `npm run db:reset` enchaîne donc le seed avec `scripts/seed/align-demo-dates.ts`, qui
recalcule arrivées, échéances et questionnaires avec le vrai moteur (week-ends et fériés de chaque
société et de chaque site). `npm run db:check-dates` vérifie qu'aucune date ne s'en écarte.

### Voir les règles métier sans écran

Les règles de T-10 à T-15 (blocages, templates, responsables, relances, satisfaction, matériel) ne
sont pas encore affichées par l'interface. `npm run demo:report` les rend visibles : il lit le jeu de
démonstration et fait tourner le vrai moteur du domaine, sans rien écrire en base.

```bash
npm run db:reset      # base propre, dates alignées
npm run demo:report   # rapport lisible, ticket par ticket
```

Pour parcourir les tables elles-mêmes, Supabase Studio est disponible sur `http://127.0.0.1:54323`
tant que la stack locale tourne.

Comptes de démonstration (mot de passe commun `OnboardingDemo!2026`) :

| Rôle | Email | Société | Parcours rattaché |
| --- | --- | --- | --- |
| RH | `rh@atelier-nord.demo` | Atelier Nord | — (voit tous ceux de sa société) |
| Manager | `manager@atelier-nord.demo` | Atelier Nord | — (voit ceux de ses rattachés) |
| IT | `it@atelier-nord.demo` | Atelier Nord | — (voit les tâches de son rôle) |
| Employé | `alice@atelier-nord.demo` | Atelier Nord | son intégration, en cours |
| Employé | `claire@atelier-nord.demo` | Atelier Nord | son intégration, à venir |
| Manager **et** employé | `nadia@groupe.demo` | Atelier Nord (manager) et Méridien Gulf (employé) | — |

Le dernier compte démontre la bascule de société : même personne, rôle et marque différents selon la
société active.

## Automatisations (n8n)

### Lancer n8n en local

Prérequis : Docker Desktop démarré, l'application lancée sur le port 3000 avec un
`N8N_WEBHOOK_SECRET` défini.

```bash
N8N_WEBHOOK_SECRET=<même valeur que l'application> npm run n8n:local
```

Le script [scripts/n8n/start-local.sh](scripts/n8n/start-local.sh) démarre une instance n8n propre
(image officielle, `http://localhost:5678`), importe les trois workflows et le crédentiel d'en-tête
(généré dans un dossier temporaire, jamais écrit dans le dépôt), puis publie W1. Au premier accès,
n8n demande de créer un compte propriétaire local.

- **W1** : `POST http://localhost:5678/webhook/w1-embauche-validee`, en-tête `x-webhook-secret`,
  même corps que `/api/hires/validated`.
- **W2 / W3** : ouvrir le workflow dans l'éditeur et cliquer « Test workflow » (déclencheur manuel,
  à côté du déclencheur planifié qui reste non publié en local).

Vérifié avec n8n 2.39.7 : W1 a parcouru ses quatre branches (créé, doublon, échec explicite, email
différé puis alerte RH), W2 a tracé l'escalade de Diego, W3 a clos son parcours. Cette exécution
réelle a révélé trois défauts dans le JSON de W1, corrigés (voir le ticket T-21).

### W1 — Embauche validée (T-21)

**Déclencheur** — un webhook n8n authentifié reçoit l'identifiant de l'embauche validée (société,
site, métier, type de contrat, nom, manager, date d'arrivée, référence externe ATS/HRIS). Aucune
donnée personnelle au-delà du nom, déjà porté par `journeys.employee_name` partout ailleurs dans
l'application.

**Ce qu'il appelle** — `POST /api/hires/validated`
([src/app/api/hires/validated/route.ts](src/app/api/hires/validated/route.ts)), une route fine qui
délègue tout au cas d'usage
[`createJourneyFromValidatedHire`](src/application/use-cases/create-journey-from-validated-hire.ts) :
sélection du template (`selectTemplate`, T-09), instanciation des tâches et calcul des échéances
(`instantiateJourney`, T-11), résolution des responsables (`assignJourneyOwners`, T-12). Le workflow
n8n ne recalcule rien — il appelle, branche sur la réponse, notifie.

**Authentification** — en-tête `x-webhook-secret` comparé en temps constant
(`crypto.timingSafeEqual`) à `N8N_WEBHOOK_SECRET` ; absent ou invalide → `401` avant tout accès à la
base.

**Idempotence** — chaque embauche porte une `hireReference` externe, contrainte unique en base
(`journeys(company_id, hire_reference)`, migration
`20260916110000_journeys_hire_reference.sql`). Une même référence reçue deux fois renvoie le parcours
déjà créé (`200`, `status: "duplicate"`) au lieu d'en produire un second.

**Échecs explicites** — aucun template correspondant (`no_match`) ou plusieurs à égalité
(`ambiguous_match`) renvoient un `422` avec la raison, jamais un parcours vide. Le workflow branche ce
cas vers une alerte RH.

**Ce qu'il envoie** — la création du parcours écrit dans `audit_events` l'intention de notifier
chaque responsable assigné (`journey.owner_notification_pending`, en attente d'un déclencheur réel —
T-22/flux d'attribution), la création des événements d'agenda (`journey.calendar_events_pending`, en
attente de T-25). **L'email de bienvenue, lui, est réellement envoyé (T-24)** : une branche parallèle
du workflow attend la date calculée par `resolveWelcomeEmailSendDate`
(`journey.welcome_email_pending` porte cette date, `sendWelcomeEmailAt`, dans sa charge utile), puis
appelle `POST /api/notifications/welcome-email`
([src/app/api/notifications/welcome-email/route.ts](src/app/api/notifications/welcome-email/route.ts))
qui délègue au cas d'usage
[`sendWelcomeEmail`](src/application/use-cases/send-welcome-email.ts) : résolution du canal (email
personnel → professionnel → manager, tracée dans `audit_events` quel que soit le canal retenu),
rendu du gabarit français (HTML + texte brut, marque de la société), envoi via Resend, trace de
succès ou d'échec. Idempotent : un parcours déjà notifié (`journeys.welcome_email_sent_at`) ne
reçoit jamais un second envoi, même si le webhook est rejoué.

**Variables d'environnement** — `SUPABASE_SERVICE_ROLE_KEY` (la route agit sans session utilisateur,
donc sans RLS ; l'autorisation vient du secret webhook), `N8N_WEBHOOK_SECRET`, `N8N_WEBHOOK_URL`
(déclenché côté n8n, documenté pour mémoire), `RESEND_API_KEY`, `RESEND_FROM`, `NEXT_PUBLIC_APP_URL`
(lien du portail dans l'email).

**Export** — [workflows/w1-validated-hire.json](workflows/w1-validated-hire.json). Importé et
exécuté dans une vraie instance n8n (voir « Lancer n8n en local ») ; détail dans
[docs/tickets/T-21-w1-embauche-validee.md](docs/tickets/T-21-w1-embauche-validee.md) et T-24.

### W2 — Retard critique (T-22)

**Déclencheur** — un déclencheur planifié n8n, une fois par jour ouvré (cron
`0 7 * * 1-5`, lundi à vendredi 7h). Le jour férié d'une société précise n'est pas géré par le cron :
l'application elle-même refuse le passage pour cette société ce jour-là (`skipped: true`,
`skippedReason: "non_working_day"`).

**Ce qu'il appelle** — `POST /api/escalation/run`
([src/app/api/escalation/run/route.ts](src/app/api/escalation/run/route.ts)), qui délègue au cas
d'usage [`runCriticalDelayScan`](src/application/use-cases/run-critical-delay-scan.ts) : charge la
politique d'escalade de la société (`escalation_levels`, T-13), sélectionne les tâches en retard
actionnables (`selectEscalationCandidates` — une tâche bloquée n'est jamais candidate, seule sa cause
racine l'est), décide qui prévenir et à quel niveau (`decideEscalation`, garde anti-doublon incluse).
`today` vient de l'horloge système au moment de l'appel (port `Clock`), jamais d'un champ du payload.
Corps attendu : `{ companyId?: string, dryRun?: boolean }` — sans `companyId`, le passage tourne pour
toutes les sociétés (c'est ce qu'appelle le déclencheur planifié unique).

**Authentification** — même secret partagé que W1 et T-24 (`x-webhook-secret`, comparaison en temps
constant), désormais factorisée dans
[src/app/api/_shared/webhook-auth.ts](src/app/api/_shared/webhook-auth.ts).

**Ce qu'il envoie** — le niveau `owner` envoie le gabarit de relance (`renderReminder`, T-24),
adressé directement au propriétaire de la tâche ; les niveaux `manager` et `hr_admin` envoient le
gabarit d'escalade (`renderEscalation`), adressé à la personne effectivement résolue par la politique
(aucun gabarit distinct n'existe pour la RH : le texte ne nomme jamais le rôle, seulement les deux
personnes). Chaque relance envoyée avec succès écrit `task.reminder_sent` dans `audit_events` (c'est
cette trace, pas une table dédiée, qui porte la garde « pas de doublon le même jour ouvré » — T-13).
Un échec d'envoi ou l'absence de canal joignable écrivent `email.delivery_failed` /
`email.no_channel_available`, sans jamais marquer la relance comme faite.

**Exécution à blanc** — `dryRun: true` calcule tout (qui, à quel niveau, pourquoi) sans rien envoyer
ni rien tracer ; chaque décision positive rapporte la tâche, le destinataire et le retard en jours
ouvrés.

**Variables d'environnement** — les mêmes que W1/T-24 : `SUPABASE_SERVICE_ROLE_KEY`,
`N8N_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `NEXT_PUBLIC_APP_URL`, `ONBOARDING_APP_URL`.

**Export** — [workflows/w2-critical-delay.json](workflows/w2-critical-delay.json). Importé et
exécuté dans une vraie instance n8n via son déclencheur manuel — voir
[docs/tickets/T-22-w2-retard-critique.md](docs/tickets/T-22-w2-retard-critique.md).

### W3 — Bilan J+30 (T-23)

**Déclencheur** — un déclencheur planifié n8n, une fois par jour ouvré (cron `0 8 * * 1-5`, après W2).

**Ce qu'il appelle** — `POST /api/surveys/run`
([src/app/api/surveys/run/route.ts](src/app/api/surveys/run/route.ts)), qui délègue au cas d'usage
[`runDay30ReviewScan`](src/application/use-cases/run-day-30-review-scan.ts) : pour chaque parcours
actif, recale les jalons `day_7`/`day_30` avec `planSurveys` (T-14, jamais réécrit — un parcours
reporté recale une ligne encore `scheduled`, jamais une déjà `sent`/`answered`), envoie les
questionnaires échus (`resolveSurveyChannel` : adresse professionnelle, puis personnelle, puis lien
portail — jamais d'abandon silencieux), relance une fois à J+3 jours ouvrés sans réponse, puis clôt
(`completed`) le parcours dont le J+30 a atteint un état terminal (répondu, annulé pour fin de contrat,
ou relancé depuis 5 jours ouvrés sans réponse). Corps attendu : `{ companyId?: string, dryRun?: boolean }`.

**Authentification** — même secret partagé que W1/W2/T-24.

**Lien signé et limité dans le temps** — le lien du questionnaire porte un jeton HMAC-SHA256
(`SURVEY_LINK_SECRET`, TTL 30 jours), généré à partir de la date du jour de la société (jamais une
horloge lue directement — voir [src/application/security/survey-access-token.ts](src/application/security/survey-access-token.ts)),
vérifiable côté serveur sans état, et rejeté s'il est expiré ou altéré.

**Variables d'environnement** — celles de W1/W2/T-24, plus `SURVEY_LINK_SECRET`.

**Export** — [workflows/w3-day-30-review.json](workflows/w3-day-30-review.json). Importé et exécuté
dans une vraie instance n8n via son déclencheur manuel — voir
[docs/tickets/T-23-w3-revue-j30.md](docs/tickets/T-23-w3-revue-j30.md). **Dette produit non couverte
par ce ticket** : aucune page employé ne consomme encore ce lien signé (le questionnaire n'a pas
d'écran de réponse dans `src/app/` à ce jour) — le mécanisme du lien est réel et testé, sa destination
ne l'est pas encore.

### Emails transactionnels — Resend (T-24)

Port `Mailer` ([src/application/ports/mailer.ts](src/application/ports/mailer.ts)) et implémentation
Resend ([src/infrastructure/resend/mailer.ts](src/infrastructure/resend/mailer.ts)) : le domaine et
les cas d'usage ne connaissent que l'interface, ce qui rend l'envoi testable sans clé d'API réelle.
Cinq gabarits français dans `src/infrastructure/resend/templates/` (bienvenue, tâche assignée,
relance, escalade, questionnaire), tous construits et testés HTML + texte brut, personnalisés par la
marque de la société (logo si présent, sinon le nom en texte — les deux sociétés de démonstration
n'ont pas de logo). Bienvenue (W1), relance et escalade (W2) et questionnaire (W3) sont désormais branchés à un
déclencheur réel ; seul le gabarit de tâche assignée attend encore le sien (flux d'attribution des
tâches, hors périmètre de T-23).

Aucune pièce jointe, aucun lien signé à durée illimitée : les emails pointent vers le portail
(authentification Supabase déjà en place) plutôt que de contourner la connexion. Un employé sans
email personnel bascule vers l'adresse professionnelle puis vers le manager, sans échec silencieux —
le canal effectivement utilisé est toujours tracé dans `audit_events`. Un échec ou un rejet Resend
laisse la tâche ouverte et écrit `email.delivery_failed` avec le canal et la raison.

Détail complet, preuves d'exécution réelle et dette restante :
[docs/tickets/T-24-emails-resend.md](docs/tickets/T-24-emails-resend.md).

### Agenda de la première semaine — Google Calendar (T-25)

Port `Calendar` ([src/application/ports/calendar.ts](src/application/ports/calendar.ts)) et
implémentation Google Calendar REST
([src/infrastructure/calendar/google-calendar.ts](src/infrastructure/calendar/google-calendar.ts)) :
client HTTP injecté (même principe que `ResendLikeClient`), testable sans jeton réel. Les évènements
créés sont persistés localement dans `calendar_events` — c'est cette table, jamais un appel direct à
Google, que le portail employé lit pour afficher l'agenda : une panne du fournisseur agenda ne rend
jamais le portail inutilisable, et une tâche sans évènement retombe sur la liste simple déjà construite
en T-17.

La création (synchrone, au moment où W1 crée le parcours) comme le report de date
(`POST /api/journeys/reschedule`, même authentification par secret partagé que les autres webhooks)
ne dupliquent jamais un évènement : `calendar_events` porte une contrainte unique par tâche, et un
report déplace (`PATCH`) la ligne existante plutôt que d'en créer une nouvelle. Ce report comble aussi
un vrai manque produit trouvé en construisant ce ticket : rien ne pouvait auparavant changer
`journeys.arrival_date` ni recalculer les échéances déjà instanciées — voir
[docs/tickets/T-25-agenda-premiere-semaine.md](docs/tickets/T-25-agenda-premiere-semaine.md) pour le
détail, y compris un défaut corrigé dans le même mouvement (le décalage en jours ouvrés de chaque
tâche n'était jamais écrit en base, ce qui aurait fait atterrir toutes les tâches recalculées sur la
même date).

Le fuseau horaire d'un évènement est celui du site s'il en déclare un, sinon celui de la société
(`domain/companies/time-zone-resolution.ts`) — une filiale ou un site en horaire décalé n'est jamais
un cas particulier codé en dur. Titre et description restent le texte déjà générique de la tâche
(« Créer le compte IT »), jamais un nom, une adresse ou une référence de document. Un responsable sans
compte agenda d'entreprise ne bloque pas l'évènement : il se crée sans participant nommé plutôt que
d'échouer pour toute l'équipe.

### Synthèse IA anonymisée de la satisfaction (T-26)

Anonymisation déterministe, pure, testée exhaustivement sans mock —
[src/domain/privacy/anonymize-comment.ts](src/domain/privacy/anonymize-comment.ts) : redige tout
nom connu (roster fourni par l'application, jamais lu par le domaine), toute adresse email (motif
générique, connue ou non), tout nom de site/société, et — garde-fou pour un nom propre absent du
roster — toute séquence d'au moins deux mots à majuscule initiale consécutifs. Les limites connues de
cette dernière heuristique (faux positifs sur des expressions à deux mots capitalisés, faux négatifs
sur un nom isolé d'un seul mot hors roster) sont documentées en tête du fichier et dans
[docs/tickets/T-26-synthese-ia-anonymisee.md](docs/tickets/T-26-synthese-ia-anonymisee.md).

Port `SatisfactionSummarizer` ([src/application/ports/satisfaction-summarizer.ts](src/application/ports/satisfaction-summarizer.ts))
et implémentation Anthropic Messages API
([src/infrastructure/anthropic/satisfaction-summarizer.ts](src/infrastructure/anthropic/satisfaction-summarizer.ts)),
même discipline que `Mailer`/`Calendar` : client HTTP injecté, résultat typé succès/échec, jamais
d'exception à deviner. Le cas d'usage
[`generateSatisfactionSummaries`](src/application/use-cases/generate-satisfaction-summaries.ts)
applique le seuil `survey_settings.minimum_respondents` (même colonne que l'agrégation T-14, aucun
second seuil inventé) **avant** tout appel IA — en dessous, aucune tentative n'a lieu — puis anonymise
chaque commentaire et n'envoie jamais de texte brut au modèle.

Le résultat est mis en cache dans `ai_satisfaction_summaries` (RLS RH uniquement) par une route dédiée
`POST /api/satisfaction/summarize`, déclenchée par n8n sur son propre planning (alignée sur le passage
J+30 qui fait accumuler de nouvelles réponses) — jamais par la lecture du cockpit, qui reste rapide et
utilisable même si le fournisseur IA est en panne ou mal configuré. Le cockpit affiche la synthèse avec
une mention explicite « Synthèse générée automatiquement » et le nombre de répondants, jamais comme un
fait individuel, avec le même repli « pas assez de réponses » que la moyenne par site déjà en place.

**Fournisseur gratuit par défaut : Ollama.** Un modèle ouvert (`qwen2.5:3b`) tourne sur la machine,
sans compte ni clé, et les commentaires ne quittent jamais l'infrastructure. Anthropic reste
disponible avec une clé. Le choix se fait par variables d'environnement (voir `.env.example`) :
`AI_SUMMARY_PROVIDER` (`ollama` ou `anthropic`), `OLLAMA_BASE_URL`, `OLLAMA_MODEL`,
`ANTHROPIC_API_KEY`. Sans fournisseur joignable, la synthèse échoue proprement sans rien bloquer.

```bash
docker run -d --name onboarding-ollama -p 11434:11434 -v onboarding-ollama-models:/root/.ollama ollama/ollama
docker exec onboarding-ollama ollama pull qwen2.5:3b
```

W3 appelle la synthèse juste après le bilan J+30. Vérifié en local : W3 lancé depuis n8n, deux
synthèses générées en 32 secondes (site de Lille et société entière, 5 répondants chacune), aucun des
noms ni de l'email présents dans les commentaires de démonstration (« Marc Manceau », « Kevin
Dupont », une adresse personnelle) ne figure dans le texte produit.

Le seuil compte des **personnes**, pas des commentaires : les réponses J+7 et J+30 d'une même
personne ne comptent qu'une fois. Détail complet, preuves de vérification réelle
(payload exact envoyé au modèle, verbatim de test avec nom hors roster) et dette restante :
[docs/tickets/T-26-synthese-ia-anonymisee.md](docs/tickets/T-26-synthese-ia-anonymisee.md).

## Limites connues

- **Aucune clé Anthropic réelle disponible dans cet environnement** (T-26) : le chemin de génération
  est vérifié jusqu'à l'appel réseau réel à `api.anthropic.com`, qui répond une erreur d'authentification
  (clé factice) — même limite honnête que Resend et Google Calendar.
- Aucune livraison Resend réelle n'a été vérifiée (pas de clé d'API réelle disponible dans cet
  environnement) : le chemin d'envoi est vérifié de bout en bout jusqu'à l'appel réseau réel à
  Resend, qui répond une erreur d'authentification (clé factice) — voir T-24.
- Tâche assignée : gabarit prêt et testé, pas encore branché à un déclencheur réel (flux
  d'attribution des tâches, hors périmètre actuel). W1, W2 et W3 sont désormais tous branchés.
- **Aucune page employé ne consomme encore le lien signé du questionnaire** (W3, T-23) : le jeton est
  réel, signé et limité dans le temps, mais sa destination (écran de réponse) n'existe pas encore
  dans `src/app/` — un vrai gap produit à couvrir par un futur ticket.
- **Aucun identifiant Google Calendar réel disponible dans cet environnement** (T-25) : le chemin de
  création/déplacement/annulation d'évènement est vérifié jusqu'à l'appel réseau réel à Google, qui
  répond une erreur d'authentification (jeton factice) — même limite honnête que Resend.
- **W3 n'envoie aucune alerte RH sur signal faible** : les signaux sont visibles dans le cockpit,
  sans notification.
- **La moyenne par site compte des réponses, pas des personnes** (`domain/surveys/aggregation`) :
  une même personne répondant à J+7 et J+30 compte deux fois dans le seuil d'anonymat de la moyenne.
  La synthèse IA, elle, compte bien des personnes.
- **Le modèle local (`qwen2.5:3b`) est petit** : ses synthèses restent correctes mais simples, et il
  peut reprendre les marqueurs `[personne]` / `[email]` tels quels. Un modèle plus grand s'installe
  avec `OLLAMA_MODEL`.
- **Les invitations des responsables (W1) ne partent pas par email** : les responsables sont bien
  attribués, l'invitation est seulement tracée (`journey.owner_notification_pending`).
- **Aucun déclencheur produit ne fait encore passer un parcours au statut `cancelled`** : l'annulation
  des évènements d'agenda d'un parcours annulé (T-25) est prête et testée
  (`cancel-journey-calendar-events.ts`) mais n'est reliée à aucun flux réel — rien dans l'application
  n'annule un parcours aujourd'hui.
- Pas encore de déploiement public.

## Écarts d'accessibilité et de cohérence assumés (T-20)

La passe transverse T-20 a revu les quatre écrans ensemble (clavier, noms accessibles, contraste sur
les deux palettes de démonstration, cohérence des composants et des formulations) et corrigé ce
qu'elle a trouvé de réparable sans risque — voir
[docs/tickets/T-20-passe-accessibilite.md](docs/tickets/T-20-passe-accessibilite.md) pour le détail
écran par écran. Ce qui reste, consciemment laissé de côté plutôt que tu, comme l'exige la
définition de terminé du ticket :

- **Le retour (`returned`) et l'annulation (`cancelled`) d'une demande de matériel** sont des
  transitions légales du domaine (`ALLOWED_TRANSITIONS`) mais n'ont aucune action dans l'écran
  matériel — hérité de T-19, hors périmètre métier de T-20 (qui ne touche pas aux fonctionnalités).
- **« Nouvelle demande » de matériel ne permet pas de choisir la tâche à lier** — même chose, hérité
  de T-19, changement de formulaire plutôt que d'accessibilité.
- **La réorganisation des tâches d'un template** suit l'ordre de création, sans glisser-déposer —
  hérité de T-16 ; un glisser-déposer poserait de toute façon sa propre question d'accessibilité
  (équivalent clavier) qu'il faudrait résoudre en même temps, pas en ajouter par-dessus l'existant.
- **Les erreurs Supabase par section (cockpit, matériel)** restent vérifiées en lisant le code plutôt
  qu'en simulant une panne réseau contre l'instance locale — hérité de T-18/T-19, aucun moyen simple
  trouvé de déclencher ce chemin depuis un vrai navigateur sans perturber le reste des vérifications.
- **La restitution de focus de Next.js après un `redirect()` de Server Action vers la même URL**
  (matériel : commander, remettre, reprendre ; créateur de parcours : enregistrer, dupliquer,
  supprimer) n'a pas été vérifiée indépendamment du reste de l'application — elle s'appuie sur le
  gestionnaire de route intégré à l'App Router. Les changements qui ne naviguent réellement jamais
  (attribution de matériel, dépôt de document, accusé de réception, et désormais les transitions de
  matériel via le paramètre `succes` lu en `role="status"`) sont, eux, couverts par une région vive
  explicite et vérifiés au clavier par les scripts de `scripts/ui-checks/`.
- **Le moyen de contact du portail reste un nom seul**, sans email ni téléphone — hérité de T-17,
  `profiles` ne porte pas ces champs aujourd'hui.
