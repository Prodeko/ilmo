/// <reference types="Cypress" />

/**
 * Specs in this directory need a server started with the three KEYCLOAK_*
 * variables set; the default `cypress run` never picks them up. The CI job
 * "Cypress (SSO enabled)" points KEYCLOAK_ISSUER at a port nothing listens
 * on, so discovery fails and the flow ends on the error page instead of at a
 * real identity provider. Gating is presence-only, so everything up to the
 * discovery call is the production code path.
 */
context("SSO enabled login", () => {
  it("sends /login to the keycloak route", () => {
    cy.request({
      url: Cypress.env("ROOT_URL") + "/login",
      followRedirect: false,
    }).then((response) => {
      expect(response.status).to.be.oneOf([302, 307])
      expect(response.redirectedToUrl).to.contain("/auth/keycloak")
    })
  })

  it("sends the keycloak route back to the error page when discovery fails", () => {
    cy.request({
      url: Cypress.env("ROOT_URL") + "/auth/keycloak",
      followRedirect: false,
    }).then((response) => {
      expect(response.status).to.eq(302)
      expect(response.redirectedToUrl).to.contain(
        "/login?error=sso_unavailable"
      )
    })
  })

  it("shows the error alert after following the whole chain", () => {
    cy.visit(Cypress.env("ROOT_URL") + "/login")
    cy.url().should("include", "/login?error=sso_unavailable")
    cy.getCy("loginpage-error-alert").should("be.visible")
    cy.getCy("loginpage-input-username").should("not.exist")
  })

  it("offers local sign-in from the sso_unavailable alert", () => {
    cy.visit(Cypress.env("ROOT_URL") + "/login?error=sso_unavailable")
    cy.getCy("loginpage-link-local").click()
    cy.getCy("loginpage-input-username").should("be.visible")
  })

  it("sanitizes a hostile next before handing it to the keycloak route", () => {
    cy.request({
      url: Cypress.env("ROOT_URL") + "/login?next=//evil.example.com",
      followRedirect: false,
    }).then((response) => {
      expect(response.status).to.be.oneOf([302, 307])
      expect(response.redirectedToUrl).to.contain("/auth/keycloak")
      expect(response.redirectedToUrl).to.not.contain("evil.example.com")
    })
  })

  it("still reaches the break-glass form through the local param", () => {
    cy.visit(Cypress.env("ROOT_URL") + "/login?local=1")
    cy.getCy("loginpage-input-username").should("be.visible")
  })
})
