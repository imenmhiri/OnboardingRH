import type { SatisfactionSummaryRequest } from '@/application/ports/satisfaction-summarizer';

/**
 * Consignes communes à tous les fournisseurs de synthèse. Le modèle ne voit
 * que des commentaires déjà anonymisés (`domain/privacy/anonymize-comment`),
 * mais la consigne reste défensive : un identifiant qui aurait survécu à la
 * rédaction ne doit jamais être répété.
 */
export const SUMMARY_SYSTEM_PROMPT = `Tu resumes des commentaires de satisfaction anonymises, recueillis aupres d'un
groupe de plusieurs personnes dans le cadre d'une integration professionnelle.

Regles strictes :
- Les commentaires fournis sont deja anonymises (noms, emails, sites remplaces
  par des mentions entre crochets comme [personne] ou [email]). Ne tente
  jamais de deviner ou de reconstituer une identite a partir du contexte.
  Si un element du texte ressemble malgre tout a un nom propre, un email ou
  un identifiant precis, ne le reprends jamais dans ta reponse.
- Ne cite aucun commentaire mot pour mot ; degage seulement les themes
  recurrents et les points de friction communs a plusieurs personnes.
- Ne formule jamais une phrase qui pourrait passer pour un fait etabli sur
  un individu precis ; ta reponse decrit toujours une tendance de groupe.
- Reste factuel, concis (5 phrases maximum), et en francais.
- Termine implicitement ta reponse comme un resume agrege, jamais comme une
  citation individuelle.`;

export function buildSummaryUserContent(request: SatisfactionSummaryRequest): string {
  const list = request.anonymizedComments.map((comment, index) => `${index + 1}. ${comment}`).join('\n');
  return `Groupe : ${request.groupLabel}\nCommentaires anonymises (${request.anonymizedComments.length}) :\n${list}`;
}
