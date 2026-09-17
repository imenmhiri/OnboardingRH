# Scénario de la vidéo de démonstration (T-28)

Vidéo commentée de 3 à 5 minutes. Cible : **4:50**, en haut de la fourchette autorisée — il y a
beaucoup à montrer.

## Ce que le cahier des charges exige, et où c'est montré

Deux exigences séparées : une arrivée de bout en bout, un retard escaladé, la bascule d'une société
à l'autre — **et**, indépendamment, les cinq cas limites du cahier des charges. Rien n'est reconstitué
pour la caméra : chaque scène déclenche une vraie action contre la vraie base.

| Exigence / cas limite | Scène | Comment c'est montré |
| --- | --- | --- |
| Arrivée de bout en bout | 2 | W1 réellement appelé, parcours créé |
| Retard escaladé | 9 | W2 réellement exécuté dans n8n |
| Bascule d'une société à l'autre | 8 | Changement de société en direct |
| **Date d'arrivée reportée** | 6 | Appel réel de `/api/journeys/reschedule` |
| **Manager absent** | 7 | `npm run demo:report`, ligne réelle de substitution |
| **Employé sans email personnel** | 2 | Second appel W1, sans `personalEmail` |
| **Tâche commune à plusieurs arrivées** | 4 | Écran Matériel, commande groupée × 2 |
| **Fin de contrat avant J+30** | 10 | W3 réellement exécuté, parcours de Diego clos |

---

## 1. Avant d'appuyer sur « enregistrer »

### Ce qui doit tourner

| Quoi | Vérification | Si c'est éteint |
| --- | --- | --- |
| Docker Desktop | icône verte | le lancer, attendre ~1 min |
| Base de démonstration | `npm run db:verify` passe | `npx supabase start` |
| Application | http://localhost:3000 répond | commande ci-dessous |
| n8n | http://localhost:5678 répond | `N8N_WEBHOOK_SECRET=dev-webhook-secret npm run n8n:local` |
| Ollama (synthèse IA) | http://localhost:11434 répond | `docker start onboarding-ollama` |

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

À faire **le jour même** de l'enregistrement : les dates de démonstration sont recalculées par
rapport à aujourd'hui.

### Pré-générer la synthèse IA (scène 10)

Le modèle met ~30 secondes : trop long à l'écran, et `db:reset` vide le cache. À lancer **avant**
d'enregistrer, avec la route dédiée — **pas** avec W3, qui clôturerait le parcours de Diego avant que
la scène 3 (tâches bloquées) ne l'ait montré.

```powershell
$h = @{ 'x-webhook-secret' = 'dev-webhook-secret' }
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/satisfaction/summarize -Headers $h -ContentType 'application/json' -Body '{}'
```

Vérifier ensuite dans le cockpit que « Synthèse IA des verbatims » est remplie.

### Fenêtres à préparer

1. **Navigateur, onglet 1** : http://localhost:3000, **déjà connecté** en `rh@atelier-nord.demo`
   (mot de passe `OnboardingDemo!2026`), sur le Cockpit.
2. **Navigateur, onglet 2** : http://localhost:5678, n8n déjà connecté, workflow **W2** ouvert.
3. **Fenêtre PowerShell** : les commandes de la scène 2 (ci-dessous) déjà tapées dans l'historique,
   pas encore exécutées.

### Enregistrement

Windows : **Win + G** (Xbox Game Bar) suffit. OBS Studio si vous voulez couper entre les plans.
Zoom du navigateur à **110–125 %**.

---

## 2. Le script, scène par scène

Le texte en **« … »** est à dire. Le reste est ce qu'on fait à l'écran.

---

### Scène 1 — Le problème (0:00 → 0:15)

**Écran :** Cockpit RH, vue d'ensemble, sans rien cliquer.

> « OnboardingRH orchestre l'intégration d'un nouvel employé entre la RH, son manager, l'informatique
> et lui-même, à travers plusieurs sociétés d'un même groupe. Voici le produit réel, en train de
> tourner. »

---

### Scène 2 — W1 : une embauche validée, avec et sans email personnel (0:15 → 1:05)

**Écran :** la fenêtre PowerShell préparée.

> « Tout part d'une embauche validée, envoyée par le système RH. »

**→ Exécuter :**

```powershell
$h = @{ 'x-webhook-secret' = 'dev-webhook-secret' }
$body1 = @{
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
Invoke-RestMethod -Method Post -Uri http://localhost:5678/webhook/w1-embauche-validee -Headers $h -ContentType 'application/json' -Body $body1
```

