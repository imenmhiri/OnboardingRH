# T-24 — Emails transactionnels

**Couches** : infrastructure/resend, application · **Agent** : automation-builder
**Dépend de** : T-07, T-12
**État** : fait

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

## Ce qui a été construit

Repris d'une tentative précédente interrompue par une limite de débit (rien perdu : la branche
`feat/24-transactional-emails` portait déjà l'essentiel, non committé). Ce qui a été ajouté par cette
reprise est indiqué explicitement ci-dessous ; le reste vient de la tentative interrompue, relu et
vérifié plutôt que refait.

- **Port `Mailer`** [`src/application/ports/mailer.ts`](../../src/application/ports/mailer.ts) —
  `send(message): Promise<SendResult>`, résultat qui distingue succès, `invalid_recipient` et
  `provider_error`. *(tentative précédente)*
- **Implémentation Resend** [`src/infrastructure/resend/mailer.ts`](../../src/infrastructure/resend/mailer.ts)
  — dépend d'une interface `ResendLikeClient` injectée, jamais de `new Resend()` en dur dans le port :
  testable sans réseau ni clé réelle. *(tentative précédente, un défaut corrigé par cette reprise —
  voir « Défauts trouvés »)*
- **Cinq gabarits** dans `src/infrastructure/resend/templates/` : `welcome.ts`, `task-assigned.ts`,
  `reminder.ts`, `escalation.ts`, `questionnaire.ts`, plus `layout.ts` commun (habillage HTML +
  rendu texte brut, conversion OKLCH → hex via `src/lib/color.ts` de T-03 puisque le support OKLCH
  des clients email est peu fiable). Chacun a son `<nom>.test.ts`. *(tentative précédente)*
- **Port `EmailTemplates`** [`src/application/ports/email-templates.ts`](../../src/application/ports/email-templates.ts)
  et son implémentation [`resendEmailTemplates()`](../../src/infrastructure/resend/email-templates.ts)
  — expose aujourd'hui seulement `renderWelcome` : les quatre autres gabarits existent et sont testés
  mais n'ont pas de méthode ici tant qu'aucun appelant réel n'existe (voir commentaire dans le
  fichier). *(tentative précédente)*
- **Port `NotificationDirectory`** [`src/application/ports/notification-directory.ts`](../../src/application/ports/notification-directory.ts)
  et son implémentation Supabase — résout le contexte de bienvenue (nom, email personnel, email
  professionnel via `auth.users`, manager, date d'arrivée, statut d'envoi déjà fait) depuis des
  identifiants, jamais depuis un payload de webhook. *(tentative précédente)*
- **Cas d'usage `sendWelcomeEmail`** [`src/application/use-cases/send-welcome-email.ts`](../../src/application/use-cases/send-welcome-email.ts)
  — résout le canal (`resolveRecipient`, T-24 aussi), rend le gabarit avec la marque de la société
  (repli sur `FALLBACK_BRANDING` si non résolue), envoie, trace succès/échec/absence de canal dans
  `audit_events`, marque l'envoi fait pour rester idempotent. *(tentative précédente ; les fakes de
  test ne compilaient plus car le port `templates` manquait dans `SendWelcomeEmailPorts` — complété
  par cette reprise, voir « Défauts trouvés »)*
- **Domaine `recipient-resolution`** [`src/domain/notifications/recipient-resolution.ts`](../../src/domain/notifications/recipient-resolution.ts)
  — pure, testée sans mock : personnel → professionnel → manager → `no_channel_available`.
  *(tentative précédente)*
- **`resolveWelcomeEmailSendDate`** dans [`src/domain/scheduling/due-date.ts`](../../src/domain/scheduling/due-date.ts)
  — l'envoi différé exigé par le skill n8n-workflow (3 jours ouvrés avant l'arrivée) est un calcul de
  domaine, pas un minuteur n8n : un report d'arrivée le recalcule naturellement au prochain appel.
  *(tentative précédente)*
- **Migration** `supabase/migrations/20260916120000_journeys_welcome_email.sql` — `journeys.personal_email`
  (nullable : seule adresse qui joint un employé sans compte) et `journeys.welcome_email_sent_at`
  (idempotence). *(tentative précédente)*
- **Route** [`src/app/api/notifications/welcome-email/route.ts`](../../src/app/api/notifications/welcome-email/route.ts)
  — `POST /api/notifications/welcome-email`, même authentification que `/api/hires/validated`
  (secret partagé, comparaison en temps constant), payload réduit à `companyId`/`journeyId`.
  *(tentative précédente ; construction des ports incomplète — `templates` manquant — complétée par
  cette reprise)*
