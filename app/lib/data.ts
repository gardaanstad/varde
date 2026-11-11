export type Status = "planned" | "construction" | "completed";
export const categories = [
  "Samferdsel",
  "Energi",
  "Vann og avløp",
  "Offentlige bygg",
  "Byutvikling",
  "Bolig",
  "Næring",
  "Byrom og park",
] as const;
export type Category = (typeof categories)[number];
export type Point = [number, number];
export type ProjectImage = {
  src: string;
  alt?: string;
  credit?: string;
};
export type ProjectUpdate = {
  id: string;
  title: string;
  body: string;
  date: string;
  images?: ProjectImage[];
  origin?: boolean;
  sourceUrl?: string;
  /** Username of the member whose tip this was. Added on read, never stored. */
  via?: string;
};
export type Project = {
  id: string;
  title: string;
  district: string;
  city: string;
  category: Category;
  status: Status;
  /** Cover photo; empty when the project has none and shows a placeholder. */
  image: string;
  /** Further photos added with the project, after the cover. */
  images?: ProjectImage[];
  imageCredit?: string;
  imageSource?: string;
  description: string;
  website?: string;
  example?: boolean;
  center: Point;
  geometry: Point[];
  geometryType: "area" | "line";
  year: string;
  updated: string;
  /** Set by the server when a moderator adds the project. */
  created?: string;
  comments: number;
  developer: string;
  updates: ProjectUpdate[];
  /**
   * Usernames of members whose approved suggestions created or corrected
   * the project. Added on read from approved suggestions, never stored.
   */
  contributors?: string[];
};
export type Comment = {
  id: string;
  projectId: string;
  /** Optional reference; every comment belongs to the project discussion. */
  updateId?: string;
  author: string;
  text: string;
  date: string;
  votes: number;
  parentId?: string;
};
/** Empty, or an old category tile: the project has no photo of its own. */
export function hasPhoto(project: Pick<Project, "image">) {
  return (
    Boolean(project.image) && !project.image.startsWith("/images/kategori-")
  );
}
function isOriginUpdate(update: ProjectUpdate, projectId: string) {
  return update.origin === true || update.id === `${projectId}-origin`;
}
/** Timeline entries, newest first; historical "Om prosjektet" entries excluded. */
export function getProjectUpdates(project: Project): ProjectUpdate[] {
  return project.updates
    .filter((update) => !isOriginUpdate(update, project.id))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}
