/// <reference types="cypress" />

context("Registration reminder preferences", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("sets up once, persists preferences, and enables again without onboarding", () => {
    cy.serverCommand("createTestEventData", { eventSignupUpcoming: true }).then(
      ({ event }: any) => {
        cy.login({
          username: "testuser",
          password: "DOESNT MATTER",
          existingUser: true,
        })
        cy.visit(`${Cypress.env("ROOT_URL")}/en/event/${event.slug}`)
        cy.getCy("event-reminder").should("contain", "Don’t miss registration!")
        cy.getCy("event-reminder").should(
          "not.contain",
          "Registration reminder"
        )
        cy.getCy("event-reminder").find(".ant-alert").should("not.exist")
        cy.getCy("event-reminder-toggle")
          .should("not.be.disabled")
          .and("contain", "Set reminder")
        cy.getCy("event-reminder")
          .contains("Change reminder settings")
          .should("not.exist")
        cy.getCy("event-reminder-toggle").click()
        cy.get(".ant-modal:visible").should("exist")
        cy.getCy("reminder-preferences-channel").click()
        cy.get(".ant-select-dropdown:visible").contains("Email").click()
        cy.getCy("reminder-preferences-next").should("not.be.disabled").click()
        cy.getCy("reminder-preferences-time").click()
        cy.get(".ant-select-dropdown:visible")
          .contains("15 minutes before")
          .click()
        cy.getCy("reminder-preferences-save").click()
        cy.get(".ant-modal:visible").should("not.exist")
        cy.getCy("event-reminder-toast")
          .should("be.visible")
          .and("contain", "Reminder set!")
          .and("contain", "Delivery method: Email")
          .and("contain", "15 minutes before registration opens")
        cy.getCy("event-reminder-toast-settings")
          .should("contain", "Change reminder settings")
          .and("have.attr", "href")
          .and("match", /\/settings\/reminders$/)
        cy.getCy("event-reminder-toggle").should("contain", "Remove reminder")
        cy.getCy("event-reminder-status").should("contain", "Reminder set")
        // The toast is temporary; the footer keeps the enabled state.
        cy.get('[data-cy="event-reminder-toast"]', { timeout: 15000 }).should(
          "not.exist"
        )
        cy.getCy("event-reminder-status").should("contain", "Reminder set")

        cy.reload()
        cy.getCy("event-reminder-toggle").should("not.be.disabled").click()
        cy.getCy("event-reminder").should("contain", "Set reminder")
        cy.getCy("event-reminder-toggle").should("not.be.disabled").click()
        cy.get(".ant-modal:visible").should("not.exist")
        cy.getCy("event-reminder-toast").should("contain", "Reminder set")
        cy.getCy("event-reminder-toggle").should("contain", "Remove reminder")

        cy.visit(`${Cypress.env("ROOT_URL")}/en/settings/reminders`)
        cy.getCy("reminder-preferences-edit").should("exist")
        cy.contains("15 minutes before registration opens").should("exist")
        cy.getCy("reminder-cancel").click()
        cy.contains("You have no registration reminders.").should("exist")
      }
    )
  })

  it("asks signed-out users to sign in", () => {
    cy.serverCommand("createTestEventData", { eventSignupUpcoming: true }).then(
      ({ event }: any) => {
        cy.visit(`${Cypress.env("ROOT_URL")}/en/event/${event.slug}`)
        cy.getCy("event-reminder").should("contain", "Don’t miss registration!")
        cy.getCy("event-reminder-sign-in")
          .should("contain", "Sign in")
          .and("have.attr", "href")
          .and("contain", "/login?next=")
        cy.getCy("event-reminder-toggle").should("not.exist")
      }
    )
  })
})
