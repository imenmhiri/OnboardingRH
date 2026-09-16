import { readableTextOn, toHex } from '@/lib/color';
import type { CompanyBranding } from '@/lib/branding';

/**
 * Habillage commun aux cinq gabarits transactionnels. Une societe sans logo
 * (les deux societes de demo n'en ont pas) retombe sur son nom affiche en
 * texte dans le bandeau de marque : le gabarit reste presentable sans image.
 */

export interface EmailContentBlock {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly cta?: { readonly label: string; readonly url: string };
  readonly footerNote: string;
}

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmailHtml(subject: string, branding: CompanyBranding, block: EmailContentBlock): string {
  const brandHex = toHex(branding.primary);
  const brandTextHex = readableTextOn(brandHex);

  const brandMark = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.name)}" height="32" style="display:block;border:0;outline:none;" />`
    : `<span style="font-size:18px;font-weight:700;color:${brandTextHex};">${escapeHtml(branding.name)}</span>`;

  const paragraphsHtml = block.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#111827;">${escapeHtml(paragraph)}</p>`)
    .join('\n');

  const ctaHtml = block.cta
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(block.cta.url)}" style="display:inline-block;background:${brandHex};color:${brandTextHex};text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">${escapeHtml(block.cta.label)}</a></p>`
    : '';

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial, Helvetica, sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(subject)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:${brandHex};padding:20px 24px;">${brandMark}</td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(block.heading)}</h1>
                ${paragraphsHtml}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">${escapeHtml(block.footerNote)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderEmailText(block: EmailContentBlock): string {
  const lines = [block.heading, '', ...block.paragraphs];
  if (block.cta) {
    lines.push('', `${block.cta.label} : ${block.cta.url}`);
  }
  lines.push('', block.footerNote);
  return lines.join('\n');
}

export function renderEmail(subject: string, branding: CompanyBranding, block: EmailContentBlock): RenderedEmail {
  return {
    subject,
    html: renderEmailHtml(subject, branding, block),
    text: renderEmailText(block),
  };
}

export function formatFrenchDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const formatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return formatter.format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
}
