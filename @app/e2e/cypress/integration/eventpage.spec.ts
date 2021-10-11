/// <reference types="Cypress" />

context("Events page", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("Can navigate to an event from homepage", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")
    cy.visit(Cypress.env("ROOT_URL"))

    // Action
    cy.get("@createEventDataResult").then(
      ({ eventCategory, event, quota }: any) => {
        cy.getCy("homepage-signup-open-events")
          .getCy(`eventcard-eventpage-link-${event.slug}`)
          .click()

        // Assertions
        cy.url().should(
          "equal",
          `${Cypress.env("ROOT_URL")}/event/${event.slug}`
        )
        cy.getCy("eventpage-signups-quota-0-table").should("exist")
        cy.getCy("eventpage-quotas-card").should("exist")

        cy.contains(event.name["fi"]).should("exist")
        cy.contains(eventCategory.name["fi"]).should("exist")
        cy.contains(quota.title["fi"]).should("exist")
      }
    )
  })

  it("Can register to an event multiple times on the same machine", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")

    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      // Action
      cy.visit(`${Cypress.env("ROOT_URL")}/event/${event.slug}`)
      cy.get("[data-cy=eventpage-quotas-link-0]", { timeout: 5000 }).should(
        "not.be.disabled"
      )
      cy.getCy("eventpage-quotas-link-0").click()
      cy.url().should(
        "equal",
        `${Cypress.env("ROOT_URL")}/event/${event.slug}/register/${quota.id}`
      )

      // Create first registration
      cy.getCy("eventregistrationform-input-firstname")
        .wait(0)
        .focus()
        .clear()
        .type("Test")
      cy.getCy("eventregistrationform-input-lastname").type("Testersson")
      cy.getCy("eventregistrationform-input-email").type(
        "test.testersson@example.com"
      )
      cy.getCy("eventregistrationform-button-submit").click()

      cy.get("[data-cy=eventpage-quotas-link-0]", { timeout: 5000 }).should(
        "not.be.disabled"
      )
      cy.getCy("eventpage-quotas-link-0").click()
      cy.url().should(
        "equal",
        `${Cypress.env("ROOT_URL")}/event/${event.slug}/register/${quota.id}`
      )

      // Create second registration
      cy.getCy("eventregistrationform-input-firstname")
        .wait(0)
        .focus()
        .clear()
        .type("Per")
      cy.getCy("eventregistrationform-input-lastname").type("Webteamsson")
      cy.getCy("eventregistrationform-input-email").type(
        "per.webteamsson@example.com"
      )
      cy.getCy("eventregistrationform-button-submit").click()

      // Assertions
      cy.getCy("eventpage-signups-quota-0-table").should("exist")
      cy.getCy("eventpage-signups-quota-0-table").contains("Test")
      cy.getCy("eventpage-signups-quota-0-table").contains("Testersson")
      cy.getCy("eventpage-signups-quota-0-table").contains("Per")
      cy.getCy("eventpage-signups-quota-0-table").contains("Webteamsson")
    })
  })

  it("Registration rate limiting works", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")

    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      // Action
      cy.visit(`${Cypress.env("ROOT_URL")}/event/${event.slug}`)
      cy.get("[data-cy=eventpage-quotas-link-0]", { timeout: 5000 }).should(
        "not.be.disabled"
      )
      cy.getCy("eventpage-quotas-link-0").click()
      cy.url().should(
        "equal",
        `${Cypress.env("ROOT_URL")}/event/${event.slug}/register/${quota.id}`
      )

      // Reload page, hit rate limit (3 requests from the same IP)
      ;[...Array(3)].forEach(() => {
        cy.reload()
      })

      // Assertions
      cy.getCy("eventregistrationform-error-alert").contains(
        "Too many requests. You have been rate-limited for 30 minutes."
      )
    })
  })

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
