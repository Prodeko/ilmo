/**
 * Creates realistic-looking demo data for showing Ilmo off: guild events with
 * real names, descriptions, quotas and questions, and registrations with
 * plausible Finnish names and answers. Unlike create-fake-data it doesn't use
 * random placeholder text, and it covers every state an event can be in:
 * signup open (with full quotas, overflow spots and a queue), signup opening
 * later, signup closed, and a draft. Dates are relative to today.
 *
 * Usage: pnpm db create-demo-data [admin username, default "testuser"]
 *
 * Safe to run again: organizations and categories are reused and events that
 * already exist are skipped. Remove everything with pnpm db clean-fake-data.
 *
 * The script only depends on pg and the database schema, so it can be moved
 * to another branch on its own.
 */
import { Pool, PoolClient } from "pg"

if (process.env.NODE_ENV !== "development") {
  console.error("This script should only be ran in development!")
  process.exit(0)
}

type Localized = { fi: string; en: string }
type Person = { firstName: string; lastName: string; email: string }
type Answer = string | string[] | undefined

type QuestionDef = {
  type: "TEXT" | "RADIO" | "CHECKBOX"
  label: Localized
  isRequired?: boolean
  options?: Localized[]
  // Answers are given by index into options for RADIO and CHECKBOX
  answer: (person: Person, random: () => number) => Answer | number | number[]
}

type QuotaDef = { title: Localized; size: number; registrations: number }

type EventDef = {
  name: Localized
  description: Localized
  location: string
  organization: string
  category: string
  // [days from today, hour, minute]
  registrationStart: [number, number, number?]
  registrationEnd: [number, number, number?]
  eventStart: [number, number, number?]
  eventEnd: [number, number, number?]
  quotas: QuotaDef[]
  openQuotaSize?: number
  questions?: QuestionDef[]
  isHighlighted?: boolean
  isDraft?: boolean
}

/******************************************************************************/
// Organizations and categories

const organizations = [
  { slug: "prodeko", name: "Prodeko", color: "#002e7d" },
  {
    slug: "prodeko-urheilukerho",
    name: "Prodekon urheilukerho",
    color: "#2e7d32",
  },
  {
    slug: "prodeko-kulttuurikerho",
    name: "Prodekon kulttuurikerho",
    color: "#8e24aa",
  },
]

const categories: Record<
  string,
  {
    organization: string
    name: Localized
    description: Localized
    color: string
  }
> = {
  sitsit: {
    organization: "prodeko",
    name: { fi: "Sitsit", en: "Sitsit" },
    description: {
      fi: "Laulua, ruokaa ja juomaa pitkien pöytien ääressä.",
      en: "Singing, food and drinks at long tables.",
    },
    color: "#c62828",
  },
  juhlat: {
    organization: "prodeko",
    name: { fi: "Juhlat", en: "Parties" },
    description: {
      fi: "Killan suuret juhlat ympäri vuoden.",
      en: "The guild's big celebrations throughout the year.",
    },
    color: "#f9a825",
  },
  excursiot: {
    organization: "prodeko",
    name: { fi: "Excursiot", en: "Excursions" },
    description: {
      fi: "Matkoja ja vierailuja Otaniemen ulkopuolelle.",
      en: "Trips and visits outside Otaniemi.",
    },
    color: "#00838f",
  },
  yritys: {
    organization: "prodeko",
    name: { fi: "Yritysyhteistyö", en: "Corporate relations" },
    description: {
      fi: "Yritysvierailuja, case-iltoja ja rekrytapahtumia.",
      en: "Company visits, case evenings and recruiting events.",
    },
    color: "#37474f",
  },
  vapaaAika: {
    organization: "prodeko",
    name: { fi: "Vapaa-aika", en: "Free time" },
    description: {
      fi: "Rentoa yhdessäoloa ilman sen kummempaa ohjelmaa.",
      en: "Relaxed get-togethers without much of a programme.",
    },
    color: "#6d4c41",
  },
  urheilu: {
    organization: "prodeko-urheilukerho",
    name: { fi: "Urheilu", en: "Sports" },
    description: {
      fi: "Turnauksia, vuorojen täyttöä ja hikeä.",
      en: "Tournaments, weekly sports and sweat.",
    },
    color: "#2e7d32",
  },
  kulttuuri: {
    organization: "prodeko-kulttuurikerho",
    name: { fi: "Kulttuuri", en: "Culture" },
    description: {
      fi: "Teatteria, museoita ja konsertteja porukalla.",
      en: "Theatre, museums and concerts together.",
    },
    color: "#8e24aa",
  },
}