/** The project's own photos first, then every distinct photo from its updates. */
export function projectPhotos(project: Project): ProjectImage[] {
  const photos: ProjectImage[] = hasPhoto(project)
    ? [{ src: project.image, alt: project.title, credit: project.imageCredit }]
    : [];
  const more = [
    ...(project.images ?? []),
    ...getProjectUpdates(project).flatMap((update) => update.images ?? []),
  ];
  for (const image of more)
    if (!photos.some((photo) => photo.src === image.src)) photos.push(image);
  return photos;
}
export function projectHref(id: string) {
  return `/prosjekt/${encodeURIComponent(id)}`;
}
/** "District, City", or just the city when there is no separate district. */
export function projectPlace(project: Pick<Project, "district" | "city">) {
  return project.district && project.district !== project.city
    ? `${project.district}, ${project.city}`
    : project.city;
}
/** Stored when a project has no known developer; shown as empty. */
export const unknownDeveloper = "Ikke oppgitt";
export function centroid(points: Point[]): Point {
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
}
/** Older projects predate `created`; their first entry stands in. */
export function projectAddedAt(project: Project) {
  return (
    project.created ??
    project.updates.reduce(
      (first, update) => (update.date < first ? update.date : first),
      project.updated,
    )
  );
}
// Map colours; Leaflet can't read CSS variables. Keep in sync with --color-status-*.
export const statuses: Record<Status, { label: string; color: string }> = {
  planned: { label: "Planlagt", color: "#7383ba" },
  construction: { label: "Under bygging", color: "#d59a42" },
  completed: { label: "Ferdigstilt", color: "#4f9279" },
};
export const statusOrder = Object.keys(statuses) as Status[];
/** Preset views for drawing maps, suggested when entering a project's place. */
export const cities: Record<string, { center: Point; zoom: number }> = {
  Oslo: { center: [59.912, 10.747], zoom: 13 },
  Bergen: { center: [60.391, 5.323], zoom: 13 },
  Trondheim: { center: [63.432, 10.401], zoom: 13 },
  Stavanger: { center: [58.969, 5.738], zoom: 13 },
};
export const presetPlaces = Object.keys(cities);
/** Mainland Norway, south-west and north-east corners. */
export const norwayBounds: [Point, Point] = [
  [57.9, 4.4],
  [71.2, 31.2],
];
export type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};
/** The map's view; `zoom` decides whether alignments show as their dot. */
export type ViewBounds = Bounds & { zoom?: number };
// Below this zoom alignments collapse to a dot halfway along them: wider
// than a county, even long lines are short scribbles.
export const lineDotZoom = 8;
/** The point halfway along a line, so its dot sits on the alignment. */
export function lineMidpoint(points: Point[]): Point {
  if (points.length < 2) return points[0];
  // Longitude shrinks with latitude; this keeps lengths roughly true.
  const scale = Math.cos((points[0][0] * Math.PI) / 180);
  const lengths = points
    .slice(1)
    .map(([lat, lng], index) =>
      Math.hypot(lat - points[index][0], (lng - points[index][1]) * scale),
    );
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    if (remaining <= length && length > 0) {
      const [lat, lng] = points[index];
      const [nextLat, nextLng] = points[index + 1];
      const t = remaining / length;
      return [lat + (nextLat - lat) * t, lng + (nextLng - lng) * t];
    }
    remaining -= length;
  }
  return points[points.length - 1];
}
// Web Mercator, where the map draws its shapes' sides as straight lines.
const mercator = ([lat, lng]: Point): Point => [
  lng,
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];
/**
 * Whether any part of the project as drawn lies inside `bounds`: a corner,
 * a side crossing it, or an area around all of it. Not its bounding box, so
 * a bend or a slanted alignment passing outside doesn't count. Zoomed out,
 * an alignment is its dot.
 */
