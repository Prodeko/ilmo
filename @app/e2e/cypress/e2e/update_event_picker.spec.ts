/// <reference types="Cypress" />

// Regression test for the production crash where opening the eventTime or
// registrationTime RangePicker on the update page throws
// `TypeError: t.weekday is not a function`. The crash happens when the app's
// dayjs instance (e.g. duplicated in node_modules and never extended with the
// `weekday` plugin) is handed to rc-picker as a pre-populated value: rc-picker
// calls `.weekday()` on the supplied Dayjs to lay out the calendar grid, and
// the unextended prototype lacks that method.

context("Update event picker", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("opens both RangePickers on the update page without crashing", () => {
    cy.serverCommand("createTestEventData", { userIsAdmin: true }).as(
      "createEventDataResult"
    )

    cy.get("@createEventDataResult").then(({ event }: any) => {
      cy.login({
        username: "testuser",
        password: "DOESNT MATTER",
        existingUser: true,
      })

      cy.visit(`${Cypress.env("ROOT_URL")}/admin/event/update/${event.id}`)

      // Event time picker: opening it forces rc-picker to call `.weekday()`
      // on the Dayjs supplied as initialValues. If that throws, Cypress's
      // default uncaught:exception handler fails the test; if the panel
      // partially renders, the date-cell assertion below catches it.
      cy.getCy("eventform-input-event-time").eq(0).click()
      cy.get(
        ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell"
      ).should("exist")
      cy.get("body").type("{esc}")
      cy.get(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)").should(
        "not.exist"
      )

      // Same check for registration time picker.
      cy.getCy("eventform-input-registration-time").eq(0).click()
      cy.get(
        ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell"
      ).should("exist")
    })
  })
})
