# T-26 — Synthèse IA anonymisée

**Couches** : application, infrastructure · **Agent** : automation-builder · **Dépend de** : T-14
**État** : fait

## Pourquoi

Les verbatims de satisfaction ne se lisent pas un par un. Une synthèse par société et par site aide
la RH à voir les tendances — à condition de ne jamais ré-identifier quelqu'un.

## Périmètre

- Anonymisation avant appel : suppression des noms, emails, identifiants, mentions d'équipe.
- Synthèse des verbatims par société et par site : thèmes récurrents, points de friction.
- Seuil minimal de réponses en dessous duquel aucune synthèse n'est produite.
- Affichage dans le cockpit, avec mention explicite du caractère généré.

## Hors périmètre

- Notation automatique des managers, prédiction de départ.

## Ce qui a été construit

- **Anonymisation pure et déterministe**
  [`src/domain/privacy/anonymize-comment.ts`](../../src/domain/privacy/anonymize-comment.ts) —
  zéro I/O, testée sans mock (15 tests dans
  [`anonymize-comment.test.ts`](../../src/domain/privacy/anonymize-comment.test.ts)). Prend un
  commentaire brut et un `KnownIdentifiers` (noms, emails, libellés d'équipe/site/société) fourni par
  la couche application, et rédige :
  1. toute chaîne au format email (motif générique, connue ou non du roster) ;
  2. toute occurrence d'un nom connu, en phrase complète (« Alice Arrivante ») puis en composant
     isolé (« Alice » seule) ;
  3. toute mention explicite d'un email connu (redondant avec 1, gardé pour la lisibilité du code) ;
  4. toute mention d'un site ou de la société, en libellé complet (« Siège de Lille ») puis en
     composant à majuscule initiale (« Lille » seule — voir plus bas pourquoi pas tous les mots) ;
  5. en garde-fou, toute séquence d'au moins deux mots consécutifs à majuscule initiale (heuristique
     « Prénom Nom »), qu'ils soient sur le roster ou non.
- **Port `SatisfactionSummarizer`**
  [`src/application/ports/satisfaction-summarizer.ts`](../../src/application/ports/satisfaction-summarizer.ts)
  — `summarize({groupLabel, anonymizedComments}) → SatisfactionSummaryResult`, résultat typé
  `{kind:'generated', narrative}` ou `{kind:'unavailable', reason, detail}` : le succès porte lui-même
  la marque « généré », jamais laissée à la charge de l'écran de s'en souvenir.
- **Implémentation Anthropic**
  [`src/infrastructure/anthropic/satisfaction-summarizer.ts`](../../src/infrastructure/anthropic/satisfaction-summarizer.ts)
  — appelle réellement l'API Messages (`POST https://api.anthropic.com/v1/messages`), client `fetch`
  injecté (`FetchLike`, même principe que `google-calendar.ts` en T-25) pour rester testable sans
  réseau ni clé réelle (6 tests). Prompt système qui interdit explicitement de citer un verbatim mot
  pour mot, de reconstituer une identité à partir du contexte, ou de présenter la réponse comme un
  fait sur un individu. `createAnthropicSummarizerFromEnv()` renvoie, en l'absence de
  `ANTHROPIC_API_KEY`, un résumeur dégradé qui échoue proprement (`provider_error`) à chaque appel,
  même principe que `createUnconfiguredCalendar` (T-25).
- **Ports d'assemblage** :
  [`RosterDirectory`](../../src/application/ports/roster-directory.ts) — fournit au cas d'usage la
  liste des identifiants réels d'une société (le domaine ne touche jamais la base) — et
  [`SatisfactionSummaryRepository`](../../src/application/ports/satisfaction-summary-repository.ts)
  — persiste/relit le cache.
- **Cas d'usage**
  [`generate-satisfaction-summaries.ts`](../../src/application/use-cases/generate-satisfaction-summaries.ts)
  (5 tests) — pour une société, regroupe les commentaires par site plus un groupe « société entière »,
  applique le seuil `minimum_respondents` **avant tout appel** (en dessous, aucune tentative, jamais un
  résultat partiel), anonymise chaque commentaire du groupe retenu, appelle le port `summarizer`, et
  n'écrit dans le cache que sur un résultat `generated` — un échec IA ne laisse jamais de ligne
  périmée à moitié écrite.
