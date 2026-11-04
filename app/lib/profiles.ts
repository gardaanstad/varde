export type Profile = {
  username: string;
  bio: string;
  location: string;
  joined: string;
  tone: "sage" | "clay" | "blue";
  example?: boolean;
};

// Illustrative profiles belong only to seeded comments.
const exampleNeighbor: Profile = {
  username: "nabolagsvenn",
  bio: "Nysgjerrig på hvordan byen vår utvikler seg. Glad i gode møteplasser og grønne nabolag.",
  location: "Oslo",
  joined: "2026-08-01",
  tone: "sage",
};

const profiles: Profile[] = [
  exampleNeighbor,
  {
    username: "byvandrer",
    bio: "Oppdager byen til fots. Opptatt av livet mellom husene, åpne byrom og en fjord for alle.",
    location: "Bjørvika, Oslo",
    joined: "2025-11-12",
    tone: "sage",
  },
  {
    username: "arkitekturinteressert",
    bio: "Følger arkitektur og byutvikling. Har et ekstra godt øye til førsteetasjer som gir noe tilbake til gata.",
    location: "Gamle Oslo, Oslo",
    joined: "2026-02-18",
    tone: "clay",
  },
  {
    username: "oslo_på_sykkel",
    bio: "Ser byen fra sykkelsetet. Engasjert i tryggere sykkelveier, grøntområder og gode forbindelser.",
    location: "Grünerløkka, Oslo",
    joined: "2026-04-09",
    tone: "blue",
  },
];

export function getSeedProfile(username: string): Profile | null {
  const profile = profiles.find((profile) => profile.username === username);
  return profile ? { ...profile, example: true } : null;
}

export function getProfile(username: string): Profile {
  return (
    getSeedProfile(username) ?? {
      username,
      bio: "",
      location: "",
      joined: "",
      tone: "sage",
    }
  );
}

/** The signed-in account's own profile, read from its session. */
export function accountProfile(user: {
  username: string;
  bio?: string | null;
  location?: string | null;
  createdAt: Date | string;
}): Profile {
  return {
    username: user.username,
    bio: user.bio || "",
    location: user.location || "",
    joined: new Date(user.createdAt).toISOString(),
    tone: "sage",
  };
}

export function profileHref(username: string) {
  return `/profil/${encodeURIComponent(username)}`;
}
