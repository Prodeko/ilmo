/// <reference types="Cypress" />

context("", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("Event page displays registrations in the correct quotas", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      openQuotaSize: 2,
      quotaSize: 1,
    }).as("createEventDataResult")
    cy.visit(Cypress.env("ROOT_URL"))

    // Action
    cy.get("@createEventDataResult").then(
      ({ event, quota, registration }: any) => {
        cy.serverCommand("createRegistrations", {
          eventId: event.id,
          quotaId: quota.id,
          // Actual number of registrations will be 5, since
          // createTestEventData creates a single registration by default
          count: 4,
        }).as("createRegistrationsResult")

        cy.get("@createRegistrationsResult").then((registrations) => {
          const reg1 = registration
          const reg2 = registrations[0]
          const reg3 = registrations[1]
          const reg4 = registrations[2]
          const reg5 = registrations[3]

          cy.getCy("homepage-signup-open-events")
            .getCy(`eventcard-eventpage-link-${event.slug}`)
            .click()

          // Assertions
          cy.url().should(
            "equal",
            `${Cypress.env("ROOT_URL")}/event/${event.slug}`
          )
          cy.getCy("eventpage-signups-quota-0-table").should("exist")
          cy.getCy("eventpage-signups-open-table").should("exist")
          cy.getCy("eventpage-signups-queued-table").should("exist")

          const validateRegistrationInTable = (selector: string, r: any) => {
            cy.getCy(selector).should("contain", r.first_name)
            cy.getCy(selector).should("contain", r.last_name)
          }

          let arr = []
          arr = [reg1]
          arr.forEach((r) =>
            validateRegistrationInTable("eventpage-signups-quota-0-table", r)
          )

          arr = [reg2, reg3]
          arr.forEach((r) =>
            validateRegistrationInTable("eventpage-signups-open-table", r)
          )

          arr = [reg4, reg5]
          arr.forEach((r) =>
            validateRegistrationInTable("eventpage-signups-queued-table", r)
          )
        })
      }
    )
  })
})
