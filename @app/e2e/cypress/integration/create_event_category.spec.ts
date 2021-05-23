/// <reference types="Cypress" />

context("Create event category", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("admin can create an event category", () => {
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

      // Both languages are selected by default. Click twice to make sure
      // the select works.
      cy.getCy("eventcategoryform-select-language").click()
      cy.getCy("eventcategoryform-select-language-option-en").click()
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

      cy.get(".rcp-fields-element-input").clear().type("#ffffff")

      cy.getCy("eventcategoryform-button-submit").click()

      // Assertion
      cy.url().should(
        "equal",
        Cypress.env("ROOT_URL") + "/admin/event-category/list"
      )
      cy.getCy("adminpage-eventcategories").should("contain", "TESTIKATEGORIA")
      cy.getCy("adminpage-eventcategories")
        .contains("TESTIKATEGORIA")
        .should("have.css", "background-color", "rgb(255, 255, 255)")
    })
  })
})
