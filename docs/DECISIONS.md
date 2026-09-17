# Décisions notables et alternatives écartées

Chaque ticket documente ses propres choix dans `docs/tickets/T-NN-*.md`, sous « Ce qui a été décidé
en chemin » ou « Décisions prises ». Ce document rassemble les décisions qui touchent plusieurs
tickets, ou qui engagent l'architecture dans son ensemble — pas une liste exhaustive, seulement
celles qui auraient pu raisonnablement être prises autrement.

## L'autorisation vit dans la base, pas dans le code applicatif

**Décidé** : chaque table métier porte `company_id` et une policy RLS qui la scope, dans la même
migration que la table. Un membre d'une autre société ne peut pas lire une ligne, quelle que soit la
route qui l'interroge.

**Alternative écartée** : vérifier l'appartenance à la société dans les routes Next.js ou les
cas d'usage applicatifs (`if (journey.companyId !== session.companyId) throw`). Plus simple à
écrire au premier abord, mais chaque nouvelle route devient un endroit où l'oubli casse
l'isolation — et rien ne le détecte avant un test explicite de cette route précise. Avec la RLS, une
route qui oublie de filtrer ne voit simplement rien à tort plutôt que quelque chose à tort : l'échec
est visible immédiatement, pas silencieux.

## Le domaine ignore l'horloge système

**Décidé** : aucun `new Date()` ni `Date.now()` dans `src/domain/` ou `src/application/`. L'heure
arrive par un port `Clock` injecté ; le domaine calcule sur des `PlainDate` (des numéros de jour
epoch, jamais un horodatage).

**Alternative écartée** : lire `new Date()` directement où c'est nécessaire, et n'injecter l'horloge
que dans les tests via un mock global (`vi.setSystemTime`). Plus rapide à écrire, mais rend
impossible de tester deux scénarios avec des dates différentes dans le même fichier sans réinitialiser
un état global entre chaque test — et un horodatage plutôt qu'un jour civil aurait fait tomber la
même échéance sur deux jours différents selon le fuseau du lecteur (T-09).

## Le multi-sociétés est une donnée, jamais une branche

**Décidé** : logo, palette, semaine de travail, jours fériés, catalogue de matériel, templates de
parcours, chaînes de repli des responsables — tout est une ligne en base, résolue à l'exécution.
Aucun `if (company.slug === '...')` nulle part dans le dépôt.

**Alternative écartée** : un fichier de configuration par société (`config/atelier-nord.ts`,
`config/meridien-gulf.ts`) importé conditionnellement. Plus visible au premier coup d'œil pour qui
lit le code, mais ajouter une filiale devient un déploiement plutôt qu'un `INSERT`, et rien
n'empêche une branche de fuiter une règle propre à une société dans un endroit qu'on n'a pas pensé à
paramétrer.

## Une tâche « bloquée » n'est jamais stockée, toujours recalculée

**Décidé** : les statuts en base sont `pending`, `in_progress`, `done`, `cancelled` — pas de valeur
`blocked`. Le blocage, sa cause racine et son propriétaire se recalculent à chaque lecture depuis le
graphe de dépendances (`domain/tasks/task-graph.ts`).

**Alternative écartée** : une colonne `blocked: boolean` mise à jour par un déclencheur ou un job
chaque fois qu'une dépendance change de statut. Économise un calcul à la lecture, mais un champ
dérivé stocké peut diverger de sa source — la première fois qu'un déclencheur est oublié sur un
nouveau chemin d'écriture, le cockpit ment. Recalculer coûte peu (un graphe de quelques dizaines de
tâches) et ne peut pas devenir faux.

## Les workflows n8n orchestrent, ils ne décident jamais

**Décidé** : chaque nœud n8n des trois workflows (W1/W2/W3) appelle une route de l'application et
branche sur sa réponse — jamais de nœud `Function` qui recalcule une date, un seuil ou une
attribution. Documenté explicitement dans `.claude/skills/n8n-workflow/SKILL.md`.

