import { renderToStaticMarkup } from "react-dom/server"

import { useCelebrate } from "../src/celebrate"
import { featureEnabledIn, FeatureFlagsProvider } from "../src/Feature"

import type { SharedLayout_QueryFragment } from "@app/graphql"

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
