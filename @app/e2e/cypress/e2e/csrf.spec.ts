/// <reference types="Cypress" />

context("CSRF protection", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("displays CSRF error page when an incorrect token is provided in the request", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")
    cy.visit(Cypress.env("ROOT_URL"))

    // Action
    cy.get("@createEventDataResult").then(({ event }: any) => {
      // Wait for the homepage to fully render before tampering with the
      // CSRF cookie. Otherwise background fetches (HMR, polling) retry
      // with the bad cookie and the global error boundary swaps the page
      // for the CSRF error before we get to click.
      cy.getCy(`eventcard-eventpage-link-${event.slug}`).should("be.visible")

      cy.getCookie("csrfToken")
        .should("exist")
        .then((cookie) => {
          cy.setCookie("csrfToken", cookie!.value + "a")
        })
      // The event page loads the event with a request to /graphql, which
      // now carries a wrong csrfToken
      cy.getCy("homepage-signup-open-events")
        .getCy(`eventcard-eventpage-link-${event.slug}`)
        .click()

      // Assertions
      cy.get(".ant-result").should("contain", "Väärä CSRF-tunnus")

      // Can recover from csrf error
      cy.getCy("error-csrf-refresh").click()
      cy.getCy("eventpage-quotas-link-0").should("not.be.disabled").click()
      cy.contains("h3", "Ilmoittaudu tapahtumaan").should("be.visible")
    })
  })
})