- **Migration** `supabase/migrations/20260916160000_ai_satisfaction_summaries.sql` — table
  `ai_satisfaction_summaries` (`company_id`, `group_key`, `summary_text`, `generated_at`,
  `based_on_respondent_count`), RLS RH uniquement (même périmètre que `survey_responses`/
  `survey_settings`), une ligne par `(company_id, group_key)` (`group_key` = un id de site ou le
  mot-clé fixe `'company'`, jamais un identifiant individuel).
- **Route** [`src/app/api/satisfaction/summarize/route.ts`](../../src/app/api/satisfaction/summarize/route.ts)
  — `POST /api/satisfaction/summarize`, même authentification que les autres webhooks
  (`x-webhook-secret`, `isAuthorizedWebhookRequest` réutilisé). Payload `{companyId?: string}` ; sans,
  tourne pour toutes les sociétés. Rassemble les commentaires `answered` par société/site, lit le seuil
  dans `survey_settings`, appelle le cas d'usage.
- **Isolation RLS** `supabase/tests/ai-satisfaction-summaries-isolation.mjs`, ajoutée à `npm run
  db:verify` : la RH voit la synthèse de sa société, un membre IT de la même société ne la voit pas,
  une autre société ne la voit jamais, seule la RH écrit.
- **Cockpit** — `src/app/(app)/cockpit/satisfaction.tsx` : nouvelle sous-section « Synthèse IA des
  verbatims », visuellement distincte des sections existantes (jamais modifiées), qui lit
  `ai_satisfaction_summaries` en lecture seule. Réutilise exactement le même motif visuel que la
  section « Moyennes par site » déjà en place pour `too_few`/`no_data` (même texte, même style) plutôt
  que d'en inventer un nouveau. Quand un agrégat est disponible mais qu'aucune synthèse n'est en
  cache, affiche un message neutre (« génération à venir ou service indisponible ») — jamais une erreur
  qui casserait l'écran. Le badge « Synthèse générée automatiquement » (`StatusBadge` ton `progress`,
  icône + texte, jamais la couleur seule) accompagne systématiquement le texte généré.
- `.env.example` — `ANTHROPIC_API_KEY`, documentée, sans valeur.

## Décisions prises

**Anonymisation en trois couches, jamais confiée au modèle.** Le DoD l'exige (« avant appel ») : un
modèle à qui on demande de rédiger lui-même n'anonymise pas *avant* l'appel, il anonymise *pendant*,
ce qui n'offre aucune garantie sur ce que l'inférence a « vu » en interne. La rédaction déterministe
(`anonymize-comment.ts`) tourne entièrement côté application, avant que le moindre octet ne parte sur
le réseau — vérifié en base réelle ci-dessous en capturant l'exact payload JSON envoyé.

**Tokenisation différenciée noms vs équipes.** Un nom (« Alice Arrivante ») est découpé en composants
individuels sans filtre supplémentaire : un roster de noms réels ne contient normalement pas de mots
de liaison ambigus. Un libellé d'équipe/site (« Siège de Lille ») ne peut pas être découpé de la même
façon — « de » y est un mot de liaison générique qui apparaîtrait partout dans un texte français et
détruirait le commentaire. Les composants de libellé ne sont donc retenus que s'ils sont eux-mêmes à
majuscule initiale (`Siège`, `Lille`), jamais un mot de liaison en minuscules. Testé explicitement
(`does not redact common short words found inside a multi-word site label`).

**Garde-fou heuristique pour un nom absent du roster, assumé en faux positifs.** Le cas limite du
ticket (« un verbatim contenant un nom propre : il ne sort pas du système ») ne peut pas être couvert
à 100 % par un roster forcément incomplet. La règle retenue — au moins deux mots consécutifs à
majuscule initiale — attrape « Jean Dupont » sans être sur aucun roster, au prix d'un faux positif
documenté sur une expression à deux mots capitalisés (« Bonne Ambiance »). Choix délibéré : un faux
positif dégrade une synthèse (un mot de trop rédigé), un faux négatif expose une personne. Voir la
limite honnête ci-dessous pour ce qu'elle ne couvre **pas**.

**Seuil de respondents réutilisé, jamais dupliqué.** `survey_settings.minimum_respondents` (T-14) est
la seule colonne de seuil dans tout le projet ; `generateSatisfactionSummaries` la lit telle quelle,
exactement comme `aggregateRatings`/`aggregateByGroup`. Aucune seconde constante « seuil IA » n'a été
introduite — c'est explicitement ce que le DoD demande (« le seuil minimal est une donnée, pas une
constante »).