**Alternative écartée** : dupliquer les règles simples (comme le calcul de la date d'envoi différé de
l'email de bienvenue) directement en JavaScript dans un nœud n8n, pour éviter un aller-retour HTTP.
Plus rapide à l'exécution, mais crée une deuxième source de vérité qui dérive silencieusement de la
première dès que la règle change d'un côté sans l'autre — et cette règle précise ne serait plus
couverte par les tests Vitest du domaine.

## L'accusé de réception est un geste, pas une case à cocher séparée

**Décidé** : consulter un document génère un lien signé, et cette génération elle-même est la preuve
de lecture, tracée dans le journal d'audit (T-07). Confirmer la réception d'un matériel est le seul
geste que l'employé fait lui-même dans tout le système (T-15/T-19).

**Alternative écartée** : une case « J'ai lu » ou « J'ai reçu » distincte du clic qui ouvre
réellement le document ou reçoit réellement le matériel. Aurait permis de cocher sans avoir
réellement consulté — la preuve aurait porté sur une intention déclarée, pas sur un fait constaté.

## Les agrégats de satisfaction ont un plancher de répondants, jamais une exception pour le premier

**Décidé** : en dessous du seuil configuré par société (`survey_settings.minimum_respondents`,
5 par défaut), aucune moyenne n'est publiée — ni le nombre exact de répondants en dessous du seuil,
puisque « une réponse sur ce site » suffit à identifier qui a répondu.

**Alternative écartée** : publier quand même la moyenne au-delà de deux répondants, en considérant
qu'une moyenne de deux personnes protège déjà l'anonymat individuel. Rejeté : avec deux répondants,
connaître sa propre note permet de déduire exactement celle de l'autre par soustraction — le seuil
de deux n'est pas un vrai plancher, seulement une fausse impression d'en avoir un.

## La synthèse IA anonymise avant l'appel, jamais pendant

**Décidé** : les commentaires sont passés dans une fonction d'anonymisation pure
(`domain/privacy/anonymize-comment.ts`) — noms connus, emails, mentions d'équipe ou de site, et un
garde-fou heuristique pour un nom propre non recensé — avant même d'être assemblés dans la requête
envoyée au modèle.

**Alternative écartée** : instruire le modèle lui-même, par le prompt système, de ne jamais répéter
de nom propre. Plus simple à écrire, mais confie la garantie de confidentialité à un modèle de
langage plutôt qu'à du code déterministe et testé — la même classe d'erreur que confier une règle
métier à un nœud n8n plutôt qu'au domaine.

## La synthèse IA tourne sur un modèle gratuit, en local, par défaut

**Décidé** : `AI_SUMMARY_PROVIDER=ollama` par défaut, un modèle ouvert (`qwen2.5:3b`) servi sans
compte ni clé, sur la même machine ou le même réseau que l'application. Anthropic reste disponible
en alternative si une clé est fournie.

**Alternative écartée** : ne proposer qu'un fournisseur payant (Anthropic), en le documentant comme
« nécessaire ». Aurait rendu la fonctionnalité invérifiable sans compte facturé, et aurait
contredit l'esprit du reste du projet — dégrader proprement en l'absence d'une intégration externe
plutôt que de rendre le produit inutilisable sans elle.

## Chaque écran lit directement les tables pour l'affichage, les cas d'usage restent réservés aux écritures

**Décidé** : les pages Next.js (`src/app/(app)/*/page.tsx`) interrogent Supabase directement pour
leurs lectures ; les cas d'usage de `src/application/use-cases/` orchestrent uniquement les
écritures qui combinent plusieurs ports ou une règle de domaine (créer un parcours, transitionner du
matériel, envoyer un email).

**Alternative écartée** : faire passer *toute* lecture, même la plus simple, par un cas d'usage
dédié. Plus uniforme, mais aurait multiplié les fichiers pour des requêtes à une seule table sans
aucune logique métier à orchestrer — la couche application existe pour orchestrer des règles, pas
pour envelopper des `SELECT`.
