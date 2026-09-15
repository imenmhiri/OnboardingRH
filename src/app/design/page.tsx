import { CompanyBrand } from '@/components/company-brand';
import { DesignGallery } from '@/components/design-gallery';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status';
import { brandContrastRatios, type CompanyBranding } from '@/lib/branding';
import { meetsAA } from '@/lib/color';

export const metadata = { title: 'Design system — OnboardingRH' };

/**
 * Page interne : elle existe pour que la direction artistique se regarde, et
 * pour que le contraste se verifie sur deux marques opposees plutot que sur une
 * seule bien choisie.
 */
const COMPANIES: readonly CompanyBranding[] = [
  { name: 'Atelier Nord', primary: 'oklch(0.48 0.16 264)', accent: 'oklch(0.74 0.13 162)', logoUrl: null },
  // Marque volontairement pale : c'est le cas qui casse un texte blanc.
  { name: 'Méridien Gulf', primary: '#f6d55c', accent: '#0d9488', logoUrl: null },
];

function Palette({ branding }: { readonly branding: CompanyBranding }) {
  const ratios = brandContrastRatios(branding);
  const worst = Math.min(ratios.onBrand, ratios.onSoftLight, ratios.onSoftDark);
  return (
    <Card>
      <CardHeader
        title={branding.name}
        description="Marque injectée en variables CSS depuis l’enregistrement société."
        action={
          <StatusBadge
            tone={meetsAA(worst) ? 'success' : 'danger'}
            label={`Contraste minimal ${worst.toFixed(2)}:1`}
          />
        }
      />
      <CardBody className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-[var(--radius)] bg-brand px-4 py-3 text-brand-text">
          Texte sur la marque
        </div>
        <div className="flex items-center gap-2 rounded-[var(--radius)] bg-brand-soft px-4 py-3 text-brand-soft-text">
          Fond tamisé
        </div>
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-surface-sunken px-4 py-3 text-text-muted">
          Surface neutre
        </div>
      </CardBody>
    </Card>
  );
}

export default function DesignPage() {
  return (
    <main id="contenu" className="mx-auto max-w-5xl space-y-12 px-6 py-12">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-text-subtle">Design system</p>
        <h1 className="max-w-2xl font-display text-4xl leading-tight tracking-tight text-text">
          Un même vocabulaire visuel, deux marques, aucune couleur écrite dans un composant.
        </h1>
        <p className="max-w-2xl text-lg text-text-muted">
          Chaque bloc ci-dessous est rendu deux fois, sous deux identités de société opposées. Le
          contraste du texte sur la marque est calculé, pas estimé.
        </p>
      </header>

      {COMPANIES.map((branding) => (
        <CompanyBrand key={branding.name} branding={branding} className="space-y-6">
          <Palette branding={branding} />
          <DesignGallery />
        </CompanyBrand>
      ))}
    </main>
  );
}