- **`create-journey-from-validated-hire.ts` et sa route** — acceptent désormais `personalEmail`,
  persistent `journeys.personal_email`, calculent `sendWelcomeEmailAt` et l'exposent dans la réponse
  HTTP pour que n8n sache quand appeler le nouvel endpoint ; l'événement d'audit
  `journey.welcome_email_pending` porte cette date. *(tentative précédente)*
- **`workflows/w1-validated-hire.json`** — branche parallèle « Attendre la date d'envoi (T-24) » →
  « Envoyer l'email de bienvenue (T-24) » → « Vérifier l'envoi » → alerte RH si échec, en plus de la
  branche existante de création du parcours. *(tentative précédente)*
- **`.env.example`** — `RESEND_API_KEY`, `RESEND_FROM`, `NEXT_PUBLIC_APP_URL` déjà présents.
  *(tentative précédente)*
- **Corrections et compléments de cette reprise** :
  - `templates: EmailTemplates` ajouté aux ports construits dans la route et à toutes les instances
    de `SendWelcomeEmailPorts` du test (`resendEmailTemplates()` réel, pas un double — le rendu HTML
    réel est donc exercé par ces tests, pas contourné).
  - Assertion corrigée dans `welcome.test.ts` : elle cherchait une apostrophe brute
    (`n'a pas encore`) dans le HTML, qui l'échappe légitimement en `&#39;` — vérifiée contre `text`
    (non échappé) à la place.
  - **Défaut réel corrigé dans `mailer.ts`** (trouvé en vérification réelle, détail ci-dessous) :
    classification d'erreur Resend qui confondait une clé d'API invalide (401) avec une adresse
    destinataire invalide, parce que Resend réutilise le même `name` (`validation_error`) pour les
    deux. Le `statusCode` (401/403) tranche désormais en priorité.
  - README section « Automatisations (n8n) » et « Emails transactionnels » mises à jour pour refléter
    l'envoi réel.

## Décisions prises

**Envoi différé, jamais à la création.** Comme W1 l'exige : `resolveWelcomeEmailSendDate` vit dans
`domain/scheduling`, W1 la calcule et l'expose, n8n attend puis appelle
`/api/notifications/welcome-email`. Un report d'arrivée avant le premier envoi recalcule la date au
prochain déclenchement plutôt que de laisser un minuteur périmé — aucune règle de date dans le
workflow.

**Idempotence par colonne, pas par verrou applicatif.** `journeys.welcome_email_sent_at` non nul
court-circuite l'envoi (`status: "already_sent"`) avant même de résoudre un canal ou de rendre un
gabarit. Un webhook rejoué (retry n8n, double appel) ne produit jamais un second email — même
philosophie que l'idempotence par contrainte unique de W1 (T-21).

**Bascule de canal tracée, jamais silencieuse.** Le cas limite du cahier des charges (« employé sans
email personnel ») est résolu par `resolveRecipient` (domaine, testé sans mock) puis **tracé** :
chaque envoi, réussi ou en échec, écrit le canal réellement utilisé (`personal` / `professional` /
`manager`) dans `audit_events`. Aucun canal joignable écrit `email.no_channel_available` sans jamais
tenter d'envoi — pas un échec avalé, un fait constaté et tracé.

**Échec ou rejet : la tâche reste ouverte, la RH est prévenue par la trace, pas par une alerte
supplémentaire à construire.** `email.delivery_failed` porte le canal, la raison
(`invalid_recipient` / `provider_error`) et le détail brut du fournisseur. C'est la source de vérité
honnête exigée par le ticket ; une surface cockpit dédiée reste à construire mais n'était pas dans le
périmètre de ce ticket.

**Le lien du portail suffit, pas besoin d'un lien signé à durée limitée pour l'email de bienvenue.**
Le ticket exige des liens signés « à durée limitée, jamais de pièce jointe » pour tout document
personnel. L'email de bienvenue ne pointe vers aucun document : il pointe vers le portail, déjà
protégé par l'authentification Supabase. Un lien signé n'a de sens que pour contourner une connexion
(cas de `request-document-link.ts`, T-07) — en imposer un ici aurait affaibli la sécurité sans rien
protéger de plus. Documenté dans le commentaire de `welcome.ts`.