/******************************************************************************/
// Questions

const yes = { fi: "Kyllä", en: "Yes" }
const no = { fi: "Ei", en: "No" }

// Picks an index, the first options being the most likely
const pickWeighted = (random: () => number, weights: number[]) => {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = random() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r < 0) return i
  }
  return weights.length - 1
}

const telegram: QuestionDef = {
  type: "TEXT",
  label: { fi: "Telegram", en: "Telegram" },
  isRequired: true,
  answer: (p) => `@${ascii(p.firstName)}_${ascii(p.lastName).slice(0, 3)}`,
}

const alcohol: QuestionDef = {
  type: "RADIO",
  label: { fi: "Alkoholivalinta", en: "Alcohol preference" },
  isRequired: true,
  options: [
    { fi: "Holillinen", en: "Alcoholic" },
    { fi: "Holiton", en: "Non-alcoholic" },
    { fi: "Holittomat shotit", en: "Non-alcoholic shots" },
  ],
  answer: (_, random) => pickWeighted(random, [7, 2, 1]),
}

const specialDiet: QuestionDef = {
  type: "CHECKBOX",
  label: { fi: "Erityisruokavalio", en: "Special diet" },
  options: [
    { fi: "Kasvis", en: "Vegetarian" },
    { fi: "Laktoositon", en: "Lactose-free" },
    { fi: "Gluteeniton", en: "Gluten-free" },
    { fi: "Vegaani", en: "Vegan" },
  ],
  answer: (_, random) => {
    const r = random()
    if (r < 0.65) return []
    if (r < 0.95) return [pickWeighted(random, [4, 3, 1, 2])]
    return [1, 2]
  },
}

const otherDiet: QuestionDef = {
  type: "TEXT",
  label: {
    fi: "Muu erityisruokavalio tai allergia",
    en: "Other special diet or allergy",
  },
  answer: (_, random) =>
    random() < 0.12
      ? ["Pähkinäallergia", "Kalaton", "Ei sieniä", "Selleriallergia"][
          Math.floor(random() * 4)
        ]
      : undefined,
}

const seating: QuestionDef = {
  type: "TEXT",
  label: { fi: "Paikkatoiveet", en: "Seating preferences" },
  answer: (_, random) =>
    random() < 0.3
      ? `${firstNames[Math.floor(random() * firstNames.length)]}n viereen, kiitos!`
      : undefined,
}

const avec: QuestionDef = {
  type: "TEXT",
  label: { fi: "Avec", en: "Avec" },
  answer: (_, random) =>
    random() < 0.35
      ? `${firstNames[Math.floor(random() * firstNames.length)]} ${
          lastNames[Math.floor(random() * lastNames.length)]
        }`
      : undefined,
}

const bindingRegistration: QuestionDef = {
  type: "CHECKBOX",
  label: { fi: "Sitova ilmoittautuminen", en: "Binding registration" },
  isRequired: true,
  options: [
    {
      fi: "Ymmärrän, että osallistumismaksu muuttuu sitovaksi ilmoittautumisen päätyttyä",
      en: "I understand that the participation fee becomes binding once registration closes",
    },
  ],
  answer: () => [0],
}

const sitsitQuestions = [
  telegram,
  alcohol,
  specialDiet,
  otherDiet,
  seating,
  bindingRegistration,
]

/******************************************************************************/
// Events

const yearGroupQuotas = (sizes: number[], registrations: number[]) =>
  ["I", "II", "III", "IV", "N"].map((title, i) => ({
    title: { fi: title, en: title },
    size: sizes[i],
    registrations: registrations[i],
  }))

