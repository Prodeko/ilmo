/// <reference types="Cypress" />

context("CSRF protection", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("Displays CSRF error page when an incorrect token is provided in the request", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")
    cy.visit(Cypress.env("ROOT_URL"))

    // Action
    cy.get("@createEventDataResult").then(({ event }: any) => {
      cy.getCookie("csrfToken")
        .should("exist")
        .then((cookie) => {
          cy.setCookie("csrfToken", cookie!.value + "a")
        })
      cy.getCy("homepage-signup-open-events")
        .getCy(`eventcard-eventpage-link-${event.slug}`)
        .click()

      // Triggers a request to /graphql with a wrong csrfToken
      cy.get("[data-cy=eventpage-quotas-link-0]", { timeout: 5000 }).should(
        "not.be.disabled"
      )
      cy.getCy("eventpage-quotas-link-0").click()

      // Assertions
      cy.get(".ant-result").should("contain", "Väärä CSRF-tunnus")
      cy.getCy("error-csrf-refresh").click()
      cy.get(".ant-page-header-heading").should(
        "contain",
        "Ilmoittaudu tapahtumaan"
      )
    })
  })
})
