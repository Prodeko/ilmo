/// <reference types="Cypress" />

const PASSWORD = "MyPassword1"

context("Login", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))

  it("can log in", () => {
    // Setup
    cy.serverCommand("createUser", {
      username: "testuser",
      name: "Test User",
      verified: true,
      password: PASSWORD,
    })
    cy.visit(Cypress.env("ROOT_URL") + "/login")
    cy.getCy("loginpage-input-username").should("be.visible") // Without SSO the password form is rendered directly
    cy.getCy("header-login-button").should("not.exist") // No login button on login page

    // Action
    cy.getCy("loginpage-input-username").type("testuser")
    cy.getCy("loginpage-input-password").type(PASSWORD)
    cy.getCy("loginpage-button-submit").click()

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/") // Should be on homepage
    cy.getCy("header-login-button").should("not.exist") // Should be logged in
    cy.getCy("layout-dropdown-user").should("contain", "Test User") // Should be logged in
  })

  it("fails on bad password", () => {
    // Setup
    cy.serverCommand("createUser", {
      username: "testuser",
      name: "Test User",
      verified: true,
      password: PASSWORD,
    })
    cy.visit(Cypress.env("ROOT_URL") + "/login")
    cy.getCy("loginpage-input-username").should("be.visible")

    // Action
    cy.getCy("loginpage-input-username").type("testuser")
    cy.getCy("loginpage-input-password").type(PASSWORD + "!")
    cy.getCy("loginpage-button-submit").click()

    // Assertion
    cy.contains("Väärä käyttäjänimi tai salasana").should("exist")
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/login") // Should be on login page still
    cy.getCy("header-login-button").should("not.exist") // No login button on login page
    cy.getCy("layout-dropdown-user").should("not.exist") // Should not be logged in
    cy.getCy("layout-dropdown-user").should("not.exist") // Should not be logged in

    // But can recover
    cy.getCy("loginpage-input-password").type("{backspace}") // Delete the '!' that shouldn't be there
    cy.getCy("loginpage-button-submit").click()
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/") // Should be on homepage
    cy.getCy("header-login-button").should("not.exist") // Should be logged in
    cy.getCy("layout-dropdown-user").should("contain", "Test User") // Should be logged in
  })
})

context("SSO login page states", () => {
  it("shows a localized error for sso error codes", () => {
    cy.visit(Cypress.env("ROOT_URL") + "/login?error=email_not_verified")
    cy.getCy("loginpage-error-alert").should("be.visible")
  })

  it("shows the password form via the local param", () => {
    cy.visit(Cypress.env("ROOT_URL") + "/login?local=1")
    cy.getCy("loginpage-input-username").should("be.visible")
  })
})
