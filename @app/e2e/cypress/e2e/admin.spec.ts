/// <reference types="Cypress" />

context("Admin", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("can access admin with correct permissions", () => {
    // Action
    cy.login({
      verified: true,
      isAdmin: true,
      orgs: [["Test Organization", "test-organization"]],
    })
    cy.visit(Cypress.env("ROOT_URL") + "/admin")

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/event/list")
    cy.getCy("adminpage-events-open").should("be.visible")
  })

  it("redirects to index if user is not admin", () => {
    // Action
    cy.login({
      verified: true,
    })
    cy.visit(Cypress.env("ROOT_URL") + "/admin")

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/")
  })

  it("can access admin even if not part of any organization", () => {
    // Action
    cy.login({
      verified: true,
      isAdmin: true,
    })
    cy.visit(Cypress.env("ROOT_URL") + "/admin")

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/event/list")
    cy.getCy("adminpage-events-open").should("be.visible")
  })
})
