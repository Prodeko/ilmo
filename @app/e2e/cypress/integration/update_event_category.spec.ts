/// <reference types="Cypress" />

context("Update event category", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("admin can update an existing event category", () => {
    // Setup
    cy.serverCommand("createTestEventData", { userIsAdmin: true }).as(
      "createEventDataResult"
    )

    // Action
    cy.get("@createEventDataResult").then(
      ({ organization, eventCategory }: any) => {
        cy.login({
          username: "testuser_events",
          password: "DOESNT MATTER",
          existingUser: true,
        })
        cy.visit(
          Cypress.env("ROOT_URL") +
            `/admin/event-category/update/${eventCategory.id}`
        )

        // Assertion
        cy.getCy("eventcategoryform-select-language").contains("Suomi")
        cy.getCy("eventcategoryform-select-language").contains("Englanti")
        cy.getCy("eventcategoryform-select-organization-id").contains(
          organization.name
        )
        cy.getCy("eventcategoryform-input-name-fi").should(
          "have.value",
          eventCategory.name["fi"]
        )
        cy.getCy("eventcategoryform-input-name-en").should(
          "have.value",
          eventCategory.name["en"]
        )
        cy.getCy("eventcategoryform-input-description-fi").should(
          "have.value",
          eventCategory.description["fi"]
        )
        cy.getCy("eventcategoryform-input-description-en").should(
          "have.value",
          eventCategory.description["en"]
        )

        // Update event category
        cy.getCy("eventcategoryform-input-name-fi")
          .clear()
          .type("Päivitetty testikategoria")

        cy.get(".rcp-fields-element-input").clear().type("#000000")

        cy.getCy("eventcategoryform-button-submit").click()

        // Assertion
        cy.url().should(
          "equal",
          Cypress.env("ROOT_URL") + "/admin/event-category/list"
        )
        cy.getCy("adminpage-eventcategories").should(
          "contain",
          "PÄIVITETTY TESTIKATEGORIA"
        )
        cy.getCy("adminpage-eventcategories")
          .contains("TESTIKATEGORIA")
          .should("have.css", "background-color", "rgb(0, 0, 0)")
      }
    )
  })

  it("can submit the form without any modifications", () => {
    // Setup
    cy.serverCommand("createTestEventData", { userIsAdmin: true }).as(
      "createEventDataResult"
    )

    // Action
    cy.get("@createEventDataResult").then(({ eventCategory }: any) => {
      cy.login({
        username: "testuser_events",
        password: "DOESNT MATTER",
        existingUser: true,
      })
      cy.visit(
        Cypress.env("ROOT_URL") +
          `/admin/event-category/update/${eventCategory.id}`
      )
      cy.getCy("eventcategoryform-button-submit").click()

      // Assertion
      cy.url().should(
        "equal",
        Cypress.env("ROOT_URL") + "/admin/event-category/list"
      )
    })
  })

  it("redirects to index if event category is not found", () => {
    // Setup
    cy.serverCommand("createTestEventData", { userIsAdmin: true }).as(
      "createEventDataResult"
    )

    // Action
    cy.get("@createEventDataResult").then(() => {
      cy.login({
        username: "testuser_events",
        password: "DOESNT MATTER",
        existingUser: true,
      })

      // Invalid event category id
      cy.visit(
        Cypress.env("ROOT_URL") +
          "/admin/event-category/update/6159575f-7c08-4370-80dd-031f18511669"
      )
    })

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
  })
})
