/// <reference types="Cypress" />

import { join } from "path"

import Papa from "papaparse"

const validateCsvList = (list, quota, question, registration) => {
  expect(list, "number of records").to.have.length(1)
  expect(list[0], "first record").to.deep.equal({
    // This \ufeff is some BOM stuff. See
    // https://github.com/mafintosh/csv-parser#byte-order-marks for an explanation.
    fullName: registration.first_name + " " + registration.last_name,
    email: registration.email,
    status: "IN_QUOTA",
    position: "1",
    quota: quota.title.fi,
    [question.label.fi]: Object.values(registration.answers).join(","),
  })
}

context("Admin csv download", () => {
  const downloadsFolder = Cypress.config("downloadsFolder")

  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))

  it("can download event registrations as csv", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      userIsAdmin: true,
    }).as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(
      ({ event, question, quota, registration }: any) => {
        cy.login({
          username: "testuser",
          password: "DOESNT MATTER",
          existingUser: true,
        })
        cy.visit(Cypress.env("ROOT_URL") + `/admin/event/update/${event.id}`)
        cy.get("[role=tab]").contains("Ilmoittautuneet").click()
        cy.getCy("button-download-csv").should("exist")
        cy.getCy("button-download-csv").click()

        const filename = join(
          downloadsFolder,
          `${event.slug}-registrations.csv`
        )

        // browser might take a while to download the file,
        // so use "cy.readFile" to retry until the file exists
        // and has length - and we assume that it has finished downloading then
        cy.readFile(filename, { timeout: 15000 })
          .should("have.length.gt", 50)
          // parse CSV text into objects
          .then(
            (data) =>
              Papa.parse(data, {
                header: true, // Converts CSV headers to object keys
                skipEmptyLines: true,
              }).data
          )
          .then((list) => validateCsvList(list, quota, question, registration))
      }
    )
  })
})