> « Parcours créé, tâches assignées, échéances calculées en jours ouvrés. Et cette date, c'est
> l'envoi différé de l'email de bienvenue.
> Mais tous les employés n'ont pas d'adresse personnelle au moment de l'embauche. Rejouons-le sans. »

**→ Exécuter :**

```powershell
$body2 = @{
  companyId     = '11111111-1111-4111-8111-111111111111'
  siteId        = 'a1111111-1111-4111-8111-111111111111'
  jobFamily     = 'atelier'
  contractType  = 'cdi'
  employeeName  = 'Omar Sans-Email'
  managerId     = 'e0000000-0000-4000-8000-000000000002'
  arrivalDate   = '2026-10-12'
  hireReference = 'demo-video-002'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:5678/webhook/w1-embauche-validee -Headers $h -ContentType 'application/json' -Body $body2
```

> « Même résultat : le parcours se crée normalement. La différence est invisible ici, mais réelle :
> quand l'email de bienvenue partira, le système basculera automatiquement vers le manager — jamais
> un échec silencieux. »

**→ Basculer sur le navigateur, onglet Cockpit, rafraîchir (F5).**

> « Les deux apparaissent dans les arrivées à venir. »

---

### Scène 3 — Cockpit RH : la tâche bloquée qui s'explique (1:05 → 1:35)

**Écran :** faire défiler jusqu'à **« Tâches bloquées »**, pointer le bloc de Diego Retardé.

> « Voici l'exigence la plus intéressante du cahier des charges : une tâche bloquée doit expliquer
> par quoi elle est bloquée, et qui en est responsable.
> Diego a trois tâches bloquées, toutes par la même cause : « Créer le compte IT », jamais fait. Ce
> n'est pas la dépendance directe qui est affichée — c'est la cause racine, retrouvée en remontant
> toute la chaîne, calculée dans le domaine métier, jamais dans l'interface. »

---

### Scène 4 — Matériel : tâche commune à plusieurs arrivées (1:35 → 2:05)

**→ Cliquer « Matériel » (en haut du cockpit).**

> « Autre cas limite : deux arrivées qui demandent le même matériel. »

**Écran :** carte « Commandes à grouper ».

> « Claire et Bruno arrivent la même semaine et demandent chacun un ordinateur portable standard :
> une seule commande de deux, pas deux commandes séparées. Diego, arrivé trois semaines plus tôt,
> reste sur sa propre commande — le regroupement se fait par semaine d'arrivée, jamais entre deux
> urgences différentes. »

---

### Scène 5 — Attribuer et remettre (2:05 → 2:20)

**→ Sur la ligne de Claire, cliquer « Attribuer », saisir un numéro de série, valider, puis
« Remettre ».**

> « L'IT attribue une unité identifiée, puis la remet. »

---

### Scène 6 — Date d'arrivée reportée (2:20 → 2:45)

**→ Basculer sur PowerShell.**

> « Une arrivée qui glisse est un cas limite courant. Reportons celle de Nina, créée tout à l'heure,
> de deux semaines. »

**→ Exécuter (remplacer `<journeyId>` par celui renvoyé à la scène 2) :**

```powershell
$rb = @{ companyId = '11111111-1111-4111-8111-111111111111'; journeyId = '<journeyId>'; newArrivalDate = '2026-10-26' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/journeys/reschedule -Headers $h -ContentType 'application/json' -Body $rb
```

> « Toutes ses tâches se recalculent en jours ouvrés, chacune gardant son propre délai par rapport à
> l'arrivée. Et si un évènement d'agenda avait déjà été créé, il serait déplacé, jamais dupliqué. »

---

### Scène 7 — Manager absent (2:45 → 3:05)

**→ Basculer sur PowerShell, exécuter `npm run demo:report`, ou pointer une fenêtre déjà ouverte.**

> « Dernier cas limite côté attribution : un manager absent. »

**Écran :** pointer la ligne réelle affichée par la commande :
`Absence : Marc Manceau du 2026-09-13 au 2026-09-23`, puis la ligne d'Alice montrant la
substitution vers Rachel Renard.

> « Marc est en congés. Toute tâche qui tombe pendant son absence bascule automatiquement vers la
> chaîne de repli configurée pour la société — ici, la RH. L'absence se juge à la date d'échéance de
> chaque tâche, pas à la date du jour. »

---

### Scène 8 — Le portail employé et la bascule multi-sociétés (3:05 → 3:45)

**→ Se déconnecter, se reconnecter en `alice@atelier-nord.demo`.**

> « Côté employé, c'est un autre monde. »

**→ Cliquer « Consulter » sur le livret d'accueil.**

