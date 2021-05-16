/// <reference types="Cypress" />

context("Create event category", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("admin user can create an event category", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      eventSignupUpcoming: true,
      userIsAdmin: true,
    }).as("createEventDataResult")
    cy.login({
      username: "testuser_events",
      password: "DOESNT MATTER",
      existingUser: true,
    })

    // Action
    cy.get("@createEventDataResult").then(() => {
      cy.getCy("layout-dropdown-user").click()
      cy.getCy("layout-link-admin").click()
      cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/event/list")
      cy.getCy("admin-sider-event-categories").click()
      cy.getCy("admin-sider-create-event-category").click()
      cy.url().should(
        "equal",
        Cypress.env("ROOT_URL") + "/admin/event-category/create"
      )

      cy.getCy("eventcategoryform-select-language").click()
      cy.getCy("eventcategoryform-select-language-option-fi").click()
      cy.getCy("eventcategoryform-select-language-option-en").click()
      cy.getCy("eventcategoryform-select-language").click()

      cy.getCy("eventcategoryform-select-organization-id").click()
      cy.getCy("eventcategoryform-select-organization-id-option-0").click()

      cy.getCy("eventcategoryform-input-name-fi").type("Testikategoria")
      cy.getCy("eventcategoryform-input-name-en").type("Test event")

      cy.getCy("eventcategoryform-input-description-fi").type("Testikuvaus")
      cy.getCy("eventcategoryform-input-description-en").type(
        "Test description"
      )

      cy.getCy("eventcategoryform-button-submit").click()

      // Assertion
      cy.url().should(
        "equal",
        Cypress.env("ROOT_URL") + "/admin/event-category/list"
      )
      cy.getCy("adminpage-eventcategories").should("contain", "Testikategoria")
    })
  })

  it("redirects to index if user is not admin", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      eventSignupUpcoming: true,
      eventSignupClosed: false,
    }).as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(() => {
      cy.login({
        verified: true,
      })
      cy.visit(Cypress.env("ROOT_URL") + "/admin/event-category/create")
    })

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
  })

  it("redirects to index if user is not part of any organization", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")
    cy.login({
      verified: true,
      isAdmin: true,
    })

    // Action
    cy.get("@createEventDataResult").then(() => {
      cy.visit(Cypress.env("ROOT_URL") + "/admin/event-category/create")
    })

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
  })
})