const openQuota = (size: number, registrations: number): QuotaDef => ({
  title: { fi: "Avoin kiintiö", en: "Open quota" },
  size,
  registrations,
})

const events: EventDef[] = [
  // Signup open now
  {
    name: { fi: "Fuksisitsit", en: "Freshman sitsit" },
    description: {
      fi: "Syksyn perinteiset fuksisitsit! Luvassa kolmen ruokalajin illallinen, laulua laulukirjan kera ja tutoreiden yllätysohjelmaa. Pukukoodi: cocktail ja haalarit. Fuksit ovat etusijalla, vanhemmille opiskelijoille on oma kiintiönsä.",
      en: "The traditional freshman sitsit! A three-course dinner, singing from the songbook and a surprise programme by the tutors. Dress code: cocktail and overalls. Freshmen come first, older students have their own quota.",
    },
    location: "Dipoli, Otakaari 24",
    organization: "prodeko",
    category: "sitsit",
    registrationStart: [-3, 12],
    registrationEnd: [4, 23, 59],
    eventStart: [8, 18],
    eventEnd: [9, 2],
    quotas: [
      {
        title: { fi: "Fuksit (I)", en: "Freshmen (I)" },
        size: 60,
        registrations: 47,
      },
      {
        title: { fi: "Vanhemmat (II–N)", en: "Older students (II–N)" },
        size: 20,
        registrations: 28,
      },
    ],
    openQuotaSize: 6,
    questions: sitsitQuestions,
  },
  {
    name: { fi: "Excursio Tallinnaan", en: "Excursion to Tallinn" },
    description: {
      fi: "Kahden päivän excursio Tallinnaan: yritysvierailut Telliskivessä, yhteinen illallinen vanhassakaupungissa ja paluu seuraavana iltana. Hinta sisältää laivamatkat, hostellin ja illallisen.",
      en: "A two-day excursion to Tallinn: company visits in Telliskivi, a dinner in the old town and the trip back the next evening. The price includes the ferries, a hostel and the dinner.",
    },
    location: "Länsisatama, Terminaali 2, Helsinki",
    organization: "prodeko",
    category: "excursiot",
    registrationStart: [-1, 12],
    registrationEnd: [9, 23, 59],
    eventStart: [20, 8],
    eventEnd: [21, 20],
    quotas: yearGroupQuotas([10, 10, 10, 10, 10], [6, 10, 4, 3, 2]),
    questions: [
      specialDiet,
      otherDiet,
      {
        type: "TEXT",
        label: { fi: "Huonetoive", en: "Room preference" },
        answer: (_, random) =>
          random() < 0.4
            ? `Samaan huoneeseen ${
                firstNames[Math.floor(random() * firstNames.length)]
              }n kanssa`
            : undefined,
      },
      bindingRegistration,
    ],
  },
  {
    name: { fi: "Saunailta", en: "Sauna evening" },
    description: {
      fi: "Rantasauna lämpiää ja grilli kuumenee. Ota mukaan pyyhe ja omat eväät, killan puolesta makkaraa ja limua.",
      en: "The beach sauna is warming up and so is the grill. Bring a towel and your own snacks, the guild provides sausages and soft drinks.",
    },
    location: "Rantasauna, Otaniemi",
    organization: "prodeko",
    category: "vapaaAika",
    registrationStart: [-4, 12],
    registrationEnd: [1, 23, 59],
    eventStart: [3, 18],
    eventEnd: [3, 23, 30],
    quotas: [openQuota(40, 31)],
  },
  {
    name: { fi: "Salibandyturnaus", en: "Floorball tournament" },
    description: {
      fi: "Vuosikurssien välinen salibandyturnaus. Joukkueet arvotaan ilmoittautuneiden kesken, mailoja saa lainaan.",
      en: "A floorball tournament between the year groups. Teams are drawn among the registrants, sticks can be borrowed.",
    },
    location: "Otahalli, Otaniementie 17",
    organization: "prodeko-urheilukerho",
    category: "urheilu",
    registrationStart: [-6, 12],
    registrationEnd: [2, 23, 59],
    eventStart: [5, 10],
    eventEnd: [5, 16],
    quotas: [
      {
        title: { fi: "Pelaajat", en: "Players" },
        size: 36,
        registrations: 41,
      },
    ],
    questions: [
      {
        type: "RADIO",
        label: { fi: "Pelipaikka", en: "Position" },
        isRequired: true,
        options: [
          { fi: "Kenttäpelaaja", en: "Field player" },
          { fi: "Maalivahti", en: "Goalkeeper" },
        ],
        answer: (_, random) => pickWeighted(random, [9, 1]),
      },
      {
        type: "RADIO",
        label: { fi: "Tarvitsetko mailan?", en: "Do you need a stick?" },
        isRequired: true,
        options: [yes, no],
        answer: (_, random) => pickWeighted(random, [1, 2]),
      },
    ],
  },
  {
    name: {
      fi: "Yritysvierailu: Kvartaali Consulting",
      en: "Company visit: Kvartaali Consulting",
    },
    description: {
      fi: "Kvartaali Consulting esittelee konsultin arkea ja kesätyömahdollisuuksia. Vierailun jälkeen iltapala ja vapaata verkostoitumista.",
      en: "Kvartaali Consulting presents the everyday life of a consultant and their summer jobs. Snacks and networking after the visit.",
    },
    location: "Kvartaali Consulting, Mannerheimintie 12, Helsinki",
    organization: "prodeko",
    category: "yritys",
    registrationStart: [-2, 12],
    registrationEnd: [6, 23, 59],
    eventStart: [12, 16],
    eventEnd: [12, 19],
    quotas: [
      {
        title: { fi: "Kandivaihe (I–III)", en: "Bachelor's (I–III)" },
        size: 15,
        registrations: 9,
      },
      {
        title: { fi: "Maisterivaihe (IV–N)", en: "Master's (IV–N)" },
        size: 15,
        registrations: 19,
      },
    ],
    openQuotaSize: 3,
    questions: [
      {
        type: "RADIO",
        label: {
          fi: "Kiinnostaako kesätyö?",
          en: "Are you interested in a summer job?",
        },
        isRequired: true,
        options: [yes, { fi: "Ehkä", en: "Maybe" }, no],
        answer: (_, random) => pickWeighted(random, [5, 3, 2]),
      },
      {
        type: "TEXT",
        label: { fi: "Pääaine", en: "Major" },
        answer: (_, random) =>
          random() < 0.7
            ? [
                "Tuotantotalous",
                "Strategy and Venturing",
                "Operations Management",
              ][Math.floor(random() * 3)]
            : undefined,
      },
    ],
  },

  // Signup opens later
  {
    name: { fi: "Prodekon vuosijuhlat", en: "Prodeko's annual gala" },
    description: {
      fi: "Killan vuoden juhlavin ilta: cocktailtilaisuus, kolmen ruokalajin illallinen, tanssit ja jatkot. Pukukoodi: frakki tai iltapuku. Avecit ovat tervetulleita omassa kiintiössään.",
      en: "The guild's most festive evening of the year: cocktails, a three-course dinner, dancing and an after-party. Dress code: white tie. Avecs are welcome in their own quota.",
    },
    location: "Vanha ylioppilastalo, Mannerheimintie 3, Helsinki",
    organization: "prodeko",
    category: "juhlat",
    registrationStart: [6, 12],
    registrationEnd: [20, 23, 59],
    eventStart: [45, 18],
    eventEnd: [46, 4],
    quotas: [
      {
        title: { fi: "Prodekolaiset", en: "Prodeko members" },
        size: 120,
        registrations: 0,
      },
      {
        title: { fi: "Kutsuvieraat", en: "Invited guests" },
        size: 30,
        registrations: 0,
      },
      { title: { fi: "Avecit", en: "Avecs" }, size: 40, registrations: 0 },
    ],
    openQuotaSize: 10,
    questions: [
      avec,
      alcohol,
      specialDiet,
      otherDiet,
      seating,
      bindingRegistration,
    ],
    isHighlighted: true,
  },
  {
    name: { fi: "Laskiaisrieha", en: "Shrovetide sledding" },
    description: {
      fi: "Pulkkamäkeä, hernekeittoa ja laskiaispullia. Kisaamme myös perinteisessä pulkkaviestissä vuosikursseittain.",
      en: "Sledding, pea soup and Shrovetide buns. We also race in the traditional sled relay between the year groups.",
    },
    location: "Malminkartanonhuippu, Helsinki",
    organization: "prodeko",
    category: "vapaaAika",
    registrationStart: [2, 12],
    registrationEnd: [12, 23, 59],
    eventStart: [16, 10],
    eventEnd: [16, 18],
    quotas: [openQuota(80, 0)],
    questions: [
      {
        type: "RADIO",
        label: { fi: "Tuotko oman pulkan?", en: "Are you bringing a sled?" },
        isRequired: true,
        options: [yes, no],
        answer: () => 0,
      },
    ],
  },
  {
    name: { fi: "Wappubrunssi", en: "Vappu brunch" },
    description: {
      fi: "Kuohuvaa, simaa ja runsas brunssipöytä wapun kunniaksi. Ylioppilaslakki päähän!",
      en: "Sparkling wine, sima and a generous brunch table for Vappu. Remember your student cap!",
    },
    location: "Prodeko-kiltahuone, Otakaari 1",
    organization: "prodeko",
    category: "juhlat",
    registrationStart: [9, 12],
    registrationEnd: [18, 23, 59],
    eventStart: [30, 11],
    eventEnd: [30, 15],
    quotas: yearGroupQuotas([12, 12, 12, 12, 12], [0, 0, 0, 0, 0]),
    questions: [specialDiet, otherDiet],
  },

  // Signup closed
  {
    name: { fi: "Appro", en: "Appro pub crawl" },
    description: {
      fi: "Perinteinen appro Helsingin keskustassa: kuusi rastia, haalarimerkki ja jatkot. Ilmoittaudu tiimisi kanssa!",
      en: "The traditional appro in central Helsinki: six checkpoints, an overall patch and an after-party. Register with your team!",
    },
    location: "Lähtö: Kansalaistori, Helsinki",
    organization: "prodeko",
    category: "juhlat",
    registrationStart: [-25, 12],
    registrationEnd: [-12, 23, 59],
    eventStart: [-8, 17],
    eventEnd: [-8, 23, 59],
    quotas: [openQuota(100, 108)],
    questions: [
      {
        type: "TEXT",
        label: { fi: "Tiimin nimi", en: "Team name" },
        isRequired: true,
        answer: (_, random) =>
          [
            "Kvartaalikiitäjät",
            "Excel-velhot",
            "Pivot-pojat",
            "Kassavirta",
            "Tase ja tunteet",
          ][Math.floor(random() * 5)],
      },
    ],
  },
  {
    name: { fi: "Pikkujoulut", en: "Christmas party" },
    description: {
      fi: "Jouluruokaa, glögiä ja joulupukki! Kiltahuone on koristeltu ja tonttulakit kaivettu esiin.",
      en: "Christmas food, mulled wine and Santa Claus! The guild room is decorated and the elf hats are out.",
    },
    location: "Prodeko-kiltahuone, Otakaari 1",
    organization: "prodeko",
    category: "juhlat",
    registrationStart: [-35, 12],
    registrationEnd: [-20, 23, 59],
    eventStart: [-15, 18],
    eventEnd: [-15, 23, 59],
    quotas: yearGroupQuotas([20, 20, 20, 20, 20], [20, 17, 12, 9, 6]),
    questions: [alcohol, specialDiet, otherDiet],
  },
  {
    name: { fi: "Teatteri-ilta", en: "Theatre evening" },
    description: {
      fi: "Kulttuurikerho lähtee katsomaan syksyn puhutuinta komediaa. Liput kerhon piikkiin, väliajalla kuohuvaa.",
      en: "The culture club goes to see the most talked-about comedy of the autumn. Tickets on the club, sparkling wine in the intermission.",
    },
    location: "Kaupunginteatteri, Eläintarhantie 5, Helsinki",
    organization: "prodeko-kulttuurikerho",
    category: "kulttuuri",
    registrationStart: [-14, 12],
    registrationEnd: [-6, 23, 59],
    eventStart: [-3, 19],
    eventEnd: [-3, 22],
    quotas: [openQuota(25, 25)],
  },

  // Draft, only visible to admins
  {
    name: { fi: "Kevätretki Nuuksioon", en: "Spring hike in Nuuksio" },
    description: {
      fi: "Päiväretki Nuuksion kansallispuistoon: patikointia, nuotiolla paistettua makkaraa ja kevään ensimmäiset pulahdukset. Suunnitelma vielä kesken.",
      en: "A day trip to Nuuksio national park: hiking, sausages over the campfire and the first dips of spring. The plan is still a work in progress.",
    },
    location: "Haukkalammen pysäköintialue, Nuuksio",
    organization: "prodeko",
    category: "vapaaAika",
    registrationStart: [25, 12],
    registrationEnd: [32, 23, 59],
    eventStart: [40, 9],
    eventEnd: [40, 17],
    quotas: [openQuota(30, 0)],
    isDraft: true,
  },
]

