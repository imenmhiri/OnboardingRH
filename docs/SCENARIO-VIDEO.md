# Scénario de la vidéo de démonstration (T-28)

Vidéo commentée de 3 à 5 minutes. Cible : **4 minutes**, ce qui laisse de la marge des deux côtés.

Le cahier des charges demande explicitement de montrer **une arrivée de bout en bout**, **un retard
escaladé** et **la bascule d'une société à l'autre**. Les trois y sont, plus les trois workflows
W1 / W2 / W3.

---

## 1. Avant d'appuyer sur « enregistrer »

### Ce qui doit tourner

| Quoi | Vérification | Si c'est éteint |
| --- | --- | --- |
| Docker Desktop | icône verte | le lancer, attendre ~1 min |
| Base de démonstration | `npm run db:verify` passe | `npx supabase start` |
| Application | http://localhost:3000 répond | voir la commande ci-dessous |
| n8n | http://localhost:5678 répond | `N8N_WEBHOOK_SECRET=dev-webhook-secret npm run n8n:local` |
| Ollama (synthèse IA) | http://localhost:11434 répond | `docker start onboarding-ollama` |

Démarrage de l'application avec tous les réglages de démonstration :

```powershell
$env:N8N_WEBHOOK_SECRET='dev-webhook-secret'
$env:SURVEY_LINK_SECRET='dev-survey-secret'
$env:RESEND_API_KEY='re_dev_fake_key'
$env:RESEND_FROM='Onboarding <onboarding@example.test>'
$env:AI_SUMMARY_PROVIDER='ollama'
$env:OLLAMA_BASE_URL='http://127.0.0.1:11434'
$env:OLLAMA_MODEL='qwen2.5:3b'
npm run dev
```

### Remettre le jeu de démonstration à zéro

```powershell
npm run db:reset
```

À faire **juste avant** l'enregistrement : les dates sont recalculées par rapport à aujourd'hui, et
tout ce qui a été cliqué pendant les répétitions est effacé.

### Pré-générer la synthèse IA — l'étape qu'on oublie

`db:reset` vide aussi le cache des synthèses. Le modèle met ~30 secondes : beaucoup trop long à
l'écran. On la génère donc **avant** de filmer, avec la route dédiée — surtout **pas** avec W3, qui
clôturerait le parcours de Diego et le ferait disparaître des tâches bloquées.

```powershell
$h = @{ 'x-webhook-secret' = 'dev-webhook-secret' }
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/satisfaction/summarize -Headers $h -ContentType 'application/json' -Body '{}'
```

Attendre la réponse (`generated` deux fois), puis vérifier dans le cockpit que la carte
« Synthèse IA des verbatims » est bien remplie.

### Fenêtres à préparer

1. **Navigateur, onglet 1** : http://localhost:3000, **déjà connecté** en `rh@atelier-nord.demo`
   (mot de passe `OnboardingDemo!2026`), sur le Cockpit.
2. **Navigateur, onglet 2** : http://localhost:5678, n8n déjà connecté, workflow **W2** ouvert.
3. **Fenêtre PowerShell** : la commande W1 ci-dessous **déjà tapée, sans appuyer sur Entrée**.

```powershell
$h = @{ 'x-webhook-secret' = 'dev-webhook-secret' }
$body = @{
  companyId     = '11111111-1111-4111-8111-111111111111'
  siteId        = 'a1111111-1111-4111-8111-111111111111'
  jobFamily     = 'atelier'
  contractType  = 'cdi'
  employeeName  = 'Nina Nouvelle'
  managerId     = 'e0000000-0000-4000-8000-000000000002'
  arrivalDate   = '2026-10-12'
  hireReference = 'demo-video-001'
  personalEmail = 'nina.nouvelle@example.test'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:5678/webhook/w1-embauche-validee -Headers $h -ContentType 'application/json' -Body $body
```

> Si vous refaites une prise, changez `hireReference` (`demo-video-002`, etc.), sinon le système
> répondra `duplicate` — ce qui est correct, mais ce n'est pas ce qu'on veut montrer à cet instant.

### Enregistrement

