// ***********************************************
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This is will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })

/// <reference types="Cypress" />

import "cypress-file-upload"

type Chainable<Subject = any> = Cypress.Chainable<Subject>

type User = {
  id: string
  username: string
  name: string
  is_admin: boolean
  is_developer: boolean
  is_verified: boolean
}

/** States by flag key; the keys are those of @app/lib/src/featureFlags.ts. */
type FeatureFlagStates = Record<string, "off" | "admins_only" | "on">

function getCy(cyName: string): Chainable<JQuery<HTMLElement>> {
  return cy.get(`[data-cy=${cyName}]`)
}

/**
 * Deletes all users with username starting 'test'.
 */
function serverCommand(command: "clearTestUsers"): Chainable<{
  success: true
}>

/**
 * Deletes all organizations with slug starting 'test'.
 */
function serverCommand(command: "clearTestOrganizations"): Chainable<{
  success: true
}>

/**
 * Deletes all event data generated for e2e tests and switches every feature
 * flag off.
 */
function serverCommand(command: "clearTestEventData"): Chainable<{
  success: true
}>

/**
 * Sets feature flag states, e.g. `{ payments: "on" }`. Every key must have a
 * row in app_public.feature_flags. The server's flag cache is cleared, so the
 * change applies to the next request.
 */
function serverCommand(
  command: "setFeatureFlags",
  payload: FeatureFlagStates
): Chainable<{
  success: true
}>

/**
 * Creates or resets a flag row that no feature uses, for tests of the
 * Features page, and clears its change history. The key must start with
 * `test_e2e_`. Defaults: state `off`, available.
 */
function serverCommand(
  command: "createTestFeatureFlag",
  payload: {
    key: `test_e2e_${string}`
    state?: "off" | "admins_only" | "on"
    available?: boolean
    description?: string
  }
): Chainable<{
  success: true
}>

/**
 * Deletes every flag row created by createTestFeatureFlag, with its history.
 */
function serverCommand(command: "deleteTestFeatureFlags"): Chainable<{
  success: true
}>

/**
 * Generate event data for e2e tests.
 */
function serverCommand(
  command: "createTestEventData",
  payload?: {}
): Chainable<{
  success: true
}>

/**
 * Generate registrations for e2e tests.
 */
function serverCommand(
  command: "createRegistrations",
  payload?: {}
): Chainable<{
  success: true
}>

/**
 * Creates a verified or unverified user, bypassing all safety checks.
 * Redirects to `next`.
 *
 * Default values:
 *
 * - username: `testuser`
 * - email: `${username}@example.com`
 * - verified: false
 * - name: `${username}`
 * - password: `TestUserPassword`
 * - isAdmin: false
 * - isDeveloper: false (feature flag management; needs isAdmin as well)
 * - next: `/`
 */
function serverCommand(
  command: "createUser",
  payload: {
    username?: string
    email?: string
    verified?: boolean
    name?: string
    password?: string
    isAdmin?: boolean
    isDeveloper?: boolean
    next?: string
  }
): Chainable<{
  user: User
  userEmailId: string
  verificationToken: string | null
}>

/**
 * Gets the secrets for the specified email, allowing Cypress to perform email
 * validation. If unspecified, email defaults to `testuser@example.com`.
 */
function serverCommand(
  command: "getEmailSecrets",
  payload?: { email?: string }
): Chainable<{
  user_email_id: string
  verification_token: string | null
}>

// The actual implementation of the 'serverCommand' function.
function serverCommand(command: string, payload?: any): any {
  const url = `${Cypress.env(
    "ROOT_URL"
  )}/cypressServerCommand?command=${encodeURIComponent(command)}${
    payload ? `&payload=${encodeURIComponent(JSON.stringify(payload))}` : ""
  }`
  // GET the url, and return the response body (JSON is parsed automatically)
  return cy.request(url).its("body")
}

function login(payload?: {
  next?: string
  username?: string
  name?: string
  verified?: boolean
  isAdmin?: boolean
  /** Feature flag management; needs isAdmin as well. */
  isDeveloper?: boolean
  password?: string
  orgs?: [[string, string] | [string, string, boolean]]
  existingUser?: true
}) {
  return cy
    .request(
      Cypress.env("ROOT_URL") +
        `/cypressServerCommand?command=login&payload=${encodeURIComponent(
          JSON.stringify(payload)
        )}`
    )
    .then(() => {
      const root = Cypress.env("ROOT_URL")
      if (payload?.next) {
        cy.visit(`${root}/${payload.next}`)
      } else {
        cy.visit(root)
      }
    })
}

Cypress.Commands.add("getCy", getCy)
Cypress.Commands.add("serverCommand", serverCommand)
Cypress.Commands.add("login", login)

export {} // Make this a module so we can `declare global`

declare global {
  namespace Cypress {
    interface Chainable {
      getCy: typeof getCy
      serverCommand: typeof serverCommand
      login: typeof login
    }
  }
}