/******************************************************************************/
// People

const firstNames = [
  "Aino",
  "Eetu",
  "Emma",
  "Elias",
  "Helmi",
  "Onni",
  "Venla",
  "Leevi",
  "Aada",
  "Väinö",
  "Ella",
  "Niilo",
  "Siiri",
  "Oliver",
  "Iida",
  "Eino",
  "Sofia",
  "Leo",
  "Kerttu",
  "Veeti",
  "Pihla",
  "Joona",
  "Lumi",
  "Otto",
  "Isla",
  "Aleksi",
  "Enni",
  "Juho",
  "Linnea",
  "Santeri",
  "Lotta",
  "Roope",
  "Maija",
  "Tuomas",
  "Ronja",
  "Matias",
  "Ilona",
  "Lauri",
  "Vilma",
  "Akseli",
  "Maijuli Kielo",
  "Anna-Liisa",
  "Juha-Pekka",
]

const lastNames = [
  "Korhonen",
  "Virtanen",
  "Mäkinen",
  "Nieminen",
  "Mäkelä",
  "Hämäläinen",
  "Laine",
  "Heikkinen",
  "Koskinen",
  "Järvinen",
  "Lehtonen",
  "Lehtinen",
  "Saarinen",
  "Salminen",
  "Heinonen",
  "Niemi",
  "Heikkilä",
  "Kinnunen",
  "Salonen",
  "Turunen",
  "Salo",
  "Laitinen",
  "Tuominen",
  "Rantanen",
  "Karjalainen",
  "Jokinen",
  "Mattila",
  "Savolainen",
  "Lahtinen",
  "Ahonen",
  "Juokko Tuoppo",
  "von Bonsdorff",
]

