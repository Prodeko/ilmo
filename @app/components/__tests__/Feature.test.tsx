import { renderToStaticMarkup } from "react-dom/server"

import {
  Feature,
  FeatureFlagsProvider,
  isDeveloperUser,
  useFeature,
  useFeaturePreview,
} from "../src/Feature"

import type { SharedLayout_QueryFragment } from "@app/graphql"
import type { FeatureKey } from "@app/lib"

// The registry may be empty; these tests use keys of their own.
const ON = "test_on" as FeatureKey
const PREVIEW = "test_preview" as FeatureKey
const OFF = "test_off" as FeatureKey

const layoutData = ({
  isAdmin = true,
  isDeveloper = false,
  enabled = [ON, PREVIEW],
  preview = [PREVIEW],
}: {
  isAdmin?: boolean
  isDeveloper?: boolean
  enabled?: (string | null)[]
  preview?: (string | null)[]
} = {}) =>
  ({
    currentUser: { isAdmin, isDeveloper },
    enabledFeaturesList: enabled,
    adminPreviewFeaturesList: preview,
  }) as unknown as SharedLayout_QueryFragment

const render = (
  data: SharedLayout_QueryFragment | undefined,
  node: React.ReactNode
) =>
  renderToStaticMarkup(
    <FeatureFlagsProvider data={data}>{node}</FeatureFlagsProvider>
  )

const Probe = ({ name }: { name: FeatureKey }) => (
  <span>
    {String(useFeature(name))}/{String(useFeaturePreview(name))}
  </span>
)

describe("useFeature and useFeaturePreview", () => {
  it("read every feature as off while the layout query is loading", () => {
    expect(render(undefined, <Probe name={ON} />)).toBe(
      "<span>false/false</span>"
    )
  })

  it("read every feature as off without a provider", () => {
    expect(renderToStaticMarkup(<Probe name={ON} />)).toBe(
      "<span>false/false</span>"
    )
  })

  it("read a listed key as on and an unlisted key as off", () => {
    const data = layoutData()
    expect(render(data, <Probe name={ON} />)).toBe("<span>true/false</span>")
    expect(render(data, <Probe name={OFF} />)).toBe("<span>false/false</span>")
  })

  it("report a preview only for a key that is also enabled", () => {
    expect(render(layoutData(), <Probe name={PREVIEW} />)).toBe(
      "<span>true/true</span>"
    )
    expect(
      render(
        layoutData({ enabled: [ON], preview: [PREVIEW] }),
        <Probe name={PREVIEW} />
      )
    ).toBe("<span>false/false</span>")
  })
})

describe("Feature", () => {
  it("renders the fallback while the feature is off or loading", () => {
    const node = (
      <Feature fallback={<i>old</i>} name={OFF}>
        <b>new</b>
      </Feature>
    )
    expect(render(layoutData(), node)).toBe("<i>old</i>")
    expect(render(undefined, node)).toBe("<i>old</i>")
  })

  it("renders nothing by default while the feature is off", () => {
    expect(
      render(
        layoutData(),
        <Feature name={OFF}>
          <b>new</b>
        </Feature>
      )
    ).toBe("")
  })

  it("renders its children while the feature is on, without a tag", () => {
    expect(
      render(
        layoutData(),
        <Feature name={ON} previewTag>
          <b>new</b>
        </Feature>
      )
    ).toBe("<b>new</b>")
  })

  it("passes the preview state to a render function", () => {
    const node = (name: FeatureKey) => (
      <Feature name={name}>
        {({ preview }) => <b>{preview ? "preview" : "released"}</b>}
      </Feature>
    )
    expect(render(layoutData(), node(ON))).toBe("<b>released</b>")
    expect(render(layoutData(), node(PREVIEW))).toBe("<b>preview</b>")
  })

  it("renders the preview tag only when asked and only for a preview", () => {
    const withTag = render(
      layoutData(),
      <Feature name={PREVIEW} previewTag>
        <b>new</b>
      </Feature>
    )
    expect(withTag).toContain('data-cy="preview-tag"')
    expect(withTag).toContain("<b>new</b>")

    const withoutTag = render(
      layoutData(),
      <Feature name={PREVIEW}>
        <b>new</b>
      </Feature>
    )
    expect(withoutTag).not.toContain("preview-tag")
  })

  it("links developers to the Features page from the preview tag", () => {
    const node = (
      <Feature name={PREVIEW} previewTag>
        <b>new</b>
      </Feature>
    )
    const developer = render(layoutData({ isDeveloper: true }), node)
    expect(developer).toContain('href="/admin/features"')
    expect(developer).toContain("featurePreview.developerHint")

    const admin = render(layoutData({ isDeveloper: false }), node)
    expect(admin).not.toContain("/admin/features")
    expect(admin).toContain("featurePreview.adminHint")
  })
})

describe("isDeveloperUser", () => {
  it("needs both the admin and the developer flag", () => {
    expect(isDeveloperUser({ isAdmin: true, isDeveloper: true })).toBe(true)
    expect(isDeveloperUser({ isAdmin: false, isDeveloper: true })).toBe(false)
    expect(isDeveloperUser({ isAdmin: true, isDeveloper: false })).toBe(false)
    expect(isDeveloperUser(null)).toBe(false)
    expect(isDeveloperUser(undefined)).toBe(false)
  })
})
