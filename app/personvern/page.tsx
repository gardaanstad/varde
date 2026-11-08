import type { ReactNode } from "react";
import AuthShell from "../components/auth-shell";
export const metadata = { title: "Personvern · Varde" };
const contact = "gardaanstad@gmail.com";
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">{children}</p>
    </section>
  );
}
export default function PrivacyPage() {
  return (
    <AuthShell>
      <h1 className="text-2xl leading-tight font-semibold tracking-tight text-ink">
        Personvern
      </h1>
      <Section title="Hva vi lagrer">
        Navn, e-post og profilbilde fra Google-kontoen din, brukt kun til
        innlogging og aldri vist offentlig. Brukernavn, bio, sted, kommentarer,
        stemmer, prosjektene du følger og når du sist åpnet hvert av dem.
        Innloggingsøkter med IP-adresse og nettlesertype.
      </Section>
      <Section title="Hvorfor">
        For å drive tjenesten du har registrert deg for. Vi bruker ingen
        analyse, sporing eller reklame, og selger ikke data.
      </Section>
      <Section title="Informasjonskapsler">
        Kun én nødvendig informasjonskapsel som holder deg innlogget.
      </Section>
      <Section title="Tredjeparter">
        Vercel (drift), Turso (database) og Google (innlogging). Kartet lastes
        fra Esri og OpenStreetMap, som ser IP-adressen din.
      </Section>
      <Section title="Sletting og rettigheter">
        Du kan slette kontoen din under kontoinnstillinger. Da slettes
        kontoen, kommentarene, stemmene og prosjektene du følger. Du har
        rett til innsyn, retting og sletting, og kan klage til Datatilsynet.
      </Section>
      <Section title="Kontakt">
        <a href={`mailto:${contact}`} className="text-accent underline">
          {contact}
        </a>
      </Section>
    </AuthShell>
  );
}