// Small deterministic random generator, so every run creates the same data
function seededRandom(seed: number) {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ascii(text: string) {
  return text
    .toLowerCase()
    .replace(/[äå]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "")
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[äå]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function makePerson(random: () => number, index: number): Person {
  const firstName = firstNames[Math.floor(random() * firstNames.length)]
  const lastName = lastNames[Math.floor(random() * lastNames.length)]
  return {
    firstName,
    lastName,
    // example.com is reserved for examples, so no email can reach anyone
    email: `${ascii(firstName)}.${ascii(lastName)}${index}@example.com`,
  }
}

/******************************************************************************/
// Database

function at([days, hour, minute = 0]: [number, number, number?]) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, minute, minute === 59 ? 59 : 0, 0)
  return date
}

const paragraphs = (text: string) => [
  { type: "paragraph", children: [{ text }] },
]

async function getOrCreateUser(client: PoolClient, username: string) {
  const {
    rows: [existing],
  } = await client.query("select * from app_public.users where username = $1", [
    username,
  ])
  if (existing) return existing

  const {
    rows: [user],
  } = await client.query(
    `insert into app_public.users (username, name, is_admin)
      values ($1, $1, true) returning *`,
    [username]
  )
  await client.query(
    `insert into app_public.user_emails (user_id, email, is_verified, is_primary)
      values ($1, $2, true, true)`,
    [user.id, `${username}@example.com`]
  )
  await client.query(
    `update app_private.user_secrets
      set password_hash = crypt('kananugetti', gen_salt('bf'))
      where user_id = $1`,
    [user.id]
  )
  return user
}

