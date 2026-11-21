/// <reference types="Cypress" />

const FLAG = "test_e2e_flag"
const FRESH_FLAG = "test_e2e_fresh"
const UNAVAILABLE_FLAG = "test_e2e_unconfigured"

const segment = (key: string, state: "off" | "admins_only" | "on") =>
  cy.getCy(`feature-${key}-state-${state}`).closest(".ant-segmented-item")

const shouldBeIn = (key: string, state: "off" | "admins_only" | "on") =>
  segment(key, state).should("have.class", "ant-segmented-item-selected")

context("Features page", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("deleteTestFeatureFlags"))
  after(() => cy.serverCommand("deleteTestFeatureFlags"))

  it("lets a developer switch a flag through every state", () => {
    cy.serverCommand("createTestFeatureFlag", { key: FLAG })
    cy.login({ isAdmin: true, isDeveloper: true, next: "admin/event/list" })

    cy.getCy("admin-sider-features").click()
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/features")
    cy.getCy(`feature-row-${FLAG}`).should("contain", FLAG)
    shouldBeIn(FLAG, "off")

    // Off -> Admins only saves at once.
    cy.getCy(`feature-${FLAG}-state-admins_only`).click()
    cy.get(".ant-message").should("contain", FLAG)
    shouldBeIn(FLAG, "admins_only")
    cy.getCy("feature-confirm-on-modal").should("not.exist")

    // Into On asks first; the flag has been previewed.
    cy.getCy(`feature-${FLAG}-state-on`).click()
    cy.getCy("feature-confirm-previewed").should("be.visible")
    cy.getCy("feature-confirm-preview").should("not.exist")
    cy.getCy("feature-confirm-cancel").filter(":visible").click()
    shouldBeIn(FLAG, "admins_only")

    cy.getCy(`feature-${FLAG}-state-on`).click()
    cy.getCy("feature-confirm-on").click()
    shouldBeIn(FLAG, "on")

    // Out of On asks first, with what stops and what keeps working.
    cy.getCy(`feature-${FLAG}-state-off`).click()
    cy.getCy("feature-confirm-stops").should("be.visible")
    cy.getCy("feature-confirm-keeps").should("be.visible")
    cy.getCy("feature-confirm-leave-on").click()
    shouldBeIn(FLAG, "off")

    // The history lists the three changes, newest first.
    cy.getCy(`feature-${FLAG}-history`).click()
    cy.getCy("feature-history-drawer")
      .find("[data-cy=feature-history-event]")
      .should("have.length", 3)
  })

  it("recommends a preview before turning on a flag never previewed", () => {
    cy.serverCommand("createTestFeatureFlag", { key: FRESH_FLAG })
    cy.login({ isAdmin: true, isDeveloper: true, next: "admin/features" })

    cy.getCy(`feature-${FRESH_FLAG}-state-on`).click()
    cy.getCy("feature-confirm-never-previewed").should("be.visible")
    cy.getCy("feature-confirm-preview").click()
    shouldBeIn(FRESH_FLAG, "admins_only")
  })

  it("does not let a developer switch on an unavailable flag", () => {
    cy.serverCommand("createTestFeatureFlag", {
      key: UNAVAILABLE_FLAG,
      available: false,
    })
    cy.login({ isAdmin: true, isDeveloper: true, next: "admin/features" })

    shouldBeIn(UNAVAILABLE_FLAG, "off")
    segment(UNAVAILABLE_FLAG, "admins_only").should(
      "have.class",
      "ant-segmented-item-disabled"
    )
    segment(UNAVAILABLE_FLAG, "on").should(
      "have.class",
      "ant-segmented-item-disabled"
    )
    cy.getCy(`feature-${UNAVAILABLE_FLAG}-note`).should("be.visible")
  })

  it("hides the page from an admin without the developer role", () => {
    cy.serverCommand("createTestFeatureFlag", { key: FLAG })
    cy.login({ isAdmin: true, next: "admin/event/list" })

    cy.getCy("admin-sider-events").should("be.visible")
    cy.getCy("admin-sider-features").should("not.exist")

    cy.visit(Cypress.env("ROOT_URL") + "/admin/features")
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
    cy.get(".ant-message").should("contain", "Pääsy kielletty")
    cy.getCy("features-page").should("not.exist")
  })

  it("redirects a user who is not an admin", () => {
    cy.login({ next: "admin/features" })

    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
    cy.get(".ant-message").should("contain", "Pääsy kielletty")
    cy.getCy("features-page").should("not.exist")
  })
})