Windows : **Win + G** (Xbox Game Bar) suffit. OBS Studio si vous voulez couper entre les plans.
Zoom du navigateur à **110–125 %** : le jury regarde souvent sur un petit écran.

---

## 2. Le script, plan par plan

Le texte en **« … »** est à dire. Le reste est ce qu'on fait à l'écran.

---

### Plan 1 — Le problème (0:00 → 0:25)

**Écran :** Cockpit RH, vue d'ensemble, sans rien cliquer.

> « OnboardingRH orchestre l'intégration d'un nouvel employé entre la RH, son manager, l'informatique
> et lui-même — à travers plusieurs sociétés d'un même groupe.
> À partir d'une embauche validée, le système génère le bon parcours, l'assigne aux bonnes personnes,
> calcule les échéances en jours ouvrés, relance les retards et mesure la satisfaction.
> Voici ce que ça donne en vrai. »

---

### Plan 2 — W1 : une embauche validée, de bout en bout (0:25 → 1:10)

**Écran :** la fenêtre PowerShell préparée.

> « Tout part d'une embauche validée. Ici, c'est le système RH qui appelle n8n. »

**→ Appuyer sur Entrée.**

> « Réponse en moins d'une seconde : le parcours est créé. »

**Écran :** montrer la réponse (`journeyId`, `status: created`, `sendWelcomeEmailAt`).

> « Et cette date, c'est l'envoi différé de l'email de bienvenue : trois jours ouvrés avant l'arrivée,
> calculés par le domaine, pas par n8n. »

**→ Basculer sur le navigateur, onglet Cockpit, rafraîchir (F5).**

> « Nina Nouvelle apparaît dans les arrivées à venir. Ses six tâches ont été créées, avec leurs
> dépendances, leurs échéances en jours ouvrés, et chacune assignée automatiquement : la RH, le
> manager, l'équipe informatique. Aucune intervention humaine. »

---

### Plan 3 — Cockpit RH : la tâche bloquée qui s'explique (1:10 → 1:55)

**Écran :** Cockpit, faire défiler jusqu'à **« Tâches bloquées »**.

> « Le cockpit, c'est la vue de la RH. Et voici l'exigence la plus intéressante du cahier des charges :
> une tâche bloquée doit expliquer *par quoi* elle est bloquée, et *qui* en est responsable. »

**→ Pointer le bloc de Diego Retardé.**

> « Diego a trois tâches bloquées. Toutes les trois par la même cause : « Créer le compte IT », qui
> n'a jamais été fait, et qui appartient à l'équipe informatique.
> Ce n'est pas la dépendance directe qui est affichée — c'est la cause racine, retrouvée en remontant
> toute la chaîne. Et ce calcul vit dans le domaine métier, jamais dans l'interface. »

**→ Faire défiler jusqu'à « Comptes IT et matériel avant une arrivée imminente ».**

> « Juste en dessous : ce qui manque avant chaque arrivée imminente. Le matériel remis mais jamais
> confirmé remonte ici plutôt que de se perdre. »

---

### Plan 4 — Le portail employé (1:55 → 2:25)

**→ Se déconnecter, se reconnecter en `alice@atelier-nord.demo`.**

> « Côté employé, c'est un autre monde : pas de tableau de bord, juste ce qui la concerne. »

**Écran :** portail d'Alice.

> « Son accueil personnalisé, son manager, sa progression, l'agenda de sa première semaine. »

**→ Cliquer « Consulter » sur le livret d'accueil.**

> « Et les documents ne sont jamais accessibles par une URL fixe : chaque consultation génère un lien
> signé, à durée limitée — et ce clic est lui-même l'accusé de lecture. »

**→ Revenir en arrière, aller sur « Mon matériel », cliquer « Confirmer la réception ».**

> « L'accusé de réception du matériel, c'est le seul geste que l'employé fait lui-même. La règle qui
> l'y autorise est dans la base, pas dans le code. »

---

### Plan 5 — Multi-sociétés (2:25 → 2:50)

**→ Se déconnecter, se reconnecter en `nadia@groupe.demo`.**

> « Nadia travaille pour deux filiales du groupe. »

**→ Cliquer « Changer » → Méridien Gulf.**

