/// <reference types="Cypress" />

// Stripe payments from the participant's side. Stripe itself is never
// contacted: createCheckoutSession is stubbed, the Checkout page is replaced
// by a redirect straight back to Ilmo, and the payment is completed with the
// completeStripeCheckout server command, which posts a signed
// checkout.session.completed event to the real webhook route.
//
// Needs a server running with payments enabled (PAYMENTS_ENABLED=1 and both
// Stripe secrets, dummy values are fine); otherwise the tests are skipped.

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
  before(function () {
    cy.serverCommand("paymentsEnabled").then(({ enabled }) => {
      if (!enabled) this.skip()
    })
  })
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("registers into a paid quota, goes to Checkout and lands on /pay", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      paymentMode: "DURING_REGISTRATION",
      priceCents: 1500,
    }).as("createEventDataResult")

    let updateToken: string | undefined
    cy.intercept("POST", "/graphql", (req) => {
      if (req.body?.operationName === "CreateCheckoutSession") {
        updateToken = req.body.variables.updateToken
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

    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      // Event page shows the price
      cy.visit(`${Cypress.env("ROOT_URL")}/event/${event.slug}`)
      cy.getCy("eventpage-quotas-price-0").should("contain", "15,00 €")

      // Action
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/${event.slug}/register/${quota.id}`
      )
      cy.getCy("eventregistrationform-payment-summary").should(
        "contain",
        "15,25 €"
      )
      fillRegistrationForm()
      cy.getCy("eventregistrationform-button-submit")
        .should("contain", "15,25 €")
        .click()

      // Assertion: Checkout was requested and the browser came back to /pay
      cy.wait("@createCheckoutSession")
      cy.wait("@stripeCheckout")
      cy.location("pathname").should("match", /\/pay\/[0-9a-f-]+$/)
      cy.getCy("paypage-confirming-notice").should("exist")
      cy.getCy("paypage-card").should("have.attr", "data-state", "confirming")

      // The webhook marks the payment paid and the polling page notices
      cy.then(() => cy.serverCommand("completeStripeCheckout", { updateToken }))
      cy.getCy("paypage-card", { timeout: 20000 }).should(
        "have.attr",
        "data-state",
        "paid"
      )
      cy.getCy("paypage-confirming-notice").should("not.exist")
    })
  })

  it("falls back to the normal success flow if Checkout can't be started", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      paymentMode: "DURING_REGISTRATION",
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

    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      // Action
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/${event.slug}/register/${quota.id}`
      )
      fillRegistrationForm()
      cy.getCy("eventregistrationform-button-submit").click()

      // Assertion: the registration is saved and the event page is shown
      cy.wait("@createCheckoutSession")
      cy.url().should("equal", Cypress.env("ROOT_URL") + `/event/${event.slug}`)
      cy.getCy("eventpage-signups-quota-0-table").should("contain", "Etunimi")
    })
  })

  it("/pay polls after returning from Checkout until the payment is paid", () => {
    // Setup: an existing unpaid registration
    cy.serverCommand("createTestEventData", {
      paymentMode: "DURING_REGISTRATION",
      priceCents: 1000,
    }).as("createEventDataResult")

    cy.get("@createEventDataResult").then(({ registrationSecret }: any) => {
      const updateToken = registrationSecret.update_token
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
    })
  })

  it("shows the refund breakdown when cancelling a card-paid registration", () => {
    // Setup: a registration paid by card
    cy.serverCommand("createTestEventData", {
      paymentMode: "DURING_REGISTRATION",
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

        // Assertion: paid 15,25, fee 0,25 kept, 15,00 back to the card
        cy.getCy("cancel-refund-breakdown")
          .should("contain", "15,25 €")
          .and("contain", "0,25 €")
        cy.getCy("cancel-refund-amount").should("contain", "15,00 €")
        cy.getCy("eventregistrationform-button-delete-and-refund")
          .should("contain", "15,00 €")
          .click()

        cy.url().should(
          "equal",
          Cypress.env("ROOT_URL") + `/event/${event.slug}`
        )
      }
    )
  })
})