**Génération à part, jamais dans la lecture du cockpit.** Un appel LLM à chaque affichage du cockpit
serait une dépendance de latence et de coût sur un écran qui doit rester rapide même si le fournisseur
IA est en panne. `POST /api/satisfaction/summarize` est une route dédiée, pas un ajout à
`run-day-30-review-scan.ts` : mélanger les deux aurait fait de la génération IA une dépendance du
scan d'envoi/relance des questionnaires, ce que le DoD interdit explicitement pour le cockpit et que ce
ticket refuse d'étendre au scan lui-même. Déclenchée par n8n sur son propre planning, alignée sur le
passage J+30 (T-23) puisque c'est lui qui fait accumuler de nouvelles réponses — mais un processus
séparé, jamais fusionné.

**Anthropic comme fournisseur concret, port swappable.** Le projet utilise déjà Claude Code comme
outillage ; Anthropic est le choix le plus direct pour un premier fournisseur réel. Le port
`SatisfactionSummarizer` ne connaît rien d'Anthropic — un second fournisseur (ou un mock) s'y
substituerait sans toucher au cas d'usage, même discipline que `Mailer` (Resend, T-24) et `Calendar`
(Google, T-25).

**Cache par `(company_id, group_key)`, jamais par verbatim individuel.** Aucune ligne
`ai_satisfaction_summaries` n'est jamais associée à une personne : le grain le plus fin est un site.
C'est aussi ce qui rend une synthèse mise en cache réutilisable sans dépendre de quel commentaire
existait au moment de la génération.

## Cas limites couverts

- **Verbatim contenant un nom propre : il ne sort pas du système.** Deux formes testées et vérifiées
  en base réelle (voir preuve ci-dessous) : un nom **connu** du roster (« Alice Arrivante » + son
  email personnel) intégralement rédigé, et un nom **absent de tout roster** (« Kevin Dupont »)
  intercepté par le garde-fou heuristique. Le payload JSON réellement envoyé au réseau a été capturé
  et ne contient aucune des deux occurrences.
- **Trop peu de réponses : refus de produire une synthèse.** `generateSatisfactionSummaries` compte
  les commentaires non vides avant tout appel ; en dessous du seuil, `ports.summarizer.summarize`
  n'est jamais invoqué — vérifié par un test unitaire qui fait échouer le test si le mock est appelé,
  et en base réelle (société sans réponse, `Anthropic ever called? false`).
