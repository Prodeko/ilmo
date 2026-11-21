/// <reference types="Cypress" />

// Stripe payments from the participant's side. Payment opens when
// registration closes. Stripe itself is never contacted:
// createCheckoutSession is stubbed, the Checkout page is replaced by a
// redirect straight back to Ilmo, and the payment is completed with the
// completeStripeCheckout server command, which posts a signed
// checkout.session.completed event to the real webhook route.
//
// Needs a server running with both Stripe secrets (dummy values are fine), so
// that the `payments` flag is available; the tests switch it on.

const STRIPE_CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_cypress"

function fillRegistrationForm() {
  cy.getCy("eventregistrationform-input-firstname")
    .wait(0)
    .focus()
    .clear()
    .type("Etunimi")
  cy.getCy("eventregistrationform-input-lastname").type("Sukunimi")
  cy.getCy("eventregistrationform-input-email").type(
    "etunimi.sukunimi@prodeko.org"
  )
}

context("Payments: registration", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))
  beforeEach(() => cy.serverCommand("setFeatureFlags", { payments: "on" }))

  it("registers into a paid quota without paying yet", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      priceCents: 1500,
    }).as("createEventDataResult")
    let checkoutRequested = false
    cy.intercept("POST", "/graphql", (req) => {
      if (req.body?.operationName === "CreateCheckoutSession") {
        checkoutRequested = true
      }
    })

    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      // Event page shows the price
      cy.visit(`${Cypress.env("ROOT_URL")}/event/${event.slug}`)
      cy.getCy("eventpage-quotas-price-0").should("contain", "15,00 €")

      // Action
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/${event.slug}/register/${quota.id}`
      )
      // One notice: the price and that the link comes when registration
      // closes
      cy.getCy("eventregistrationform-payment-summary")
        .should("contain", "15,00 €")
        .and("contain", "0,25 €")
      fillRegistrationForm()
      cy.getCy("eventregistrationform-button-submit")
        .should("not.contain", "€")
        .click()

      // Assertion: the registration is saved and nothing is paid yet
      cy.url().should("equal", Cypress.env("ROOT_URL") + `/event/${event.slug}`)
      cy.getCy("eventpage-signups-quota-0-table").should("contain", "Etunimi")
      cy.then(() => expect(checkoutRequested).to.equal(false))
    })
  })

  it("opens /pay when registration closes and completes the payment", () => {
    // Setup: an unpaid registration while registration is open
    cy.serverCommand("createTestEventData", {
      priceCents: 1500,
    }).as("createEventDataResult")

    cy.get("@createEventDataResult").then(
      ({ event, registrationSecret }: any) => {
        const updateToken = registrationSecret.update_token
        cy.intercept("POST", "/graphql", (req) => {
          if (req.body?.operationName === "CreateCheckoutSession") {
            req.alias = "createCheckoutSession"
            req.reply({
              data: {
                createCheckoutSession: {
                  __typename: "CreateCheckoutSessionPayload",
                  url: STRIPE_CHECKOUT_URL,
                },
              },
            })
          }
        })
        // Stand-in for Stripe's Checkout page: send the browser back to the
        // success URL like Stripe does once the card has been charged
        cy.intercept("GET", `${STRIPE_CHECKOUT_URL}*`, (req) => {
          req.reply({
            statusCode: 303,
            headers: {
              location: `${Cypress.env(
                "ROOT_URL"
              )}/pay/${updateToken}?status=success`,
            },
          })
        }).as("stripeCheckout")

        // While registration is open, payment has not opened yet
        cy.visit(`${Cypress.env("ROOT_URL")}/pay/${updateToken}`)
        cy.getCy("paypage-card").should("have.attr", "data-state", "opensLater")
        cy.getCy("paypage-button-pay").should("not.exist")

        // Action: registration closes, then the participant pays
        cy.serverCommand("closeEventRegistration", { eventId: event.id })
        cy.reload()
        cy.getCy("paypage-card").should("have.attr", "data-state", "unpaid")
        cy.getCy("paypage-button-pay").should("contain", "15,25 €").click()

        // Assertion: Checkout was requested and the browser came back to /pay
        cy.wait("@createCheckoutSession")
        cy.wait("@stripeCheckout")
        cy.location("search").should("contain", "status=success")
        cy.getCy("paypage-card").should("have.attr", "data-state", "confirming")
        cy.getCy("paypage-confirming-notice").should("exist")

        // The webhook marks the payment paid and the polling page notices
        cy.serverCommand("completeStripeCheckout", { updateToken })
        cy.getCy("paypage-card", { timeout: 20000 }).should(
          "have.attr",
          "data-state",
          "paid"
        )
        cy.getCy("paypage-confirming-notice").should("not.exist")
        cy.getCy("paypage-button-pay").should("not.exist")
      }
    )
  })

  it("shows an error on /pay if Checkout can't be started", () => {
    // Setup: an unpaid registration after registration has closed
    cy.serverCommand("createTestEventData", {
      priceCents: 1500,
    }).as("createEventDataResult")
    cy.intercept("POST", "/graphql", (req) => {
      if (req.body?.operationName === "CreateCheckoutSession") {
        req.alias = "createCheckoutSession"
        req.reply({
          data: { createCheckoutSession: null },
          errors: [
            { message: "Stripe is down", path: ["createCheckoutSession"] },
          ],
        })
      }
    })

    cy.get("@createEventDataResult").then(
      ({ event, registrationSecret }: any) => {
        const updateToken = registrationSecret.update_token
        cy.serverCommand("closeEventRegistration", { eventId: event.id })

        // Action
        cy.visit(`${Cypress.env("ROOT_URL")}/pay/${updateToken}`)
        cy.getCy("paypage-button-pay").click()

        // Assertion: the page stays and says that it failed
        cy.wait("@createCheckoutSession")
        cy.getCy("paypage-checkout-failed").should("exist")
        cy.getCy("paypage-card").should("have.attr", "data-state", "unpaid")
      }
    )
  })

  it("/pay polls after returning from Checkout until the payment is paid", () => {
    // Setup: an unpaid registration after registration has closed
    cy.serverCommand("createTestEventData", {
      priceCents: 1000,
    }).as("createEventDataResult")

    cy.get("@createEventDataResult").then(
      ({ event, registrationSecret }: any) => {
        const updateToken = registrationSecret.update_token
        cy.serverCommand("closeEventRegistration", { eventId: event.id })
        cy.visit(`${Cypress.env("ROOT_URL")}/pay/${updateToken}`)
        cy.getCy("paypage-card").should("have.attr", "data-state", "unpaid")
        cy.getCy("paypage-button-pay").should("contain", "10,25 €")

        // Action: come back from Checkout before the webhook has arrived
        cy.visit(`${Cypress.env("ROOT_URL")}/pay/${updateToken}?status=success`)
        cy.getCy("paypage-card").should("have.attr", "data-state", "confirming")
        cy.getCy("paypage-confirming-notice").should("exist")
        cy.serverCommand("completeStripeCheckout", { updateToken })

        // Assertion
        cy.getCy("paypage-card", { timeout: 20000 }).should(
          "have.attr",
          "data-state",
          "paid"
        )
        cy.getCy("paypage-status-tag").should("exist")
        cy.getCy("paypage-button-pay").should("not.exist")
      }
    )
  })

  it("warns that nothing is refunded when deleting a paid registration", () => {
    // Setup: a registration paid by card while registration is open, as
    // after registration has been reopened
    cy.serverCommand("createTestEventData", {
      priceCents: 1500,
    }).as("createEventDataResult")

    cy.get("@createEventDataResult").then(
      ({ event, registrationSecret }: any) => {
        const updateToken = registrationSecret.update_token
        cy.serverCommand("completeStripeCheckout", { updateToken })

        // Action
        cy.visit(
          `${Cypress.env("ROOT_URL")}/update-registration/${updateToken}`
        )
        cy.getCy("updateregistration-paid-banner").should("exist")
        cy.getCy("eventregistrationform-button-delete-registration").click()

        // Assertion: the confirmation warns, and deleting is still allowed
        cy.getCy("eventregistrationform-delete-no-refund-warning").should(
          "be.visible"
        )
        cy.get(".ant-popconfirm-buttons button").contains("Kyllä").click()
        cy.url().should(
          "equal",
          Cypress.env("ROOT_URL") + `/event/${event.slug}`
        )
      }
    )
  })
})
