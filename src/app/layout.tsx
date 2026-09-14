import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OnboardingRH',
  description: "Parcours d'intégration multi-sociétés : RH, manager, IT et employé.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-contrast"
        >
          Aller au contenu principal
        </a>
        {children}
      </body>
    </html>
  );
}