- **Service indisponible : le cockpit reste utilisable sans la synthèse.** Trois niveaux vérifiés :
  clé absente (`createAnthropicSummarizerFromEnv` renvoie un résumeur dégradé, jamais une exception),
  appel réseau qui échoue (tracé dans le résultat typé, aucune ligne de cache écrite, vérifié en réel
  avec une clé factice rejetée par Anthropic), lecture du cockpit qui ne dépend d'aucun appel IA
  (`ai_satisfaction_summaries` local uniquement, absence de ligne rendue par un message neutre plutôt
  qu'une erreur).

## Vérifié sur les données réelles

Base réinitialisée (`npm run db:reset`), application démarrée en développement
(`next dev -p 3100`, `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` fournies
explicitement au processus — `.env.local` a un accès en lecture restreint dans cet environnement,
même contrainte que celle documentée en T-21/T-24/T-25 —, `N8N_WEBHOOK_SECRET` et `ANTHROPIC_API_KEY`
factices).

| Étape | Requête / script | Résultat observé |
| --- | --- | --- |
| Anonymisation directe (lecture réelle du roster en base) | script temporaire appelant `supabaseRosterDirectory(...).rosterFor(NORD)` puis `anonymizeComment` sur deux commentaires réels insérés en base | Commentaire 1 (« Alice Arrivante… alice.perso@example.test… l'équipe de Lille ») → `[personne]... [email]... l'équipe de [site]` ; commentaire 2 (« Kevin Dupont… ») → `[personne] (mon [personne]…)` ; **aucune fuite détectée** sur les deux |
| Société sous le seuil (Méridien Gulf, 0 réponse) | appel direct du cas d'usage avec un `summarizer` qui trace ses appels | `status: "below_threshold"`, **`summarizer` jamais appelé** |
| Société au-dessus du seuil (Atelier Nord, 2 commentaires, seuil abaissé à 2 pour l'essai) | idem, `fetch` réel intercepté juste avant l'envoi | Requête réelle envoyée à `https://api.anthropic.com/v1/messages`, rejetée pour clé factice (`provider_error`) ; **payload JSON capturé et reproduit ci-dessous**, sans nom, email ni site en clair |
| Route `POST /api/satisfaction/summarize` sans en-tête `x-webhook-secret` | `curl`/`Invoke-WebRequest` | `401` |
| Route avec le bon secret, seuil par défaut (5) | `Invoke-WebRequest -Method POST` | `200`, `status: "below_threshold"` pour les deux sociétés (4 réponses réelles pour Atelier Nord après insertion des deux commentaires de test, sous le seuil de 5) |
| Route avec le bon secret, seuil abaissé à 2 pour Atelier Nord | idem, `companyId` ciblé | `200`, tentative réelle à Anthropic pour les deux groupes (site + société), `provider_error` pour les deux, **aucune ligne de cache écrite par cette tentative échouée** (vérifié par un comptage avant/après) |
| Lecture RLS-scopée du cache, comme le fait le cockpit | requête rejouant exactement `satisfaction.tsx` (`select … from ai_satisfaction_summaries where company_id = …`) sous l'identité RH_NORD (`set_config('request.jwt.claims', …)`) après y avoir inséré manuellement une ligne (aucune clé Anthropic réelle disponible pour obtenir un `generated` organique — voir la limite ci-dessous) | La ligne du groupe `company` est bien lisible par la RH de la société, avec `summary_text`, `generated_at`, `based_on_respondent_count` |

Payload exact envoyé au réseau (capturé avant l'appel `fetch` réel, jamais reconstruit après coup) :

```json
{"model":"claude-3-5-haiku-latest","max_tokens":500,"system":"Tu resumes des commentaires de satisfaction anonymises...",
 "messages":[{"role":"user","content":"Groupe : Atelier Nord — toutes localisations\nCommentaires anonymises (2) :\n
 1. [personne] a trouve l'accueil tres chaleureux, merci a l'equipe de [site]. Contactez-moi a [email] si besoin.\n
 2. [personne] (mon [personne], pas dans les effectifs RH) m'a beaucoup aide alors que le materiel etait en retard."}]}
```

Ce que ça prouve honnêtement : le chemin complet — lecture du roster réel, anonymisation, regroupement
par seuil, appel réseau réel à Anthropic (authentification rejetée), non-écriture du cache sur échec,
lecture RLS-scopée du cache — est exercé de bout en bout côté application et base ; **aucune génération
IA réussie n'a été obtenue**, faute de clé Anthropic réelle dans cet environnement (même limite honnête
que Resend/T-24, Google Calendar/T-25, n8n/T-21). Le rendu du cockpit côté navigateur (badge, mise en
page de la nouvelle sous-section) n'a pas été vérifié par un vrai navigateur — Playwright est absent de
cet environnement, même limite déjà documentée en T-25 — mais la requête RLS-scopée exercée ci-dessus
reproduit exactement la lecture que fait `satisfaction.tsx`, avec des données réellement en base.

## Défauts trouvés

**Dans le produit**, corrigé pendant ce ticket (pas une dette pré-existante découverte ailleurs) : la
première version de l'anonymisation ne redigeait un libellé de site/société que sous sa forme
complète (« Siège de Lille »), pas sous une forme partielle plausible dans un verbatim libre
(« l'équipe de Lille »). Repéré par la vérification réelle ci-dessus (le mot « Lille » survivait dans
le payload capturé), corrigé en ajoutant une tokenisation des libellés d'équipe restreinte aux
composants à majuscule initiale (voir « Décisions prises »), avec deux tests de régression explicites.

**Dans mes scripts de vérification, pas dans le produit** :

- `.env.local` non lisible par les outils de cette session (même restriction que T-21/T-24/T-25) :
  variables fournies explicitement au processus `next dev`.
- Aucune clé Anthropic réelle disponible : le chemin est vérifié jusqu'à l'appel réseau réel (rejeté
  pour authentification), jamais jusqu'à une synthèse réellement produite par le modèle.
- La ligne `ai_satisfaction_summaries` utilisée pour vérifier la lecture RLS-scopée par le cockpit a
  été insérée manuellement (pour simuler une génération réussie), faute de pouvoir en obtenir une
  organiquement sans clé réelle — signalé explicitement plutôt que présenté comme une génération
  authentique.
- Playwright absent de cet environnement (même limite que T-25) : pas de vérification du rendu DOM
  final de la nouvelle sous-section cockpit, seulement de la donnée et de la requête qui l'alimente.
- Les fichiers de vérification manuels (`scripts/ui-checks/_t26-verify*.ts`, journeys
  `e1000000-…-000000000001`/`…002`, réglage `survey_settings.minimum_respondents` abaissé pour
  Atelier Nord) ont été supprimés/réinitialisés par un `npm run db:reset` avant la régression finale
  et la fusion.

## Définition de terminé

- [x] **Aucune donnée personnelle ne quitte le système, vérifié sur des verbatims de test.** Deux
      verbatims réels testés de bout en bout (nom + email connus du roster ; nom totalement absent de
      tout roster) : le payload JSON réellement envoyé au réseau a été capturé et ne contient aucune
      des deux occurrences — voir le tableau et le payload ci-dessus. Limite honnêtement documentée en
      tête de `anonymize-comment.ts` : un nom isolé d'un seul mot, absent du roster, écrit tout en
      minuscules ou sous une orthographe non standard, peut échapper à la fois au roster et à
      l'heuristique — un test explicite (`documented limit: a single-word unlisted name…`) le
      démontre plutôt que de le passer sous silence. La protection de dernier recours dans ce cas
      reste le seuil minimal de répondants et le fait qu'une synthèse ne cite jamais un verbatim mot
      pour mot (imposé par le prompt système).
- [x] **La synthèse est signalée comme générée, jamais présentée comme un fait.** Le type
      `SatisfactionSummaryResult` porte `kind: 'generated'` dans le succès lui-même (pas laissé à la
      charge de l'écran) ; le cockpit affiche un `StatusBadge` explicite « Synthèse générée
      automatiquement » (icône + texte, jamais la couleur seule) à côté du texte, avec le nombre de
      répondants ; le prompt système interdit au modèle de formuler une phrase qui ressemblerait à un
      fait sur un individu précis.
- [x] **Le seuil minimal est une donnée, pas une constante.** `generateSatisfactionSummaries` reçoit
      `minimumRespondents` en paramètre, lu par la route depuis `survey_settings.minimum_respondents`
      (même colonne que T-14, jamais un second seuil inventé) ; le cockpit réutilise l'agrégat déjà
      calculé (`aggregateRatings`/`aggregateByGroup`) avec ce même seuil pour décider s'il affiche
      quelque chose à la place de la synthèse absente.

## Dette restante

- **Aucune clé Anthropic réelle disponible dans cet environnement** : le chemin est vérifié jusqu'à
  l'appel réseau réel (rejeté pour authentification), jamais jusqu'à une synthèse réellement produite
  par le modèle et affichée dans un vrai navigateur. Même limite honnête que Resend (T-24), Google
  Calendar (T-25) et n8n (T-21).
  *Levé depuis, avec un fournisseur gratuit : un port Ollama (modèle ouvert `qwen2.5:3b`, local, sans
  clé) a été ajouté et sélectionné par `AI_SUMMARY_PROVIDER`. W3, lancé depuis une vraie instance
  n8n, a produit deux synthèses en 32 s (Lille et société, 5 répondants) ; aucun nom ni email des
  verbatims de démonstration n'y figure, et le cockpit les affiche avec la mention « Synthèse générée
  automatiquement » (capture d'écran vérifiée). Deux correctifs au passage : le seuil compte désormais
  des personnes et non des commentaires, et le modèle Anthropic par défaut, retiré, est remplacé par
  `claude-opus-5`.*
- **Le garde-fou heuristique pour un nom propre hors roster a un coût de faux positifs et de faux
  négatifs assumé**, documenté en tête de `anonymize-comment.ts` — pas une réparation complète du
  risque de ré-identification par nom propre non recensé, une réduction significative dont les limites
  sont écrites noir sur blanc plutôt que passées sous silence.
- **Pas de vérification par navigateur réel du rendu cockpit** (Playwright absent de cet
  environnement, même limite que T-25) : la donnée et la requête RLS-scopée sont vérifiées de bout en
  bout contre la base réelle, pas le DOM final. *Levé depuis : rendu vérifié dans Chrome via
  Playwright.*
- **Aucun n8n réel n'a déclenché `POST /api/satisfaction/summarize`** dans cet environnement (même
  limite que W1/W2/W3, T-21) : la route est appelée directement, avec le même secret partagé que les
  autres webhooks — pas d'export `workflows/*.json` dédié pour ce ticket, dans la continuité de T-25
  (`/api/journeys/reschedule`) : le périmètre du ticket ne demande pas un workflow n8n numéroté
  supplémentaire, seuls W1/W2/W3 le sont ; le déclenchement planifié de cette route reste à câbler dans
  la définition n8n existante de W3 le jour où une instance n8n réelle est disponible pour vérifier ce
  branchement.
