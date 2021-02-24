/// <reference types="Cypress" />

context("Update event", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"));
  beforeEach(() => cy.serverCommand("clearTestEventData"));
  beforeEach(() => cy.serverCommand("clearTestOrganizations"));

  it("can update an existing event", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult");

    // Action
    cy.get("@createEventDataResult").then(
      ({ event, organization, eventCategory }: any) => {
        cy.login({
          username: "testuser_events",
          password: "DOESNT MATTER",
          existingUser: true,
        });
        cy.visit(Cypress.env("ROOT_URL") + `/event/update/${event.id}`);

        // Assertion
        cy.getCy("eventform-select-language").contains("Suomi");
        cy.getCy("eventform-select-language").contains("Englanti");
        cy.getCy("eventform-select-organization-id").contains(
          organization.name
        );
        cy.getCy("eventform-select-category-id").contains(
          eventCategory.name["fi"]
        );
        cy.getCy("eventform-input-name-fi").should(
          "have.value",
          event.name["fi"]
        );
        cy.getCy("eventform-input-name-en").should(
          "have.value",
          event.name["en"]
        );
        cy.getCy("eventform-input-description-fi").should(
          "have.value",
          event.description["fi"]
        );
        cy.getCy("eventform-input-description-en").should(
          "have.value",
          event.description["en"]
        );

        // TODO: assert dates are correct
        // cy.getCy("eventform-input-event-time").within(() => {
        //   cy.get("input").eq(0).should("have.value", event.event_start_time);
        //   cy.get("input").eq(1).should("have.value", event.event_end_time);
        // });

        // cy.getCy("eventform-input-registration-time").within(() => {
        //   cy.get("input").eq(0).should("have.value", event.event_start_time);
        //   cy.get("input").eq(1).should("have.value", event.event_end_time);
        // });

        cy.getCy("eventform-switch-highlight").should(
          "have.attr",
          "aria-checked",
          event.is_highlighted.toString()
        );

        // Update event
        cy.getCy("eventform-input-name-fi")
          .clear()
          .type("Päivitetty testitapahtuma");
        cy.getCy("eventform-switch-highlight").click();
        cy.getCy("eventform-header-image-upload").attachFile("kitten.jpg");
        cy.get(".antd-img-crop-modal button").contains("OK").click();

        cy.getCy("eventform-button-submit").click();
      }
    );

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/");
    cy.getCy("homepage-signup-open-events").should(
      "contain",
      "Päivitetty testitapahtuma"
    );
  });

  it("redirects to index if event is not found", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult");

    // Action
    cy.get("@createEventDataResult").then(() => {
      // Invalid event id
      cy.visit(
        Cypress.env("ROOT_URL") +
          "/event/update/359befe4-1a63-4f30-b226-b116ee131e90"
      );
    });

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/");
  });
});
