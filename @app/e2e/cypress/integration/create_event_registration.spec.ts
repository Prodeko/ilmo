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
        Cypress.env("ROOT_URL") + `/event/register/${event.id}/q/${quota.id}`
      )
      cy.getCy("eventregistrationform-input-firstname").type("Etunimi")
      cy.getCy("eventregistrationform-input-lastname").type("Sukunimi")
      cy.getCy("eventregistrationform-input-email").type(
        "etunimi.sukunimi@prodeko.org"
      )

      cy.getCy("eventregistrationform-button-submit").click()

      // Assertion
      cy.url().should("equal", Cypress.env("ROOT_URL") + `/event/${event.slug}`)
      cy.getCy("eventpage-signups-table").should("contain", "Etunimi")
      cy.getCy("eventpage-signups-table").should("contain", "Sukunimi")
    })
  })

  it("autofills registration form if user is logged in", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult")
    cy.login({
      name: "Test Tester",
      verified: true,
      orgs: [["Test Organization", "test-organization"]],
    })

    // Action
    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/register/${event.id}/q/${quota.id}`
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
        "testuser@example.com"
      )

      cy.getCy("eventregistrationform-button-submit").click()

      // Assertion
      cy.url().should("equal", Cypress.env("ROOT_URL") + `/event/${event.slug}`)
      cy.getCy("eventpage-signups-table").should("contain", "Test")
      cy.getCy("eventpage-signups-table").should("contain", "Tester")
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
        Cypress.env("ROOT_URL") + `/event/register/${event.id}/q/${quota.id}`
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
        Cypress.env("ROOT_URL") + `/event/register/${event.id}/q/${quota.id}`
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
        Cypress.env("ROOT_URL") +
          `/event/register/3a63c486-79e9-42db-8202-8113a75602c6/q/${quota.id}`
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
          `/event/register/${event.id}/q/8049c23c-a9cf-4027-8076-498bf90c012d`
      )
    })

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
  })
})