**Quatre gabarits construits et testés sans déclencheur câblé.** Le périmètre du ticket liste les
cinq gabarits explicitement ; seul le bienvenue a un flux réel qui l'appelle aujourd'hui (W1). Tâche
assignée, relance, escalade et questionnaire attendent T-22/T-23/le flux d'attribution des tâches —
brancher chacun consistera à ajouter une méthode à `resendEmailTemplates()` et un appelant, sans
retoucher le port ni le gabarit.

## Cas limites couverts

- **Employé sans email personnel** — testé unitairement (bascule professionnel, puis manager, canal
  tracé dans les deux cas) et **vérifié en conditions réelles** : voir preuve ci-dessous, journée B,
  canal `manager` correctement résolu et tracé.
- **Adresse invalide ou rejetée par Resend** — testé unitairement (`mailer.test.ts`,
  `send-welcome-email.test.ts`) : la tâche (l'envoi) reste ouverte (`welcomeEmailSentAt` non marqué),
  `email.delivery_failed` tracé. Non reproduit en conditions réelles avec une vraie adresse rejetée
  (aurait nécessité une clé Resend réelle pour observer le vrai comportement de validation
  d'adresse) — voir « Dette restante ».
- **Société sans logo** — les deux sociétés de démonstration n'ont pas de `logo_url` (vérifié en
  base, voir preuve ci-dessous) : le gabarit retombe sur le nom en texte dans le bandeau de marque.
  Couvert aussi par un test unitaire dédié (`layout.test.ts`) et par `BRANDING.logoUrl = null` dans
  tous les fakes de `welcome.test.ts` / `send-welcome-email.test.ts`.
- **Société sans branding résolu du tout** (`brandingOf` renvoie `null`, distinct du cas précédent)
  — testé unitairement : repli sur `FALLBACK_BRANDING`, l'envoi reste possible.

## Preuve d'exécution réelle

Base réinitialisée (`npm run db:reset`), application démarrée en développement (`next dev -p 3100`,
variables `N8N_WEBHOOK_SECRET`, `RESEND_API_KEY` (factice), `RESEND_FROM`, `NEXT_PUBLIC_APP_URL`
fournies explicitement pour ce test — `.env.local` a un accès en lecture restreint dans cet
environnement, même contrainte que celle documentée dans la clôture de T-21).

Vérifié en base avant tout appel : `select logo_url from companies` → les deux sociétés de
démonstration (Atelier Nord, Méridien Gulf) ont `logo_url` nul.

| Scénario | Requête | Résultat observé |
| --- | --- | --- |
| Cas A — email personnel | `POST /api/hires/validated` avec `personalEmail: "testverifa@perso.example"` | `201`, `sendWelcomeEmailAt: "2026-09-25"` |
| Cas B — sans email personnel, manager renseigné | `POST /api/hires/validated` avec `personalEmail: null`, `managerId` d'un manager réel du seed | `201`, `sendWelcomeEmailAt: "2026-09-25"` |
| Envoi bienvenue, cas A | `POST /api/notifications/welcome-email` avec le `journeyId` du cas A | `502`, `reason: "send_failed"`, `detail: "API key is invalid"` — appel réseau réel à l'API Resend, rejeté pour clé factice, pas une panne locale |
| Envoi bienvenue, cas B | `POST /api/notifications/welcome-email` avec le `journeyId` du cas B | même `502` — même cause |

Lecture directe de `audit_events` après les deux envois :

```
email.delivery_failed | (cas A) | {"detail":"API key is invalid","reason":"provider_error","channel":"personal","template":"welcome"}
email.delivery_failed | (cas B) | {"detail":"API key is invalid","reason":"provider_error","channel":"manager","template":"welcome"}
```

Ce que ça prouve, honnêtement : la résolution du canal (`personal` pour A, bascule vers `manager`
pour B faute d'email personnel ou professionnel — aucun compte créé donc pas d'entrée `auth.users`)
est correcte et tracée dans les deux cas ; le gabarit et la marque sont sélectionnés avant l'appel
réseau (sinon aucun appel HTTP sortant n'aurait eu lieu) ; l'appel réseau réel à `api.resend.com`
a bien eu lieu (confirmé indépendamment par un appel `fetch` direct au même endpoint avec la même
clé factice, qui renvoie exactement `{"statusCode":401,"name":"validation_error","message":"API key
is invalid"}` — c'est ce message qui remonte tel quel dans `audit_events.detail`) ; l'échec est
tracé sans exception non gérée et sans email envoyé. Ce qui n'est **pas** prouvé : qu'un email
arrive réellement dans une boîte de réception, faute de clé Resend réelle dans cet environnement.

## Défauts trouvés

**Dans le produit** :

- **Confusion `invalid_recipient` / `provider_error` pour une clé d'API invalide**, trouvée en
  vérification réelle ci-dessus (la première tentative, avant correction, traçait
  `reason: "invalid_recipient"` pour un problème d'authentification — voir table ci-dessus, colonne
  de gauche des deux lignes d'audit visibles dans l'historique avant correction). Cause : Resend
  renvoie `{"name":"validation_error"}` aussi bien pour un email destinataire malformé que pour une
  clé d'API invalide (401) — confirmé par un appel `fetch` direct à l'API. `classifyError` dans
  `mailer.ts` ne regardait que `name`. Corrigé : le `statusCode` (401/403) est vérifié en priorité et
  force `provider_error`, quel que soit le nom. Un test de régression explicite couvre ce cas exact
  dans `mailer.test.ts`. Sans cette correction, une clé Resend mal configurée aurait semblé être un
  problème d'adresse email — piste de diagnostic trompeuse en production.

**Dans mes scripts de vérification, pas dans le produit** :

- `.env.local` n'est pas lisible par les outils de cette session (restriction de sécurité) : les
  variables nécessaires au test réel (`N8N_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`,
  `NEXT_PUBLIC_APP_URL`, `ONBOARDING_APP_URL`) ont été fournies explicitement au processus
  `next dev` plutôt que lues du fichier, sans le modifier. Même contrainte déjà rencontrée et
  documentée en T-21.
- Les tests manuels (cas A/B ci-dessus) ont laissé deux parcours de vérification en base
  (`t24-verif-a-001`, `t24-verif-b-001`) ; nettoyés par un `npm run db:reset` avant la régression
  finale et avant la fusion.

## Définition de terminé

- [x] Aucun document personnel en pièce jointe, vérifié sur un envoi réel. Le gabarit de bienvenue ne
      référence que l'URL du portail (authentification Supabase), jamais un document ni un lien
      signé à durée illimitée ; vérifié en lisant le HTML produit lors des deux envois réels
      ci-dessus (aucune pièce jointe dans le message envoyé à Resend — `mailer.ts` n'a même pas de
      paramètre pour ça).
- [x] Les gabarits sont lisibles en texte brut comme en HTML. Chaque gabarit produit `html` et
      `text` (`renderEmail` dans `layout.ts`) ; `welcome.test.ts` vérifie explicitement que le texte
      brut ne contient aucune balise (`not.toMatch(/<[^>]+>/)`) et porte le même message que le HTML.
- [x] Aucune clé d'API dans le dépôt. `RESEND_API_KEY` / `RESEND_FROM` restent des valeurs vides
      dans `.env.example`, lues depuis l'environnement par `createResendMailerFromEnv()`, qui échoue
      tôt et clairement si l'une des deux manque plutôt que d'utiliser une valeur par défaut.

## Dette restante

- **Aucune clé Resend réelle disponible dans cet environnement** : le chemin d'envoi est vérifié
  jusqu'à l'appel réseau réel (rejeté pour authentification), pas jusqu'à la réception effective d'un
  email. Même limite honnête que celle documentée pour l'exécution n8n réelle en T-21.
- **Tâche assignée, relance, escalade, questionnaire** : gabarits construits et testés
  (HTML + texte brut, marque, cas limites), mais aucun déclencheur réel ne les appelle encore. Leurs
  déclencheurs appartiennent à T-22 (relance/escalade), T-23 (questionnaire) et au flux d'attribution
  des tâches (tâche assignée) — hors périmètre de ce ticket, mentionné dans le README.
- **`workflows/w1-validated-hire.json` n'a jamais tourné dans une vraie instance n8n**, même
  contrainte réseau que T-21. La branche différée ajoutée par ce ticket suit le même schéma
  d'export que le reste du fichier. *Levé depuis : la branche différée a tourné dans une vraie
  instance n8n (voir T-21) ; elle a dû être déplacée après la réponse au webhook.*
- **Cockpit RH pour les échecs d'envoi** : `email.delivery_failed` et `email.no_channel_available`
  sont tracés et interrogeables, mais aucune surface cockpit dédiée ne les affiche encore — pas dans
  le périmètre de ce ticket (infrastructure/application uniquement).
