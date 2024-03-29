/// <reference types="Cypress" />

context("Update event registration", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("can update an existing registration", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(
      ({ event, registration, registrationSecret }: any) => {
        cy.visit(
          Cypress.env("ROOT_URL") +
            `/update-registration/${registrationSecret.update_token}`
        )
        cy.getCy("eventregistrationform-input-firstname").should(
          "have.value",
          registration.first_name
        )
        cy.getCy("eventregistrationform-input-lastname").should(
          "have.value",
          registration.last_name
        )

        // Update registration
        cy.getCy("eventregistrationform-input-firstname")
          .clear()
          .type("Etunimi")
        cy.getCy("eventregistrationform-input-lastname")
          .clear()
          .type("Sukunimi")

        cy.getCy("eventregistrationform-button-submit").click()

        // Assertion
        cy.get(".ant-message").contains("Tiedot päivitetty")
        cy.url().should(
          "equal",
          Cypress.env("ROOT_URL") + `/event/${event.slug}`
        )
        cy.getCy("eventpage-signups-quota-0-table").should("contain", "Etunimi")
        cy.getCy("eventpage-signups-quota-0-table").should(
          "contain",
          "Sukunimi"
        )
      }
    )
  })

  it("can delete an existing registration", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(
      ({ event, registrationSecret }: any) => {
        cy.visit(
          Cypress.env("ROOT_URL") +
            `/update-registration/${registrationSecret.update_token}`
        )

        cy.getCy("eventregistrationform-button-delete-registration").click()

        // Assertion
        cy.get(".ant-popover-buttons button").contains("Kyllä").click()
        cy.get(".ant-message").contains(
          "Ilmoittautuminen poistettu onnistuneesti"
        )
        cy.url().should(
          "equal",
          Cypress.env("ROOT_URL") + `/event/${event.slug}`
        )
      }
    )
  })

  it("redirects to index if registration is not found", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(() => {
      // Invalid registration id
      cy.visit(
        Cypress.env("ROOT_URL") +
          "/update-registration/73d3de4a-ece0-4d9b-a6d2-e796d95456b9"
      )
    })

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
  })
})
