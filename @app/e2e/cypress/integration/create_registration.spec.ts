/// <reference types="Cypress" />

context("Create registration", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"));
  beforeEach(() => cy.serverCommand("clearTestEventData"));
  beforeEach(() => cy.serverCommand("clearTestOrganizations"));

  it("can register to an event", () => {
    // Setup
    cy.serverCommand("createTestEventData", {}).as("createEventDataResult");

    // Action
    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      cy.visit(
        Cypress.env("ROOT_URL") + `/event/register/${event.id}/q/${quota.id}`
      );
      cy.getCy("eventregistrationform-input-firstname").type("Etunimi");
      cy.getCy("eventregistrationform-input-lastname").type("Sukunimi");
      cy.getCy("eventregistrationform-input-email").type(
        "etunimi.sukunimi@prodeko.org"
      );

      cy.getCy("eventregistrationform-button-submit").click();

      // Assertion
      cy.url().should(
        "equal",
        Cypress.env("ROOT_URL") + `/event/${event.slug}`
      );
      cy.getCy("eventpage-signups-table").should("contain", "Etunimi");
      cy.getCy("eventpage-signups-table").should("contain", "Sukunimi");
      cy.getCy("eventpage-signups-table").should("contain", quota.title["fi"]);
    });
  });
});
