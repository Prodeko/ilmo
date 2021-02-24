/// <reference types="Cypress" />

context("Create event", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"));
  beforeEach(() => cy.serverCommand("clearTestEventData"));
  beforeEach(() => cy.serverCommand("clearTestOrganizations"));

  it("can create an event", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult");
    cy.login({
      verified: true,
      orgs: [["Test Organization", "test-organization"]],
    });

    // Action
    cy.get("@createEventDataResult").then(() => {
      cy.visit(Cypress.env("ROOT_URL") + "/event/create");
      cy.getCy("eventform-select-language").click();
      // Both languages are selected by default. Click twice to make sure
      // the select works.
      cy.getCy("eventform-select-language-option-en").click();
      cy.getCy("eventform-select-language-option-en").click();
      cy.getCy("eventform-select-language").click();

      cy.getCy("eventform-select-organization-id").click();
      cy.getCy("eventform-select-organization-id-option-0").click();

      cy.getCy("eventform-select-category-id").click();
      cy.getCy("eventform-select-category-id-option-0").click();

      cy.getCy("eventform-input-name-fi").type("Testitapahtuma");
      cy.getCy("eventform-input-name-en").type("Test event");

      cy.getCy("eventform-input-description-fi").type("Testikuvaus");
      cy.getCy("eventform-input-description-en").type("Test description");

      cy.getCy("eventform-input-event-time").eq(0).click();
      cy.getCy("eventform-input-event-time").within(() => {
        cy.get("input[id='eventTime']").type("2021-02-08 01:58", {
          force: true,
        });
        cy.get("input").eq(1).click().type("2021-02-08 01:59", { force: true });
      });
      cy.get(".ant-picker-footer button").click();

      cy.getCy("eventform-input-registration-time").eq(0).click();
      cy.getCy("eventform-input-registration-time").within(() => {
        cy.get("input[id='registrationTime']").type("2021-02-08 00:58", {
          force: true,
        });
        cy.get("input").eq(1).click().type("2021-02-08 00:59", { force: true });
      });
      cy.get(".ant-picker-footer button").eq(1).click();

      cy.getCy("eventform-switch-highlight").click();

      cy.getCy("eventform-header-image-upload").attachFile("kitten.jpg");
      cy.get(".antd-img-crop-modal button").contains("OK").click();

      cy.getCy("eventform-button-submit").click();
    });

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/");
    cy.getCy("homepage-signup-closed-events").should(
      "contain",
      "Testitapahtuma"
    );
    cy.getCy("homepage-signup-closed-events")
      .contains("Testitapahtuma")
      .closest("tr")
      .should("have.class", "table-row-highlight");
  });

  it("redirects to index if user is not part of any organization", () => {
    // Setup
    cy.serverCommand("createTestEventData").as("createEventDataResult");
    cy.login({
      verified: true,
    });

    // Action
    cy.get("@createEventDataResult").then(() => {
      cy.visit(Cypress.env("ROOT_URL") + "/event/create");
    });

    // Assertion
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/");
  });
});