export function projectInBounds(project: Project, bounds: ViewBounds) {
  const [west, south] = mercator([bounds.south, bounds.west]);
  const [east, north] = mercator([bounds.north, bounds.east]);
  const inside = ([x, y]: Point) =>
    x >= west && x <= east && y >= south && y <= north;
  const line = project.geometryType === "line";
  const dotted = line && bounds.zoom !== undefined && bounds.zoom < lineDotZoom;
  if (!project.geometry.length || dotted)
    return inside(
      mercator(
        project.geometry.length ? lineMidpoint(project.geometry) : project.center,
      ),
    );
  // Zoomed out, an area's dot sits on its centre.
  if (!line && inside(mercator(project.center))) return true;
  const points = project.geometry.map(mercator);
  if (points.some(inside)) return true;
  // Liang–Barsky: whether the side from a to b crosses the view.
  const crosses = ([ax, ay]: Point, [bx, by]: Point) => {
    let from = 0;
    let to = 1;
    const dx = bx - ax;
    const dy = by - ay;
    for (const [p, q] of [
      [-dx, ax - west],
      [dx, east - ax],
      [-dy, ay - south],
      [dy, north - ay],
    ]) {
      if (p === 0) {
        if (q < 0) return false;
      } else if (p < 0) from = Math.max(from, q / p);
      else to = Math.min(to, q / p);
      if (from > to) return false;
    }
    return true;
  };
  const sides = line ? points.length - 1 : points.length;
  for (let side = 0; side < sides; side++)
    if (crosses(points[side], points[(side + 1) % points.length])) return true;
  if (line || points.length < 3) return false;
  // No corner or side in view: either the area holds all of it, or none.
  const [x, y] = [(west + east) / 2, (south + north) / 2];
  let within = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      within = !within;
  }
  return within;
}
const area = (lat: number, lng: number, scale = 1): Point[] => [
  [lat - 0.001 * scale, lng - 0.0017 * scale],
  [lat + 0.0007 * scale, lng - 0.0013 * scale],
  [lat + 0.0011 * scale, lng + 0.0016 * scale],
  [lat - 0.0006 * scale, lng + 0.002 * scale],
];
const base = {
  example: true,
  geometryType: "area" as const,
  year: "2028",
  updated: "2026-09-06T12:00:00",
  comments: 0,
  developer: unknownDeveloper,
  updates: [],
};
export const seedProjects: Project[] = [
  {
    ...base,
    id: "bispevika-sor",
    website: "https://osu.no/prosjekter",
    title: "Bispevika sør",
    district: "Bjørvika",
    city: "Oslo",
    category: "Byutvikling",
    status: "construction",
    image: "/images/bjorvika.jpg",
    imageCredit: "HAV Eiendom · Clemenskvartalet (illustrasjonsfoto)",
    imageSource: "https://haveiendom.no/portefolje/clemenskvartalet/",
    description:
      "Et nytt stykke by ved fjorden. Bispevika sør knytter Bjørvika sammen med Middelalderparken gjennom nye boliger, levende førsteetasjer og åpne møteplasser.\n\nProsjektet legger til rette for et nabolag der det er enkelt å gå og sykle, med grøntområder, serveringssteder og en tilgjengelig havnepromenade.",
    center: [59.9035, 10.7608],
    geometry: area(59.9035, 10.7608, 1.55),
    developer: "Oslo S Utvikling",
    updates: [
      {
        id: "u-byrom",
        title: "Nye byrom tar form",
        body: "Arbeidet med forbindelsene mellom boligkvartalene og havnepromenaden er i gang. De første trærne er satt, og sitteplassene nede ved vannet begynner å tegne seg.\n\nGanglinjene gjennom kvartalene holdes åpne i anleggsperioden, slik at det fortsatt går an å bevege seg mellom fjorden og Middelalderparken.",
        date: "2026-09-06T12:00:00",
        images: [
          {
            src: "/images/park.jpg",
            alt: "Nye sitteplasser og grønt mot fjorden",
          },
          {
            src: "/images/bjorvika.jpg",
            alt: "Havnepromenaden i Bispevika",
            credit: "HAV Eiendom · Clemenskvartalet (illustrasjonsfoto)",
          },
          {
            src: "/images/architecture.jpg",
            alt: "Byrom mellom de nye kvartalene",
          },
        ],
      },
      {
        id: "u-fasader",
        title: "Førsteetasjene åpner mot gata",
        body: "De nederste etasjene får lokaler for servering, handel og fellesfunksjoner. Målet er liv i gatene gjennom hele året, ikke bare i sommersesongen.\n\nFasaden mot promenaden trekkes tilbake i første etasje, slik at det blir mer plass til opphold utenfor.",
        date: "2026-08-21T11:00:00",
        images: [
          {
            src: "/images/architecture.jpg",
            alt: "Førsteetasjer mot gata",
          },
          {
            src: "/images/bjorvika.jpg",
            alt: "Kvartaler mot Bispevika",
            credit: "HAV Eiendom · Clemenskvartalet (illustrasjonsfoto)",
          },
        ],
      },
      {
        id: "u-bygging",
        title: "Byggingen av kvartalene er i gang",
        body: "Grunnarbeidet er ferdig, og de første bærekonstruksjonene er synlige fra havnepromenaden. Gangforbindelsen mot Middelalderparken holdes åpen i anleggsperioden.",
        date: "2026-08-04T09:30:00",
        images: [
          {
            src: "/images/fornebubanen.jpg",
            alt: "Anleggsarbeid i byen",
          },
          {
            src: "/images/railway.jpg",
            alt: "Arbeid langs forbindelsene gjennom området",
          },
        ],
      },
      {
        id: "u-innspill",
        title: "Innspill fra nabolaget",
        body: "På folkemøtet kom det tydelige ønsker om flere sitteplasser ved vannet, bedre sykkelforbindelser og at førsteetasjene ikke blir lukkede fasader.\n\nInnspillene tas med i det videre arbeidet med byrommene og innholdet mot gata.",
        date: "2026-07-08T18:00:00",
        images: [
          {
            src: "/images/park.jpg",
            alt: "Byrom og møteplasser i nabolaget",
          },
        ],
      },
      {
        id: "bispevika-sor-origin",
        title: "Om prosjektet",
        body: "Et nytt stykke by ved fjorden. Bispevika sør knytter Bjørvika sammen med Middelalderparken gjennom nye boliger, levende førsteetasjer og åpne møteplasser.\n\nProsjektet legger til rette for et nabolag der det er enkelt å gå og sykle, med grøntområder, serveringssteder og en tilgjengelig havnepromenade.",
        date: "2026-06-12T10:00:00",
        origin: true,
        images: [
          {
            src: "/images/bjorvika.jpg",
            alt: "Bispevika sør mot fjorden",
            credit: "HAV Eiendom · Clemenskvartalet (illustrasjonsfoto)",
          },
        ],
      },
    ],
  },
  {
    ...base,
    id: "regjeringskvartalet",
    website: "https://www.statsbygg.no/byggeprosjekter/nytt-regjeringskvartal/",
    title: "Nytt regjeringskvartal",
    district: "Hammersborg",
    city: "Oslo",
    category: "Offentlige bygg",
    status: "construction",
    image: "/images/regjeringskvartalet.jpg",
    imageCredit: "Haptic Architects",
    imageSource: "https://hapticarchitects.com/government-headquarters-oslo/",
    description:
      "Regjeringskvartalet samler departementene i et nytt bygningsmiljø rundt Høyblokka. Prosjektet omfatter nye arbeidsplasser, rehabilitering og byrom i hjertet av Oslo.",
    center: [59.9158, 10.7465],
    geometry: area(59.9158, 10.7465, 1.3),
    year: "2030",
    updated: "2026-09-05T10:00:00",
    developer: "Statsbygg",
  },
  {
    ...base,
    id: "follobanen",
    website: "https://www.banenor.no/prosjekter/prosjekter/follobanen/",
    title: "Follobanen",
    district: "Oslo S – Ski",
    city: "Oslo",
    category: "Samferdsel",
    status: "completed",
    image: "/images/railway.jpg",
    description:
      "Dobbeltsporet jernbane mellom Oslo og Ski, med Norges lengste jernbanetunnel. Banen halverer reisetiden og frigjør kapasitet på Østfoldbanen.",
    center: [59.82, 10.8],
    geometry: [
      [59.9105, 10.756],
      [59.88, 10.79],
      [59.83, 10.8],
      [59.77, 10.82],
      [59.7191, 10.8355],
    ],
    geometryType: "line",
    year: "2022",
    updated: "2026-08-18T09:00:00",
    developer: "Bane NOR",
  },
  {
    ...base,
    id: "fornebubanen",
    website: "https://www.fornebubanen.no/",
    title: "Fornebubanen",
    district: "Majorstuen – Fornebu",
    city: "Oslo",
    category: "Samferdsel",
    status: "construction",
    image: "/images/fornebubanen.jpg",
    imageCredit: "L2 Arkitekter og Gottlieb Paludan Architects (illustrasjon)",
    imageSource: "https://www.l2.no/prosjekt/fornebubanen",
    description:
      "Ny T-banestrekning fra Majorstuen via Skøyen og Lysaker til Fornebu, med seks nye stasjoner i tunnel.",
    center: [59.915, 10.665],
    geometry: [
      [59.9297, 10.7155],
      [59.9225, 10.6785],
      [59.9126, 10.638],
      [59.8966, 10.623],
    ],
    geometryType: "line",
    year: "2030",
    updated: "2026-09-04T09:00:00",
    developer: "Oslo kommune og Akershus fylkeskommune",
  },
  {
    ...base,
    id: "vannforsyning-oslo",
    website: "https://www.oslo.kommune.no/vann-og-avlop/ny-vannforsyning-oslo/",
    title: "Ny vannforsyning Oslo",
    district: "Holsfjorden – Huseby",
    city: "Oslo",
    category: "Vann og avløp",
    status: "construction",
    image: "",
    description:
      "Ny drikkevannskilde fra Holsfjorden, med råvannstunnel og vannbehandlingsanlegg på Huseby. Gir Oslo reservevann og forsyningssikkerhet for framtiden.",
    center: [59.955, 10.5],
    geometry: [
      [59.965, 10.32],
      [59.96, 10.45],
      [59.955, 10.56],
      [59.942, 10.665],
    ],
    geometryType: "line",
    year: "2029",
    updated: "2026-08-27T09:00:00",
    developer: "Oslo kommune, Vann- og avløpsetaten",
  },
  {
    ...base,
    id: "nye-aker",
    website: "https://nyeoslouniversitetssykehus.no/",
    title: "Nye Aker sykehus",
    district: "Sinsen",
    city: "Oslo",
    category: "Offentlige bygg",
    status: "construction",
    image: "",
    description:
      "Nytt lokalsykehus og psykisk helsevern på Aker-tomten, som del av utbyggingen av Oslo universitetssykehus.",
    center: [59.9395, 10.7955],
    geometry: area(59.9395, 10.7955, 1.6),
    year: "2030",
    updated: "2026-08-26T09:00:00",
    developer: "Helse Sør-Øst",
  },
  {
    ...base,
    id: "rogfast",
    website: "https://www.vegvesen.no/vegprosjekter/europaveg/e39rogfast/",
    title: "E39 Rogfast",
    district: "Randaberg – Bokn",
    city: "Stavanger",
    category: "Samferdsel",
    status: "construction",
    image: "",
    description:
      "Ferjefri E39 mellom Stavanger og Haugesund gjennom verdens lengste og dypeste undersjøiske vegtunnel.",
    center: [59.12, 5.5],
    geometry: [
      [59.0218, 5.6115],
      [59.06, 5.41],
      [59.15, 5.43],
      [59.226, 5.455],
    ],
    geometryType: "line",
    year: "2033",
    updated: "2026-08-15T09:00:00",
    developer: "Statens vegvesen",
  },
  {
    ...base,
    id: "sotrasambandet",
    website:
      "https://www.vegvesen.no/vegprosjekter/riksveg/rv555sotrasambandet/",
    title: "Sotrasambandet",
    district: "Bergen – Øygarden",
    city: "Bergen",
    category: "Samferdsel",
    status: "construction",
    image: "",
    description:
      "Ny firefelts veg med bru over Langeleiravatnet og tunneler mellom Sotra og Bergen, med egne løsninger for kollektiv, gange og sykkel.",
    center: [60.367, 5.18],
    geometry: [
      [60.356, 5.1],
      [60.367, 5.165],
      [60.372, 5.2],
      [60.365, 5.255],
    ],
    geometryType: "line",
    year: "2027",
    updated: "2026-08-12T09:00:00",
    developer: "Statens vegvesen",
  },
  {
    ...base,
    id: "northern-lights",
    website: "https://norlights.com/",
    title: "Northern Lights",
    district: "Øygarden",
    city: "Bergen",
    category: "Energi",
    status: "completed",
    image: "",
    description:
      "Mottaksanlegg for flytende CO₂ i Øygarden, med rørledning til lagring under havbunnen i Nordsjøen. Del av fangst- og lagringsprosjektet Langskip.",
    center: [60.553, 4.84],
    geometry: area(60.553, 4.84, 2),
    year: "2024",
    updated: "2026-08-10T09:00:00",
    developer: "Equinor, Shell og TotalEnergies",
  },
  {
    ...base,
    id: "halogalandsbrua",
    website:
      "https://www.vegvesen.no/vegprosjekter/europaveg/e6halogalandsbrua/",
    title: "Hålogalandsbrua",
    district: "Rombaksfjorden",
    city: "Narvik",
    category: "Samferdsel",
    status: "completed",
    image: "",
    description:
      "Hengebru på E6 over Rombaksfjorden med 1145 meter hovedspenn. Brua kortet ned vegen rundt fjorden med rundt 18 kilometer.",
    center: [68.451, 17.525],
    geometry: [
      [68.4425, 17.532],
      [68.4505, 17.5255],
      [68.46, 17.5185],
    ],
    geometryType: "line",
    year: "2018",
    updated: "2026-07-30T09:00:00",
    developer: "Statens vegvesen",
  },
  {
    ...base,
    id: "gronlikaia",
    website: "https://haveiendom.no/gronlikaia/",
    title: "Grønlikaia",
    district: "Gamle Oslo",
    city: "Oslo",
    category: "Byutvikling",
    status: "planned",
    image: "/images/bjorvika.jpg",
    description:
      "Et tidligere havneområde åpnes for byen. Planene for Grønlikaia utforsker et nytt nabolag med boliger, arbeidsplasser og nærhet til fjorden.",
    center: [59.8958, 10.7618],
    geometry: area(59.8958, 10.7618, 2),
    year: "2035",
    updated: "2026-09-03T09:00:00",
    developer: "HAV Eiendom",
  },
  {
    ...base,
    id: "middelalderparken",
    website: "https://www.oslo.kommune.no/slik-bygger-vi-oslo/middelalderbyen",
    title: "Nye Middelalderparken",
    district: "Gamle Oslo",
    city: "Oslo",
    category: "Byrom og park",
    status: "completed",
    image: "/images/park.jpg",
    description:
      "Et sammenhengende parklandskap med rom for opphold, aktivitet og byens historie. Nye gangforbindelser gjør parken til en grønn møteplass mellom Gamlebyen og Bjørvika.",
    center: [59.9055, 10.7685],
    geometry: area(59.9055, 10.7685, 1.2),
    year: "2025",
    updated: "2026-09-02T08:00:00",
    developer: "Oslo kommune",
  },
  {
    ...base,
    id: "oslo-horisont",
    website: "https://www.oslohorisont.no/",
    title: "Oslo Horisont",
    district: "Vaterland",
    city: "Oslo",
    category: "Næring",
    status: "planned",
    image: "/images/architecture.jpg",
    description:
      "Et forslag til utvikling av området ved Oslo S, med nye arbeidsplasser og et mer tilgjengelig bymiljø rundt kollektivknutepunktet.",
    center: [59.9124, 10.7565],
    geometry: area(59.9124, 10.7565),
    year: "2030",
    updated: "2026-09-01T09:00:00",
  },
  {
    ...base,
    id: "filipstad",
    website:
      "https://www.oslo.kommune.no/etater-foretak-og-ombud/filipstad-infrastruktur",
    title: "Filipstad",
    district: "Frogner",
    city: "Oslo",
    category: "Byutvikling",
    status: "planned",
    image: "/images/bjorvika.jpg",
    description:
      "Et nytt fjordnært byområde på den tidligere godshavnen. Planen omfatter boliger, næringsarealer, park og en forlengelse av havnepromenaden.",
    center: [59.9068, 10.7143],
    geometry: area(59.9068, 10.7143, 2.2),
    year: "2035",
    updated: "2026-08-30T09:00:00",
  },
  {
    ...base,
    id: "tullinkvartalet",
    website: "https://www.landskaperiet.no/prosjekter/tullinkvartalet",
    title: "Tullinkvartalet",
    district: "Sentrum",
    city: "Oslo",
    category: "Næring",
    status: "completed",
    image: "/images/architecture.jpg",
    description:
      "Nye og gamle bygninger bindes sammen med passasjer, møteplasser og lokaler som åpner kvartalet mot byen.",
    center: [59.9183, 10.737],
    geometry: area(59.9183, 10.737, 0.8),
    year: "2025",
    updated: "2026-08-28T09:00:00",
  },
  {
    ...base,
    id: "storgata",
    website:
      "https://magasin.oslo.kommune.no/byplan/stor-forandring-i-nye-storgata",
    title: "Storgata og nye gaterom",
    district: "Grünerløkka",
    city: "Oslo",
    category: "Samferdsel",
    status: "completed",
    image: "/images/railway.jpg",
    description:
      "Oppgraderte holdeplasser, bedre fremkommelighet og mer plass for gående langs en av byens viktigste kollektivgater.",
    center: [59.9205, 10.7575],
    geometry: [
      [59.916, 10.753],
      [59.9205, 10.7575],
      [59.924, 10.76],
    ],
    geometryType: "line",
    year: "2025",
    updated: "2026-08-25T09:00:00",
  },
  {
    ...base,
    id: "ensjo",
    website: "https://www.oslo.kommune.no/slik-bygger-vi-oslo/ensjobyen",
    title: "Ensjøbyen",
    district: "Ensjø",
    city: "Oslo",
    category: "Bolig",
    status: "construction",
    image: "/images/architecture.jpg",
    description:
      "Fra bilby til boligby. Nye kvartaler, grønne drag og åpne bekker skaper et variert nabolag på Ensjø.",
    center: [59.9165, 10.7905],
    geometry: area(59.9165, 10.7905, 1.8),
    year: "2028",
    updated: "2026-08-24T09:00:00",
  },
  {
    ...base,
    id: "akerselva",
    website:
      "https://www.oslo.kommune.no/kunngjoringer/horing-av-arbeid-med-forvaltningsplan-for-akerselva-miljopark/",
    title: "Akerselva elvepark",
    district: "Grünerløkka",
    city: "Oslo",
    category: "Byrom og park",
    status: "planned",
    image: "/images/park.jpg",
    description:
      "Bedre stier, nye sitteplasser og mer plass til naturen langs elva.",
    center: [59.927, 10.753],
    geometry: [
      [59.923, 10.753],
      [59.926, 10.756],
      [59.929, 10.753],
      [59.932, 10.756],
    ],
    geometryType: "line",
    year: "2027",
    updated: "2026-08-22T09:00:00",
  },
  {
    ...base,
    id: "skoyen",
    website:
      "https://www.oslo.kommune.no/slik-bygger-vi-oslo/fjordbyen-vest/skoyen",
    title: "Skøyen stasjonsområde",
    district: "Skøyen",
    city: "Oslo",
    category: "Bolig",
    status: "planned",
    image: "/images/architecture.jpg",
    description:
      "Utvikling rundt et sentralt kollektivknutepunkt, med nye boliger og bedre forbindelser mellom nabolagene.",
    center: [59.922, 10.682],
    geometry: area(59.922, 10.682, 1.4),
    year: "2032",
    updated: "2026-08-20T09:00:00",
  },
  {
    ...base,
    id: "dokkeomradet",
    website: "https://www.dokken.no/",
    title: "Dokken",
    district: "Bergenhus",
    city: "Bergen",
    category: "Byutvikling",
    status: "planned",
    image: "/images/bjorvika.jpg",
    description:
      "Havneområdet blir en ny del av Bergen med byliv, sjøkontakt og møteplasser.",
    center: [60.384, 5.315],
    geometry: area(60.384, 5.315, 2),
    year: "2035",
  },
  {
    ...base,
    id: "bybanen",
    website:
      "https://www.bergen.kommune.no/hvaskjer/tema/reguleringsplaner-for-bybanen",
    title: "Bybanen til Åsane",
    district: "Sentrum – Åsane",
    city: "Bergen",
    category: "Samferdsel",
    status: "planned",
    image: "/images/railway.jpg",
    description:
      "Videre utvikling av Bergens kollektivnett med nye forbindelser nordover.",
    center: [60.398, 5.323],
    geometry: [
      [60.391, 5.326],
      [60.398, 5.323],
      [60.414, 5.32],
    ],
    geometryType: "line",
    year: "2035",
  },
  {
    ...base,
    id: "nyhavna",
    website:
      "https://trondheim.kommune.no/tema/bygg-kart-og-eiendom/arealplaner/kommuneplanens-arealdeldelplaner/kommunedelplan-nyhavna-k20110005/",
    title: "Nyhavna",
    district: "Nyhavna",
    city: "Trondheim",
    category: "Byutvikling",
    status: "planned",
    image: "/images/bjorvika.jpg",
    description:
      "Et havneområde med industrihistorie får nye muligheter for boliger, kultur og byliv langs vannet.",
    center: [63.441, 10.418],
    geometry: area(63.441, 10.418, 2),
    year: "2035",
  },
  {
    ...base,
    id: "paradis",
    website: "https://www.stavanger.kommune.no/paradis",
    title: "Paradis",
    district: "Hillevåg",
    city: "Stavanger",
    category: "Bolig",
    status: "construction",
    image: "/images/architecture.jpg",
    description:
      "Et nytt nabolag ved kollektivknutepunktet, med boliger, arbeidsplasser og grøntområder.",
    center: [58.956, 5.74],
    geometry: area(58.956, 5.74, 1.7),
    year: "2028",
  },
];
export const seedComments: Comment[] = [
  {
    id: "c1",
    projectId: "bispevika-sor",
    updateId: "u-byrom",
    author: "byvandrer",
    text: "Veldig fint at promenaden blir sammenhengende. Håper det også blir noen gode steder å sitte helt nede ved vannet!",
    date: "2026-09-06T14:30:00",
    votes: 12,
  },
  {
    id: "c2",
    projectId: "bispevika-sor",
    updateId: "u-byrom",
    author: "arkitekturinteressert",
    text: "Enig! Førsteetasjene blir avgjørende for hvor levende dette området blir gjennom hele året.",
    date: "2026-09-06T16:00:00",
    votes: 5,
    parentId: "c1",
  },
  {
    id: "c3",
    projectId: "bispevika-sor",
    updateId: "u-byrom",
    author: "oslo_på_sykkel",
    text: "Spennende å følge utviklingen her. Tok turen forbi i helgen, og det er allerede mye mer liv mellom byggene.",
    date: "2026-09-07T08:00:00",
    votes: 8,
  },
  {
    id: "c4",
    projectId: "bispevika-sor",
    updateId: "u-fasader",
    author: "byvandrer",
    text: "Ikke bare restauranter, takk. Et bakeri, en dagligvare og et sted å sitte inne på vinterstid ville gjort underverker.",
    date: "2026-08-22T09:15:00",
    votes: 14,
  },
  {
    id: "c5",
    projectId: "bispevika-sor",
    updateId: "u-bygging",
    author: "oslo_på_sykkel",
    text: "Forstår at det blir anlegg en stund, men fint at gangveien mot parken holdes åpen. Takk for det.",
    date: "2026-08-05T07:40:00",
    votes: 9,
  },
  {
    id: "c6",
    projectId: "bispevika-sor",
    updateId: "u-innspill",
    author: "oslo_på_sykkel",
    text: "Bra at det kommer et folkemøte. Sykkelforbindelsen mot Gamlebyen må prioriteres – i dag er det et hull i nettet her.",
    date: "2026-07-09T12:20:00",
    votes: 11,
  },
  {
    id: "c7",
    projectId: "bispevika-sor",
    updateId: "bispevika-sor-origin",
    author: "arkitekturinteressert",
    text: "Ser frem til at Bispevika blir et sted man faktisk vil være, ikke bare gå gjennom. Promenaden vestover i Bjørvika viser at det er mulig.",
    date: "2026-06-14T19:05:00",
    votes: 7,
  },
];
const nbMonthsShort = [
  "jan.",
  "feb.",
  "mars",
  "apr.",
  "mai",
  "juni",
  "juli",
  "aug.",
  "sep.",
  "okt.",
  "nov.",
  "des.",
];
function dateParts(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}
export function formatDate(date: string) {
  const { month, day } = dateParts(date);
  return `${day}. ${nbMonthsShort[month - 1]}`;
}
export function formatDateYear(date: string) {
  const { year, month, day } = dateParts(date);
  return `${day}. ${nbMonthsShort[month - 1]} ${year}`;
}

const relativeUnits = [
  { seconds: 31_557_600, one: "år", many: "år" },
  { seconds: 2_629_800, one: "måned", many: "måneder" },
  { seconds: 604_800, one: "uke", many: "uker" },
  { seconds: 86_400, one: "dag", many: "dager" },
  { seconds: 3_600, one: "time", many: "timer" },
  { seconds: 60, one: "minutt", many: "minutter" },
];
export function formatRelative(date: string, now: number) {
  const elapsed = Math.max(0, (now - Date.parse(date)) / 1000);
  for (const unit of relativeUnits) {
    const count = Math.floor(elapsed / unit.seconds);
    if (count < 1) continue;
    if (unit.one === "dag" && count === 1) return "i går";
    return `for ${count} ${count === 1 ? unit.one : unit.many} siden`;
  }
  return "nå nettopp";
}
// Relative times read best while recent; past this, a date is clearer.
export const relativeTimeLimit = 30 * 86_400_000;
