// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

/// <reference types="Cypress" />

// Import commands.js using ES2015 syntax:
import "./commands"

// Don't clear the session cookie between tests.
// Somehow this introduced a race condition which resulted in
// CSRF errors when running e2e tests. I.e. Cypress was clearing
// the session cookie between tests which resulted in CSRF errors.
Cypress.Cookies.defaults({
  preserve: "session",
})

// Work around 'ResizeObserver loop limit exceeded' error
const resizeObserverLoopErrRe = /^[^(ResizeObserver loop limit exceeded)]/
Cypress.on("uncaught:exception", (err) => {
  /* returning false here prevents Cypress from failing the test */
  if (resizeObserverLoopErrRe.test(err.message)) {
    return false
  }
})
