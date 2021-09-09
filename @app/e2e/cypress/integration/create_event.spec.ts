/// <reference types="Cypress" />

import dayjs from "dayjs"
import slugify from "slugify"

context("Create event", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("admin can create an event", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      eventSignupUpcoming: true,
      userIsAdmin: true,
    }).as("createEventDataResult")
    cy.login({
      username: "testuser",
      password: "DOESNT MATTER",
      existingUser: true,
    })

    // Action
    cy.get("@createEventDataResult").then(() => {
      cy.getCy("layout-dropdown-user").click()
      cy.getCy("layout-link-admin").click()
      cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/event/list")
      cy.getCy("admin-sider-events").click()
      cy.getCy("admin-sider-create-event").click()
      cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/event/create")

      cy.get(".ant-tabs-tab").as("tabs")

      // General tab

      // Both languages are selected by default. Click twice to make sure
      // the select works.
      cy.getCy("eventform-select-language").click()
      cy.getCy("eventform-select-language-option-en").click()
      cy.getCy("eventform-select-language-option-en").click()
      cy.getCy("eventform-select-language").click()

      cy.getCy("eventform-select-organization-id").click()
      cy.getCy("eventform-select-organization-id-option-0").click()

      cy.getCy("eventform-select-category-id").click()
      cy.getCy("eventform-select-category-id-option-0").click()

      cy.getCy("eventform-input-name-fi").type("Testitapahtuma")
      cy.getCy("eventform-input-name-en").type("Test event")

      cy.getCy("eventform-input-description-fi").type("Testikuvaus")
      cy.getCy("eventform-input-description-en").type("Test description")

      cy.getCy("eventform-input-location").type("Testikatu 123")

      const format = "YYYY-MM-DD HH:MM:ss"
      const today = dayjs()

      cy.getCy("eventform-input-event-time").eq(0).click()
      cy.getCy("eventform-input-event-time").within(() => {
        cy.get("input[id='eventTime']").type(
          today.add(2, "day").format(format),
          {
            force: true,
          }
        )
        cy.get("input")
          .eq(1)
          .click()
          .type(today.add(3, "day").format(format), { force: true })
      })
      cy.get(".ant-picker-footer button").click()

      cy.getCy("eventform-input-registration-time").eq(0).click()
      cy.getCy("eventform-input-registration-time").within(() => {
        cy.get("input[id='registrationTime']").type(
          today.add(-1, "day").format(format),
          {
            force: true,
          }
        )
        cy.get("input")
          .eq(1)
          .click()
          .type(today.add(1, "day").format(format), { force: true })
      })
      cy.get(".ant-picker-footer button").eq(1).click()

      cy.getCy("eventform-switch-save-as-draft").click()

      cy.getCy("eventform-header-image-upload").attachFile("kitten.jpg")
      cy.get(".antd-img-crop-modal button").contains("OK").click()

      // Quotas tab
      cy.get("@tabs").eq(1).click()

      // Test removing quota works
      cy.getCy("eventform-quotas-add-quota").click()
      cy.getCy("eventform-input-quotas-title-fi-0").should("be.visible")
      cy.getCy("eventform-input-quotas-title-en-0").should("be.visible")
      cy.getCy("eventform-quotas-remove-quota").click()
      cy.getCy("eventform-input-quotas-title-fi-0").should("not.exist")
      cy.getCy("eventform-input-quotas-title-en-0").should("not.exist")

      // Test adding quotas works
      // prettier-ignore
      for (var i = 0; i < 3; i++) {
        cy.getCy("eventform-quotas-add-quota").click()
        cy.getCy(`eventform-input-quotas-title-fi-${i}`).type(`Testikiintiö ${i + 1}`)
        cy.getCy(`eventform-input-quotas-title-en-${i}`).type(`Test quota ${i + 1}`)
        cy.getCy(`eventform-input-quotas-size-${i}`).type(`${i}`)
      }

      // Questions tab
      cy.get("@tabs").eq(2).click()

      // Test removing question works
      cy.getCy("eventform-questions-add-question").click()
      cy.getCy("eventform-select-questions-type-0").should("be.visible")
      cy.getCy("eventform-questions-remove-question").click()
      cy.getCy("eventform-select-questions-type-0").should("not.exist")

      const options = ["a", "b", "c"]
      // prettier-ignore
      for (var i = 0; i < 3; i++) {
        cy.getCy("eventform-questions-add-question").click()
        cy.getCy(`eventform-select-questions-type-${i}`).click()
        cy.getCy(`eventform-select-questions-type-${i}-option-${i}`).click()
        cy.getCy(`eventform-input-questions-${i}-fi-label`).should("be.visible")
        cy.getCy(`eventform-input-questions-${i}-en-label`).should("be.visible")
        cy.getCy(`eventform-input-questions-${i}-fi-label`).type(`Testikysymys ${i + 1}`)
        cy.getCy(`eventform-input-questions-${i}-en-label`).type(`Test question ${i + 1}`)
        if (i < 2) {
          for (var j = 0; j < 3; j++) {
            if(j < 2) {
              cy.getCy(`eventform-questions-${i}-add-option`).click()
            }
            cy.getCy(`eventform-input-questions-${i}-data-${j}-fi`).should("be.visible")
            cy.getCy(`eventform-input-questions-${i}-data-${j}-en`).should("be.visible")
            cy.getCy(`eventform-input-questions-${i}-data-${j}-fi`).type(options[j])
            cy.getCy(`eventform-input-questions-${i}-data-${j}-en`).type(options[j])
          }
        }
      }

      // Email tab
      cy.get("@tabs").eq(3).click()

      // Back to general tab
      cy.get("@tabs").eq(0).click()

      cy.getCy("eventform-button-submit").click()

      const daySlug = dayjs(today.add(2, "day")).format("YYYY-M-D")
      const slug = slugify(`${daySlug}-testitapahtuma}`, {
        lower: true,
      })

      // Assertion
      cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/event/list")
      cy.getCy("adminpage-events-open").should("contain", "Testitapahtuma")
      cy.visit(Cypress.env("ROOT_URL"))
      cy.getCy("homepage-signup-open-events").should(
        "contain",
        "Testitapahtuma"
      )

      // Event should not be highlighted
      cy.getCy("eventcard-is-highlighted").should("not.exist")
      cy.getCy(`eventcard-eventpage-link-${slug}`).click()

      cy.url().should("equal", Cypress.env("ROOT_URL") + `/event/${slug}`)

      // Header image should be visible
      cy.getCy("eventpage-header-image").should("be.visible")

      // Quotas should exist and be ordered correctly
      cy.getCy("eventpage-quotas-card")
        .children()
        .eq(1) // Get the card body
        .children()
        .first()
        .should("contain", "Testikiintiö 1")
        .next()
        .should("contain", "Testikiintiö 2")
        .next()
        .should("contain", "Testikiintiö 3")

      // Click first quota to go to registration page. Wait for the button to not be disabled
      // as the server time is being fetched
      // prettier-ignore
      cy.get("[data-cy=eventpage-quotas-link-0]", { timeout: 5000 }).should("not.be.disabled")
      cy.getCy("eventpage-quotas-link-0").click()

      // Questions should exist on registration page
      // prettier-ignore
      for (var i = 0; i < 3; i++) {
        if (i < 2) {
          // CHECKBOX and RADIO questions
          for (var j = 0; j < 3; j++) {
            cy.getCy(`eventregistrationform-questions-${i}-input-option-${j}`)
              .should("exist")
            cy.getCy(`eventregistrationform-questions-${i}-input-option-${j}`)
              .parent()
              .parent()
              .should("contain", options[j])
          }
        } else if (i == 2) {
          // TEXT question
          cy.getCy(`eventregistrationform-questions-${i}-input`).should("be.visible")
        }
      }
    })
  })
})
