import { FeatureState } from "@app/graphql"

import {
  eventsOf,
  FeatureFlagEvent,
  previewInfo,
  stateSelectable,
  transition,
} from "../src/FeatureFlags/transitions"

const { Off, AdminsOnly, On } = FeatureState

const event = (
  key: string,
  oldState: FeatureState,
  newState: FeatureState,
  id: string
): FeatureFlagEvent => ({
  id,
  key,
  oldState,
  newState,
  actorId: null,
  actorName: "Dev",
  actorUsername: "dev",
  createdAt: "2026-11-01T10:00:00Z",
})

describe("transition", () => {
  it("saves Off <-> Admins only at once", () => {
    expect(transition(Off, AdminsOnly)).toBe("immediate")
    expect(transition(AdminsOnly, Off)).toBe("immediate")
  })

  it("confirms every change into On", () => {
    expect(transition(Off, On)).toBe("confirmOn")
    expect(transition(AdminsOnly, On)).toBe("confirmOn")
  })

  it("confirms every change out of On", () => {
    expect(transition(On, Off)).toBe("confirmLeaveOn")
    expect(transition(On, AdminsOnly)).toBe("confirmLeaveOn")
  })

  it("does nothing when the state stays", () => {
    for (const state of [Off, AdminsOnly, On]) {
      expect(transition(state, state)).toBe("none")
    }
  })
})

describe("previewInfo", () => {
  it("is not previewed when the audit log never had admins_only", () => {
    const events = eventsOf(
      [event("a", Off, On, "1"), event("b", Off, AdminsOnly, "2")],
      "a"
    )
    expect(previewInfo({ state: Off }, events)).toEqual({
      previewed: false,
      lastPreviewStart: null,
    })
  })

  it("returns the most recent switch into admins_only", () => {
    // Newest first, as the API returns them.
    const events = [
      event("a", AdminsOnly, Off, "3"),
      event("a", Off, AdminsOnly, "2"),
      event("a", Off, AdminsOnly, "1"),
    ]
    const info = previewInfo({ state: Off }, events)
    expect(info.previewed).toBe(true)
    expect(info.lastPreviewStart?.id).toBe("2")
  })

  it("counts the current admins_only state as a preview", () => {
    expect(previewInfo({ state: AdminsOnly }, [])).toEqual({
      previewed: true,
      lastPreviewStart: null,
    })
  })
})

describe("eventsOf", () => {
  it("keeps one flag's events in order and skips nulls", () => {
    const events = [
      event("a", Off, On, "1"),
      null,
      event("b", Off, On, "2"),
      event("a", On, Off, "3"),
    ]
    expect(eventsOf(events, "a").map((e) => e.id)).toEqual(["1", "3"])
  })
})

describe("stateSelectable", () => {
  it("allows every state for an available flag", () => {
    const flag = { available: true, retiredAt: null }
    expect([Off, AdminsOnly, On].map((s) => stateSelectable(flag, s))).toEqual([
      true,
      true,
      true,
    ])
  })

  it("allows only Off for an unavailable flag", () => {
    const flag = { available: false, retiredAt: null }
    expect([Off, AdminsOnly, On].map((s) => stateSelectable(flag, s))).toEqual([
      true,
      false,
      false,
    ])
  })

  it("allows nothing for a retired flag", () => {
    const flag = { available: true, retiredAt: "2026-11-01T10:00:00Z" }
    expect([Off, AdminsOnly, On].map((s) => stateSelectable(flag, s))).toEqual([
      false,
      false,
      false,
    ])
  })
})
