/// <reference types="Cypress" />

context("Create event", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"));
  beforeEach(() => cy.serverCommand("clearTestEventData"));
  beforeEach(() => cy.serverCommand("clearTestOrganizations"));

  it("can create an event", () => {
    // Setup
    cy.serverCommand("createTestEventData", {}).as("createEventDataResult");
    cy.login({
      next: "/",
      verified: true,
      orgs: [["Test Organization", "test-organization"]],
    });

    // Action
    cy.get("@createEventDataResult").then(() => {
      cy.visit(Cypress.env("ROOT_URL") + "/create-event");
      cy.getCy("createevent-select-language").click();
      cy.getCy("createevent-select-language-option-en").click();
      cy.getCy("createevent-select-language").click();

      cy.getCy("createevent-select-organization-id").click();
      cy.getCy("createevent-select-organization-id-option-0").click();

      cy.getCy("createevent-select-category-id").click();
      cy.getCy("createevent-select-category-id-option-0").click();

      cy.getCy("createevent-input-name-fi").type("Testitapahtuma");
      cy.getCy("createevent-input-name-en").type("Test event");

      cy.getCy("createevent-input-description-fi").type("Testikuvaus");
      cy.getCy("createevent-input-description-en").type("Test description");

      cy.getCy("createevent-input-rangepicker").eq(0).click();
      cy.getCy("createevent-input-rangepicker").within(() => {
        cy.get("input[id='eventTime']").type("2021-02-08 01:58", {
          force: true,
        });
        cy.get("input").eq(1).click().type("2021-02-08 01:59", { force: true });
      });
      cy.get(".ant-picker-footer button").click();

      cy.getCy("createevent-switch-highlight").click();

      cy.getCy("createevent-header-image-upload").attachFile("kitten.jpg");
      cy.get(".antd-img-crop-modal button").contains("OK").click();

      cy.getCy("createevent-button-create").click();
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
});
