export default function HomePage() {
  return (
    <main id="contenu" className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm font-medium tracking-wide text-text-muted uppercase">OnboardingRH</p>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">
        Le parcours d&apos;intégration, de l&apos;embauche validée au J+30.
      </h1>
      <p className="text-lg text-text-muted text-pretty">
        Socle technique en place. Les quatre surfaces — créateur de parcours, portail employé,
        cockpit RH et gestion du matériel — arrivent ticket par ticket.
      </p>
    </main>
  );
}