async function getOrCreateOrganization(
  client: PoolClient,
  org: (typeof organizations)[number],
  userId: string
) {
  const {
    rows: [organization],
  } = await client.query(
    `insert into app_public.organizations (slug, name, color)
      values ($1, $2, $3)
      on conflict (slug) do update set name = excluded.name
      returning *`,
    [org.slug, org.name, org.color]
  )
  await client.query(
    `insert into app_public.organization_memberships (organization_id, user_id, is_owner)
      values ($1, $2, true)
      on conflict do nothing`,
    [organization.id, userId]
  )
  return organization
}

async function getOrCreateCategory(
  client: PoolClient,
  key: string,
  organizationId: string
) {
  const category = categories[key]
  const {
    rows: [existing],
  } = await client.query(
    `select * from app_public.event_categories
      where owner_organization_id = $1 and name->>'fi' = $2`,
    [organizationId, category.name.fi]
  )
  if (existing) return existing

  const {
    rows: [created],
  } = await client.query(
    `insert into app_public.event_categories (name, description, color, owner_organization_id)
      values ($1, $2, $3, $4) returning *`,
    [category.name, category.description, category.color, organizationId]
  )
  return created
}

function toAnswer(
  question: QuestionDef,
  raw: ReturnType<QuestionDef["answer"]>,
  lang: "fi" | "en"
) {
  if (raw === undefined) return undefined
  if (question.type === "TEXT") return raw as string
  const option = (index: number) => question.options![index][lang]
  if (question.type === "RADIO") return option(raw as number)
  return (raw as number[]).map(option)
}

