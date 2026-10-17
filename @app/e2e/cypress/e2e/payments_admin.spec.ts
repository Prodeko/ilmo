/// <reference types="Cypress" />

// Stripe payments from the organizer's side: payment settings and prices in
// the event form, and the payment tools of the registrations tab. Stripe is
// never contacted; card payments are completed with the
// completeStripeCheckout server command (a signed fake webhook event).
//
// Needs a server running with payments enabled (PAYMENTS_ENABLED=1 and both
// Stripe secrets, dummy values are fine); otherwise the tests are skipped.

function loginAndOpenEvent(eventId: string) {
  cy.login({
    username: "testuser",
    password: "DOESNT MATTER",
    existingUser: true,
  })
  cy.visit(Cypress.env("ROOT_URL") + `/admin/event/update/${eventId}`)
}

function openRegistrationsTab() {
  cy.get("[role=tab]").contains("Ilmoittautuneet").click()
}

context("Payments: admin", () => {
  before(function () {
    cy.serverCommand("paymentsEnabled").then(({ enabled }) => {
      if (!enabled) this.skip()
    })
  })
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("sets the payment mode and quota prices", () => {
    // Setup: a free event with one registration
    cy.serverCommand("createTestEventData", { userIsAdmin: true }).as(
      "createEventDataResult"
    )

    cy.get("@createEventDataResult").then(({ event }: any) => {
      loginAndOpenEvent(event.id)

      // Action: payments are collected during registration
      cy.getCy("eventform-radio-payment-mode-NONE").should("be.checked")
      cy.getCy("eventform-radio-payment-mode-DURING_REGISTRATION")
        .closest("label")
        .click()
      // The event already has registrations, which become unpaid
      cy.getCy("eventform-alert-switch-to-paid").should("exist")

      // Quota price
      cy.get(".ant-tabs-tab").eq(1).click()
      cy.getCy("eventform-input-quotas-price-0").clear().type("12")
      cy.getCy("eventform-quotas-guild-receives-0").should(
        "contain",
        "≈ 11,82 €"
      )

      cy.get(".ant-tabs-tab").eq(0).click()
      cy.getCy("eventform-button-submit").click()
      cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/event/list")

      // Assertion: the event page shows the price
      cy.visit(`${Cypress.env("ROOT_URL")}/event/${event.slug}`)
      cy.getCy("eventpage-quotas-price-0").should("contain", "12,00 €")

      // The existing registration now has to pay
      loginAndOpenEvent(event.id)
      cy.getCy("eventform-radio-payment-mode-DURING_REGISTRATION").should(
        "be.checked"
      )
      openRegistrationsTab()
      cy.getCy("registrations-payment-summary-unpaid").should("contain", "1")
      cy.getCy("registrations-payment-status-UNPAID").should("have.length", 1)
    })
  })

  it("marks a registration as paid and undoes it", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      userIsAdmin: true,
      paymentMode: "DURING_REGISTRATION",
      priceCents: 1500,
    }).as("createEventDataResult")

    cy.get("@createEventDataResult").then(({ event }: any) => {
      loginAndOpenEvent(event.id)
      openRegistrationsTab()
      cy.getCy("registrations-payment-status-UNPAID").should("have.length", 1)

      // Action: mark as paid
      cy.getCy("admin-table-more-button").click()
      cy.getCy("admin-table-mark-paid").click()

      // Assertion
      cy.getCy("registrations-payment-status-PAID_MANUALLY").should(
        "have.length",
        1
      )
      cy.getCy("registrations-payment-summary-paid").should("contain", "1")
      cy.getCy("registrations-payment-summary-unpaid").should("contain", "0")
      cy.getCy("registrations-payment-summary-ticketsPaid").should(
        "contain",
        "15,00 €"
      )

      // Action: undo the manual payment
      cy.getCy("admin-table-more-button").click()
      cy.getCy("admin-table-undo-manual-payment").click()
      cy.get(".ant-popover .ant-btn-primary").filter(":visible").click()

      // Assertion
      cy.getCy("registrations-payment-status-UNPAID").should("have.length", 1)
      cy.getCy("registrations-payment-summary-unpaid").should("contain", "1")
    })
  })

  it("sends a payment reminder to unpaid registrations", () => {
    // Setup: three unpaid registrations and one paid by card
    cy.serverCommand("createTestEventData", {
      userIsAdmin: true,
      paymentMode: "DURING_REGISTRATION",
      priceCents: 1500,
    }).as("createEventDataResult")

    cy.get("@createEventDataResult").then(
      ({ event, quota, registrationSecret }: any) => {
        cy.serverCommand("createRegistrations", {
          eventId: event.id,
          quotaId: quota.id,
          count: 3,
        })
        cy.serverCommand("completeStripeCheckout", {
          updateToken: registrationSecret.update_token,
        })

        loginAndOpenEvent(event.id)
        openRegistrationsTab()
        cy.getCy("registrations-payment-status-PAID").should("have.length", 1)
        cy.getCy("registrations-payment-status-UNPAID").should("have.length", 3)
        cy.getCy("registrations-last-reminder").should("not.exist")

        // Action
        cy.getCy("registrations-button-send-reminders")
          .should("contain", "3")
          .click()
        cy.get(".ant-modal-content")
          .filter(":visible")
          .within(() => {
            cy.get(".ant-btn-primary").should("contain", "3").click()
          })

        // Assertion
        cy.get(".ant-modal-content").should("not.exist")
        cy.getCy("registrations-last-reminder").should("exist")
      }
    )
  })

  it("offers a refund when deleting a registration paid by card", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      userIsAdmin: true,
      paymentMode: "DURING_REGISTRATION",
      priceCents: 1500,
    }).as("createEventDataResult")

    cy.get("@createEventDataResult").then(
      ({ event, registrationSecret }: any) => {
        cy.serverCommand("completeStripeCheckout", {
          updateToken: registrationSecret.update_token,
        })

        loginAndOpenEvent(event.id)
        openRegistrationsTab()
        cy.getCy("registrations-payment-status-PAID").should("have.length", 1)

        // Action
        cy.getCy("admin-table-delete-button").click()

        // Assertion: the refund is offered and ticked by default
        cy.get(".ant-modal-content")
          .filter(":visible")
          .within(() => {
            cy.getCy("admin-table-delete-refund-checkbox")
              .should("be.checked")
              .closest("label")
              .should("contain", "15,00 €")
            cy.get(".ant-btn-dangerous").click()
          })
        cy.getCy("registrations-payment-status-PAID").should("not.exist")
        cy.getCy("registrations-payment-summary-paid").should("contain", "0")
      }
    )
  })
})