> « Chaque document passe par un lien signé à durée limitée, jamais une URL fixe — et ce clic est
> lui-même l'accusé de lecture. »

**→ Se déconnecter, se reconnecter en `nadia@groupe.demo`, cliquer « Changer » → Méridien Gulf.**

> « Nadia travaille pour deux filiales. Logo, couleurs, règles, jours fériés, catalogue matériel :
> tout change, et aucune ligne de code ne connaît le nom d'une société. Ajouter une filiale, c'est
> une insertion en base, pas un déploiement. »

---

### Scène 9 — W2 : le retard escaladé (3:45 → 4:10)

**→ Revenir en `rh@atelier-nord.demo`, basculer sur l'onglet n8n, workflow W2, cliquer
« Test workflow ».**

> « Deuxième workflow : le retard critique, une fois par jour ouvré. La tâche de Diego est en retard
> de huit jours et critique : on n'escalade pas à son propriétaire habituel, on prévient directement
> la RH. Et on ne relance jamais quelqu'un dont la tâche est bloquée par quelqu'un d'autre — on
> prévient le propriétaire de la cause racine, pas la victime. »

---

### Scène 10 — W3, fin de contrat et synthèse IA (4:10 → 4:40)

**→ Ouvrir W3 dans n8n, cliquer « Test workflow ».**

> « Troisième workflow : le bilan à trente jours. »

**→ Basculer sur le Cockpit, carte Satisfaction.**

> « Dernier cas limite : le contrat de Diego se termine avant son questionnaire J+30. Le système ne
> l'envoie pas, et clôt directement son parcours. »

**→ Pointer « Synthèse IA des verbatims ».**

> « Et voici la synthèse des commentaires, produite par un modèle qui tourne en local, gratuit, sans
> compte. Deux garde-fous : elle n'est produite qu'au-dessus d'un seuil de répondants, et les
> commentaires sont anonymisés avant d'être envoyés au modèle. »

---

### Scène 11 — Clôture (4:40 → 4:50)

> « Sous l'interface : un domaine métier pur en TypeScript, sans base de données ni horloge système,
> entièrement testé. L'autorisation est portée par la base elle-même. Et les limites connues sont
> écrites dans le README plutôt que passées sous silence. Merci. »

---

## 3. Les pièges

| Piège | Conséquence | Ce qu'il faut faire |
| --- | --- | --- |
| Lancer W3 avant la scène 3 | Le parcours de Diego se clôt, ses tâches bloquées disparaissent | Respecter l'ordre : W3 en scène 10, jamais avant |
| Oublier de pré-générer la synthèse IA | La carte reste vide ou affiche « pas assez de réponses » | Lancer la route dédiée avant l'enregistrement |
| Refaire une prise sans changer `hireReference` | W1 répond `duplicate` au lieu de `created` | Incrémenter la référence à chaque prise (`-003`, `-004`…) |
| Oublier de noter le `journeyId` de la scène 2 | La scène 6 (report d'arrivée) ne peut pas cibler Nina | Copier la réponse JSON avant d'enchaîner |
| Filmer longtemps après le `db:reset` | Les dates de démonstration glissent | Refaire `db:reset` le jour de l'enregistrement |
| Montrer les emails qui partent | Aucune clé Resend réelle : l'envoi échoue | Ne pas le montrer, ou l'annoncer comme une limite |

## 4. Ce qu'on ne montre pas, et pourquoi

À dire seulement si le jury pose la question — inutile de s'en excuser dans la vidéo :

- **Les emails ne partent pas réellement** : pas de clé Resend dans cet environnement. Le chemin est
  vérifié jusqu'à l'appel réseau réel, rejeté pour authentification.
- **Pas d'agenda réel** : même raison, pas d'identifiants Google.
- **Pas d'écran de réponse au questionnaire** : le lien signé existe, sa destination n'est pas encore
  construite.
- **Les invitations des responsables ne partent pas par email** : elles sont attribuées, seulement
  tracées.

Tout cela est écrit dans les « Limites connues » du README.

## 5. Si la vidéo dépasse 5 minutes

Couper dans cet ordre (du moins grave au plus grave à perdre) :
1. La scène 5 (attribuer/remettre) — la scène 4 a déjà prouvé le regroupement.
2. Réduire la scène 11 à une seule phrase.
3. Fusionner scènes 6 et 7 (report + absence) en une seule, sans repasser par PowerShell pour
   `demo:report` — dire simplement la règle et montrer la ligne dans un terminal déjà ouvert.

Ne jamais couper : les scènes 2, 3, 4, 9, 10 — elles portent, à elles cinq, les cinq cas limites et
les trois workflows exigés par le cahier des charges.
