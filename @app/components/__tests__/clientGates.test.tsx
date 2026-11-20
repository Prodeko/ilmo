import { renderToStaticMarkup } from "react-dom/server"
import I18nProvider from "next-translate/I18nProvider"
import { Client, fetchExchange, Provider } from "urql"

import { useCelebrate } from "../src/celebrate"
import { EventCard } from "../src/EventCard"
import { EventForm } from "../src/EventForm"
import { featureEnabledIn, FeatureFlagsProvider } from "../src/Feature"

import type { Event, SharedLayout_QueryFragment } from "@app/graphql"
import type { FeatureKey } from "@app/lib"

/*
 * The components below render on the server (renderToStaticMarkup). These
 * mocks stand in for what a node test cannot load: ESM-only packages, image
 * imports, the Next router and the drag and drop backend.
 */
jest.mock("next/router", () => ({
  useRouter: () => ({ push: jest.fn(), query: {}, pathname: "/", asPath: "/" }),
}))
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) =>
    require("react").createElement("img", { alt }),
}))
jest.mock("../assets/header-logo.png", () => "header-logo.png")
jest.mock("antd-img-crop", () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => children,
}))
jest.mock("@ant-design/icons/es/index", () => require("@ant-design/icons"))
jest.mock("react-dnd", () => ({
  DndProvider: ({ children }: { children: unknown }) => children,
  useDrag: () => [{}, () => {}, () => {}],
  useDrop: () => [{}, () => {}],
}))
jest.mock("react-dnd-html5-backend", () => ({ HTML5Backend: {} }))
// The typed picker and the scroll column picker render the same input until
// the calendar opens, so the typed one leaves a marker
jest.mock("../src/EventForm/TimeRangePicker", () => ({
  ...jest.requireActual("../src/EventForm/TimeRangePicker"),
  TimeRangePicker: () =>
    require("react").createElement("span", { "data-cy": "typed-time-picker" }),
}))

const layoutData = (enabled: string[]) =>
  ({
    currentUser: { isAdmin: false, isDeveloper: false },
    enabledFeaturesList: enabled,
    adminPreviewFeaturesList: [],
  }) as unknown as SharedLayout_QueryFragment

describe("featureEnabledIn", () => {
  it("reads a feature as off while the query is loading", () => {
    expect(featureEnabledIn(undefined, "registration_reminders")).toBe(false)
    expect(featureEnabledIn(null, "registration_reminders")).toBe(false)
  })

  it("reads a feature as on only when the server lists it", () => {
    const data = layoutData(["registration_reminders"])
    expect(featureEnabledIn(data, "registration_reminders")).toBe(true)
    expect(featureEnabledIn(data, "telegram_reminders")).toBe(false)
  })
})

describe("useCelebrate", () => {
  const Probe = () => <span>{useCelebrate().name}</span>

  it("does nothing while confetti is off", () => {
    expect(
      renderToStaticMarkup(
        <FeatureFlagsProvider data={layoutData([])}>
          <Probe />
        </FeatureFlagsProvider>
      )
    ).toBe("<span>noCelebration</span>")
  })

  it("shoots confetti while confetti is on", () => {
    expect(
      renderToStaticMarkup(
        <FeatureFlagsProvider data={layoutData(["confetti"])}>
          <Probe />
        </FeatureFlagsProvider>
      )
    ).toBe("<span>celebrate</span>")
  })
})

describe("event form", () => {
  const client = new Client({
    url: "http://localhost/graphql",
    exchanges: [fetchExchange],
  })
  // Page query data: the shared layout fragment and the form's own fields
  const pageData = (enabled: string[]) =>
    ({
      ...layoutData(enabled),
      languages: ["FI", "EN"],
      organizations: { nodes: [] },
      eventCategories: { nodes: [] },
    }) as any

  const renderForm = (enabled: string[] | undefined) =>
    renderToStaticMarkup(
      <Provider value={client}>
        <FeatureFlagsProvider data={enabled && pageData(enabled)}>
          <EventForm
            data={enabled && pageData(enabled)}
            formRedirect="/admin/event/list"
            type="create"
          />
        </FeatureFlagsProvider>
      </Provider>
    )

  // What each client-only flag adds to the form
  const gates: Array<[FeatureKey, string]> = [
    ["typed_time_input", 'data-cy="typed-time-picker"'],
    ["event_templates", 'data-cy="eventform-quotas-template"'],
    ["form_preview", "admin:events.tabs.preview"],
  ]

  beforeAll(() => {
    // antd warns about Input.Group, which the form still uses
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  it("renders without the gated parts while their flags are off", () => {
    const html = renderForm([])
    expect(html).toContain('data-cy="eventform-input-event-time"')
    for (const [, marker] of gates) {
      expect(html).not.toContain(marker)
    }
  })

  it.each(gates)("adds the part of %s while it is on", (key, marker) => {
    expect(renderForm([key])).toContain(marker)
  })
})

describe("event card ribbon", () => {
  const event = {
    slug: "vuosijuhla",
    name: { fi: "Vuosijuhla" },
    location: "Otaniemi",
    registrationStartTime: "2030-04-01T09:00:00.000Z",
    registrationEndTime: "2030-04-20T20:59:59.000Z",
    headerImageFile: null,
    signupOpen: true,
    isHighlighted: true,
    highlightText: { fi: "Pian täynnä" },
    quotas: { nodes: [] },
    registrations: { totalCount: 0 },
  } as unknown as Event

  const renderCard = (enabled: string[]) =>
    renderToStaticMarkup(
      <I18nProvider lang="fi" namespaces={{}}>
        <FeatureFlagsProvider data={layoutData(enabled)}>
          <EventCard event={event} />
        </FeatureFlagsProvider>
      </I18nProvider>
    )

  it("shows the default ribbon text while ribbon_text is off", () => {
    const html = renderCard([])
    expect(html).toContain('<span class="ant-ribbon-text">highlightText</span>')
    expect(html).not.toContain("Pian täynnä")
  })

  it("shows the event's ribbon text while ribbon_text is on", () => {
    expect(renderCard(["ribbon_text"])).toContain("Pian täynnä")
  })
})
