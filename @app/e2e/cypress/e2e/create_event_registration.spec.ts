/// <reference types="Cypress" />

context("Create event registration", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("can register to an event", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/${event.slug}/register/${quota.id}`
      )
      cy.getCy("eventregistrationform-input-firstname")
        .wait(0)
        .focus()
        .clear()
        .type("Etunimi")
      cy.getCy("eventregistrationform-input-lastname").type("Sukunimi")
      cy.getCy("eventregistrationform-input-email").type(
        "etunimi.sukunimi@prodeko.org"
      )

      cy.getCy("eventregistrationform-button-submit").click()

      // Assertion
      cy.url().should("equal", Cypress.env("ROOT_URL") + `/event/${event.slug}`)
      cy.getCy("eventpage-signups-quota-0-table").should("contain", "Etunimi")
      cy.getCy("eventpage-signups-quota-0-table").should("contain", "Sukunimi")
    })
  })

  it("autofills registration form if user is logged in", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")
    cy.login({
      username: "testuser2",
      name: "Test Tester",
      verified: true,
    })

    // Action
    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/${event.slug}/register/${quota.id}`
      )
      cy.getCy("eventregistrationform-input-firstname").should(
        "contain.value",
        "Test"
      )
      cy.getCy("eventregistrationform-input-lastname").should(
        "contain.value",
        "Tester"
      )
      cy.getCy("eventregistrationform-input-email").should(
        "contain.value",
        "testuser2@example.com"
      )

      // Wait a moment to reduce test flakiness
      cy.wait(1000)

      cy.getCy("eventregistrationform-button-submit").click()

      // Assertion
      cy.url().should("equal", Cypress.env("ROOT_URL") + `/event/${event.slug}`)
      cy.getCy("eventpage-signups-quota-0-table").should("contain", "Test")
      cy.getCy("eventpage-signups-quota-0-table").should("contain", "Tester")
    })
  })

  it("can't register to an event with the same email twice", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")
    cy.login({
      username: "testuser2",
      name: "Test Tester",
      verified: true,
    })

    // Action
    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/${event.slug}/register/${quota.id}`
      )
      cy.getCy("eventregistrationform-button-submit").click()

      // Assertion
      cy.url().should("equal", Cypress.env("ROOT_URL") + `/event/${event.slug}`)
      cy.getCy("eventpage-signups-quota-0-table").should("contain", "Test")
      cy.getCy("eventpage-signups-quota-0-table").should("contain", "Tester")

      cy.visit(
        Cypress.env("ROOT_URL") + `/event/${event.slug}/register/${quota.id}`
      )

      // Wait a moment to reduce test flakiness
      cy.wait(1000)

      cy.getCy("eventregistrationform-button-submit").click()
      cy.getCy("eventregistrationform-error-alert").should(
        "contain",
        "A registration with email testuser2@example.com already exists for this event"
      )
    })
  })

  it("redirects to index if event registration is upcoming", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      eventSignupUpcoming: true,
      eventSignupClosed: false,
    }).as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/${event.slug}/register/${quota.id}`
      )
    })

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
  })

  it("redirects to index if event registration is closed", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      eventSignupUpcoming: false,
      eventSignupClosed: true,
    }).as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/${event.slug}/register/${quota.id}`
      )
    })

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
  })

  it("redirects to index if event is not found", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(({ quota }: any) => {
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/invalid-event/register/${quota.id}`
      )
    })

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
  })

  it("redirects to index if quota is not found", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(({ event }: any) => {
      cy.visit(
        Cypress.env("ROOT_URL") +
          `/event/${event.slug}/register/8049c23c-a9cf-4027-8076-498bf90c012d`
      )
    })

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
  })

  it("registration rate limiting works", () => {
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
        // Wait so that the request to claimRegistrationToken finishes
        cy.wait(1000)
        cy.reload()
      })

      // Assertions
      cy.getCy("eventregistrationform-error-alert").contains(
        "Too many requests. You have been rate-limited for 30 minutes."
      )
    })
  })
})