async function createEvent(
  client: PoolClient,
  def: EventDef,
  organizationId: string,
  categoryId: string,
  random: () => number
) {
  const eventStart = at(def.eventStart)
  const day = `${eventStart.getFullYear()}-${eventStart.getMonth() + 1}-${eventStart.getDate()}`
  const slug = `${day}-${slugify(def.name.fi)}`

  const {
    rows: [existing],
  } = await client.query("select id from app_public.events where slug = $1", [
    slug,
  ])
  if (existing) {
    console.log(`  skipped "${def.name.fi}", it already exists`)
    return
  }

  const {
    rows: [event],
  } = await client.query(
    `insert into app_public.events (
      name, slug, description, location,
      event_start_time, event_end_time,
      registration_start_time, registration_end_time,
      is_highlighted, is_draft, open_quota_size,
      owner_organization_id, category_id
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    returning *`,
    [
      def.name,
      slug,
      {
        fi: paragraphs(def.description.fi),
        en: paragraphs(def.description.en),
      },
      def.location,
      eventStart,
      at(def.eventEnd),
      at(def.registrationStart),
      at(def.registrationEnd),
      def.isHighlighted ?? false,
      def.isDraft ?? false,
      def.openQuotaSize ?? 0,
      organizationId,
      categoryId,
    ]
  )

  const questions = []
  const questionDefs = def.questions ?? []
  for (let position = 0; position < questionDefs.length; position++) {
    const q = questionDefs[position]
    const {
      rows: [question],
    } = await client.query(
      `insert into app_public.event_questions (event_id, position, type, label, is_required, data)
        values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        event.id,
        position,
        q.type,
        q.label,
        q.isRequired ?? false,
        q.options ?? null,
      ]
    )
    questions.push({ id: question.id, def: q })
  }

  // Registrations arrive between signup opening and now (or signup closing)
  const signupFrom = at(def.registrationStart).getTime()
  const signupTo = Math.min(Date.now(), at(def.registrationEnd).getTime())
  let total = 0

  for (let position = 0; position < def.quotas.length; position++) {
    const quotaDef = def.quotas[position]
    const {
      rows: [quota],
    } = await client.query(
      `insert into app_public.quotas (event_id, position, title, size)
        values ($1, $2, $3, $4) returning id`,
      [event.id, position, quotaDef.title, quotaDef.size]
    )

    for (let i = 0; i < quotaDef.registrations; i++) {
      const person = makePerson(random, total)
      const lang = random() < 0.85 ? "fi" : "en"
      const answers: Record<string, Answer> = {}
      for (const { id, def: q } of questions) {
        const answer = toAnswer(q, q.answer(person, random), lang)
        if (answer !== undefined) answers[id] = answer
      }
      // Earlier registrations come in quickly after signup opens
      const createdAt = new Date(
        signupFrom + Math.pow(random(), 2) * (signupTo - signupFrom)
      )

      const {
        rows: [registration],
      } = await client.query(
        `insert into app_public.registrations
          (event_id, quota_id, first_name, last_name, email, answers, is_finished, created_at, updated_at)
          values ($1, $2, $3, $4, $5, $6, true, $7, $7) returning id`,
        [
          event.id,
          quota.id,
          person.firstName,
          person.lastName,
          person.email,
          answers,
          createdAt,
        ]
      )
      await client.query(
        `insert into app_private.registration_secrets (event_id, quota_id, registration_id)
          values ($1, $2, $3)`,
        [event.id, quota.id, registration.id]
      )
      total++
    }
  }

  console.log(`  created "${def.name.fi}" with ${total} registrations`)
}

// Triggers that would get in the way of inserting historical data: the
// timestamps trigger overwrites created_at, the validity trigger rejects
// registrations outside the signup window and the materialized view would be
// refreshed after every single row. They are switched back on before commit.
const triggers = [
  ["app_public.registrations", "_100_timestamps"],
  ["app_public.registrations", "_300_registration_is_valid"],
  ["app_public.registrations", "_700_refresh_mat_view"],
  ["app_public.events", "_300_refresh_mat_view"],
  ["app_public.quotas", "_300_refresh_mat_view"],
]

async function setTriggers(client: PoolClient, mode: "enable" | "disable") {
  for (const [table, trigger] of triggers) {
    await client.query(`alter table ${table} ${mode} trigger ${trigger}`)
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL not set!")
  }
  const username = process.argv[2] || "testuser"
  const random = seededRandom(2026)

  const pgPool = new Pool({ connectionString })
  const client = await pgPool.connect()
  try {
    // Everything happens in one transaction, including switching the
    // triggers off and on, so a failure leaves the database untouched
    await client.query("begin")
    await client.query("reset role")
    await setTriggers(client, "disable")

    const user = await getOrCreateUser(client, username)
    const orgIds: Record<string, string> = {}
    for (const org of organizations) {
      orgIds[org.slug] = (
        await getOrCreateOrganization(client, org, user.id)
      ).id
    }

    console.log("Creating demo events:")
    for (const def of events) {
      const category = await getOrCreateCategory(
        client,
        def.category,
        orgIds[def.organization]
      )
      await createEvent(
        client,
        def,
        orgIds[def.organization],
        category.id,
        random
      )
    }

    await setTriggers(client, "enable")
    await client.query("commit")
    await client.query(
      "refresh materialized view app_hidden.registrations_status_and_position"
    )
    console.log(
      `Done. Log in as "${username}" to see the drafts and admin views.`
    )
  } catch (e) {
    await client.query("rollback")
    if (typeof e.code === "string" && e.code.match(/^[0-9A-Z]{5}$/)) {
      console.error([e.message, e.code, e.detail, e.hint, e.where].join("\n"))
    }
    throw e
  } finally {
    client.release()
    await pgPool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
