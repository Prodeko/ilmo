/// <reference types="Cypress" />

/**
 * These specs need a server started with the three KEYCLOAK_* variables
 * pointing at a *reachable* Keycloak holding the realm in
 * `@app/e2e/keycloak/realm-ci.json` (`pnpm --filter @app/e2e run keycloak:up`
 * brings that container up locally; the CI job "Cypress (SSO live)" does the
 * same). Everything here is real: discovery, the PKCE code exchange, ID token
 * and nonce validation, the claim mapping and the user provisioning the
 * callback performs.
 *
 * The sibling directory `cypress/e2e-sso` covers the other half — what the
 * same routes do when the provider is *not* reachable — and therefore has to
 * keep running against a dead port in its own job.
 *
 * Keycloak answers on a second port of localhost, which Cypress counts as a
 * separate origin. `cy.origin()` cannot bridge it on Cypress 10: it keys
 * origins by superdomain, so a block for localhost:8080 is indistinguishable
 * from the app's own and the command rejects itself. The documented fallback
 * for that generation is `chromeWebSecurity: false`, which the `run:sso-live`
 * script passes and this suite therefore depends on. On Cypress 12+ the
 * blocks that touch KEYCLOAK_ORIGIN would move inside `cy.origin()` instead.
 */

const ROOT_URL: string = Cypress.env("ROOT_URL")
const KEYCLOAK_ORIGIN: string =
  Cypress.env("KEYCLOAK_ORIGIN") || "http://localhost:8080"

const MEMBER = {
  username: "ci-member",
  password: "ci-member-password",
  name: "CI Member",
  locale: "fi",
}
const ADMIN = {
  username: "ci-admin",
  password: "ci-admin-password",
  name: "CI Admin",
  locale: "en",
}

/**
 * Fills Keycloak's login form. These ids are the ones the shipped login theme
 * has carried across major versions, which is what makes driving the real form
 * headlessly viable.
 */
function submitKeycloakForm(username: string, password: string) {
  cy.get("#username").type(username)
  cy.get("#password").type(password)
  cy.get("#kc-login").click()
}

/**
 * Navigates the app the way a link would. Once a test's `cy.visit()` has been
 * redirected out to Keycloak, Cypress keeps the test bound to the provider's
 * origin and refuses any further `cy.visit()` back to the app, even though the
 * browser itself is sitting on an app page again. A navigation the page
 * performs on its own is not subject to that check.
 */
function goTo(path: string) {
  cy.window().then((win) => {
    win.location.href = ROOT_URL + path
  })
}

function loginThroughKeycloak(user: typeof MEMBER) {
  cy.visit(ROOT_URL + "/login")
  submitKeycloakForm(user.username, user.password)
  cy.getCy("layout-dropdown-user").should("contain", user.name)
}

context("SSO login against a live Keycloak", () => {
  it("provisions a user from the id token and signs them in", () => {
    cy.visit(ROOT_URL + "/login")
    // The password form belongs to the local break-glass path; with SSO on,
    // /login hands straight over to the provider.
    cy.getCy("loginpage-input-username").should("not.exist")
    cy.url().should("include", KEYCLOAK_ORIGIN)

    submitKeycloakForm(MEMBER.username, MEMBER.password)

    cy.url().should("equal", ROOT_URL + "/")
    cy.getCy("header-login-button").should("not.exist")
    cy.getCy("layout-dropdown-user").should("contain", MEMBER.name)
    // The `locale` claim is mapped onto the cookie that drives next-translate.
    cy.getCookie("NEXT_LOCALE").should("have.property", "value", MEMBER.locale)
  })

  it("grants admin from the realm role in the id token", () => {
    loginThroughKeycloak(ADMIN)

    // This user's `locale` claim is en, so the landing page is the en-prefixed
    // one — the second half of the claim mapping, seen from the outside.
    cy.url().should("equal", `${ROOT_URL}/${ADMIN.locale}`)
    cy.getCy("layout-dropdown-user").click()
    cy.getCy("layout-link-admin").should("be.visible").click()
    cy.url().should("include", "/admin/event/list")
  })

  it("leaves a user without the realm role out of the admin area", () => {
    loginThroughKeycloak(MEMBER)

    cy.getCy("layout-dropdown-user").click()
    cy.getCy("layout-link-admin").should("not.exist")
    // Not an admin, so the layout bounces the request back to the front page.
    goTo("/admin/event/list")
    cy.url().should("equal", ROOT_URL + "/")
  })

  it("re-authenticates silently while the keycloak session lives", () => {
    loginThroughKeycloak(MEMBER)

    // /logout drops the app session without touching the provider, which is
    // exactly the state that proves the round trip below is silent: the
    // browser goes out to Keycloak and comes back signed in, no form.
    goTo("/logout")
    cy.getCy("header-login-button").should("be.visible")

    goTo("/login")
    cy.url().should("equal", ROOT_URL + "/")
    cy.getCy("layout-dropdown-user").should("contain", MEMBER.name)
  })

  it("ends the keycloak session when the user logs out", () => {
    loginThroughKeycloak(MEMBER)

    cy.getCy("layout-dropdown-user").click()
    // The item carries no data-cy of its own; antd derives the attribute from
    // the menu key, which does identify it.
    cy.get("[data-menu-id$='logout']").click()

    // RP-initiated logout leaves through Keycloak's end-session endpoint and
    // comes back to the app, so the assertion waits out the whole chain.
    cy.url().should("equal", ROOT_URL + "/")
    cy.getCy("header-login-button").should("be.visible")

    // With the provider session gone, the next login has to ask for a password
    // again instead of bouncing straight back.
    goTo("/login")
    cy.url().should("include", KEYCLOAK_ORIGIN)
    cy.get("#username").should("be.visible")
  })
})