> « Logo, couleurs, règles, jours fériés, catalogue de matériel, templates de parcours : tout change.
> Et pas une seule ligne de code ne connaît le nom d'une société. Ajouter une filiale, c'est une
> insertion en base, pas un déploiement. »

---

### Plan 6 — W2 : le retard escaladé (2:50 → 3:20)

**→ Revenir en `rh@atelier-nord.demo`, puis basculer sur l'onglet n8n, workflow W2.**

> « Deuxième workflow : le retard critique. Il tourne une fois par jour ouvré. »

**→ Cliquer « Test workflow ».**

> « Il demande à l'application qui relancer aujourd'hui. Et la réponse est plus fine qu'il n'y paraît :
> la tâche de Diego est en retard de huit jours ouvrés et elle est critique, donc on ne relance pas
> son propriétaire — on escalade directement à la RH.
> Surtout : on ne relance jamais quelqu'un dont la tâche est bloquée par quelqu'un d'autre. On
> prévient le propriétaire de la cause racine, pas la victime. »

---

### Plan 7 — W3 et la synthèse IA (3:20 → 3:50)

**→ Ouvrir le workflow W3 dans n8n, cliquer « Test workflow ».**

> « Troisième workflow : le bilan à trente jours. »

**→ Basculer sur le Cockpit, carte Satisfaction.**

> « Le contrat de Diego se termine avant son questionnaire J+30 : le système ne l'envoie pas et clôt
> son parcours. Demander à quelqu'un qui est parti comment se passe son premier mois, ce n'est pas
> une mesure, c'est une maladresse. »

**→ Pointer « Synthèse IA des verbatims ».**

> « Et voici la synthèse des verbatims, produite par un modèle qui tourne en local.
> Deux garde-fous : elle n'est produite qu'au-dessus d'un seuil de répondants, pour qu'on ne puisse
> jamais remonter à une personne. Et les commentaires sont anonymisés **avant** d'être envoyés au
> modèle — les noms et les adresses email sont remplacés, ici, par ces marqueurs. »

---

### Plan 8 — Clôture (3:50 → 4:10)

**Écran :** revenir au Cockpit, vue d'ensemble. Ou le dépôt, sur l'arborescence `src/`.

> « Sous l'interface : un domaine métier en TypeScript pur, sans base de données ni horloge système,
> entièrement testé — plus de quatre cents tests. L'autorisation est portée par la base elle-même, pas
> par le code applicatif. Et les limites connues sont écrites dans le README plutôt que passées sous
> silence.
> Merci. »

---

## 3. Les pièges

| Piège | Conséquence | Ce qu'il faut faire |
| --- | --- | --- |
| Lancer W3 avant de montrer le cockpit | Le parcours de Diego se clôt, ses tâches bloquées disparaissent | Respecter l'ordre des plans : W3 en avant-dernier |
| Oublier de pré-générer la synthèse IA | La carte affiche « pas assez de réponses » ou reste vide | Lancer la route dédiée avant l'enregistrement |
| Refaire une prise sans changer `hireReference` | W1 répond `duplicate` au lieu de `created` | Incrémenter la référence à chaque prise |
| Filmer longtemps après le `db:reset` | Les dates de démonstration glissent | Refaire `db:reset` le jour de l'enregistrement |
| Montrer les emails qui partent | Aucune clé Resend réelle : l'envoi échoue | Ne pas le montrer, ou l'annoncer comme une limite |

## 4. Ce qu'on ne montre pas, et pourquoi

À dire seulement si le jury pose la question — inutile de s'en excuser dans la vidéo :

- **Les emails ne partent pas réellement** : pas de clé Resend dans cet environnement. Le chemin est
  vérifié jusqu'à l'appel réseau réel, qui est rejeté pour authentification.
- **Pas d'agenda réel** : même raison, pas d'identifiants Google.
- **Pas d'écran de réponse au questionnaire** : le lien signé existe, sa destination n'est pas encore
  construite.
- **Les invitations des responsables ne partent pas par email** : les responsables sont bien attribués,
  l'invitation est seulement tracée.

Tout cela est écrit dans les « Limites connues » du README.
