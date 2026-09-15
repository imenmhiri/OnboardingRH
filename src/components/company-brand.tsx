import type { ReactNode } from 'react';
import { brandVariables, type CompanyBranding } from '@/lib/branding';

/**
 * Injecte la marque d'une societe sous forme de variables CSS. C'est le seul
 * point de contact entre l'enregistrement societe et l'interface : aucun
 * composant ne nomme de couleur, donc accueillir une filiale reste un INSERT.
 */
export function CompanyBrand({
  branding,
  children,
  className,
}: {
  readonly branding: CompanyBranding;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div style={brandVariables(branding)} className={className}>
      {children}
    </div>
  );
}
