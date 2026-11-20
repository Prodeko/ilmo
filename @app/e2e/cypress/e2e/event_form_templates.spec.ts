/// <reference types="Cypress" />

import dayjs from "dayjs"

const format = "YYYY-MM-DD HH:mm:ss"
const openDropdown = ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"

// Clicks a day of the month shown in the open picker's first calendar
const clickDay = (day: number) =>
  cy
    .get(`${openDropdown} .ant-picker-date-panel`)
    .first()
    .contains(".ant-picker-cell-in-view", new RegExp(`^${day}$`))
    .click()

context("Event form templates, preview and day click", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("admin can fill the event form from templates and preview it", () => {
    cy.serverCommand("createTestEventData", {
      eventSignupUpcoming: true,
      userIsAdmin: true,
    }).as("createEventDataResult")

    cy.get("@createEventDataResult").then(() => {
      cy.login({
        username: "testuser",
        password: "DOESNT MATTER",
        existingUser: true,
      })
      cy.visit(Cypress.env("ROOT_URL") + "/admin/event/create")
      cy.get(".ant-tabs-tab").as("tabs")

      // A day click fills in the whole range and closes the calendar
      const month = dayjs()
      cy.getCy("eventform-input-event-time").eq(0).click()
      clickDay(20)
      cy.get(openDropdown).should("not.exist")
      cy.getCy("eventform-input-event-time")
        .eq(0)
        .should(
          "have.value",
          month.date(20).hour(12).startOf("hour").format(format)
        )
      cy.getCy("eventform-input-event-time")
        .eq(1)
        .should("have.value", month.date(20).endOf("day").format(format))

      cy.getCy("eventform-input-registration-time").eq(0).click()
      clickDay(10)
      cy.get(openDropdown).should("not.exist")
      cy.getCy("eventform-input-registration-time")
        .eq(0)
        .should(
          "have.value",
          month.date(10).hour(12).startOf("hour").format(format)
        )
      cy.getCy("eventform-input-registration-time")
        .eq(1)
        .should(
          "have.value",
          month.date(10).add(7, "day").endOf("day").format(format)
        )

      // Quota template and a ready-made quota
      cy.get("@tabs").eq(1).click()
      cy.getCy("eventform-quotas-template-yearGroups").closest("label").click()
      cy.getCy("eventform-input-quotas-title-fi-0").should("have.value", "I")
      cy.getCy("eventform-input-quotas-title-fi-4").should("have.value", "N")
      cy.getCy("eventform-quotas-presets")
        .find("input[type=checkbox]")
        .first()
        .check()
      cy.getCy("eventform-input-quotas-title-fi-5").should(
        "have.value",
        "Avoin kiintiö"
      )
      // Dropping the template keeps the hand-picked quota
      cy.getCy("eventform-quotas-template-none").closest("label").click()
      cy.get(".ant-modal-confirm-btns .ant-btn-primary").click()
      cy.getCy("eventform-input-quotas-title-fi-0").should(
        "have.value",
        "Avoin kiintiö"
      )
      cy.getCy("eventform-input-quotas-title-fi-1").should("not.exist")

      // Event template with question presets
      cy.get("@tabs").eq(2).click()
      cy.getCy("eventform-questions-template-sitsit").closest("label").click()
      cy.getCy("eventform-input-questions-0-fi-label").should(
        "have.value",
        "Telegram"
      )
      cy.getCy("eventform-select-questions-type-5").should("exist")
      cy.getCy("eventform-select-questions-type-6").should("not.exist")

      // The preview shows the registration form with those questions
      cy.get("@tabs").eq(3).click()
      cy.getCy("eventregistrationform-button-submit").should("be.visible")
      cy.get(".ant-tabs-tabpane-active").should("contain", "Telegram")
      cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/event/create")
    })
  })
})
