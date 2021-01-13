/// <reference types="Cypress" />

context("Events page", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"));
  beforeEach(() => cy.serverCommand("clearTestEventData"));
  beforeEach(() => cy.serverCommand("clearTestOrganizations"));

  it("Can navigate to an event from homepage", () => {
    // Setup
    cy.serverCommand("createTestEventData", {}).as("createEventDataResult");
    cy.visit(Cypress.env("ROOT_URL"));

    // Action
    cy.get("@createEventDataResult").then(
      ({ eventCategory, event, quota }: any) => {
        cy.getCy("homepage-signup-open-events").find("a").click();

        // Assertions
        cy.url().should(
          "equal",
          `${Cypress.env("ROOT_URL")}/event/${event.slug}`
        );
        cy.getCy("eventpage-signups-table").should("exist");
        cy.getCy("eventpage-quotas-card").should("exist");

        cy.contains(event.name).should("exist");
        cy.contains(eventCategory.name).should("exist");
        cy.contains(quota.title).should("exist");
      }
    );
  });

  it("Can register to an event multiple times on the same machine", () => {
    // Setup
    cy.serverCommand("createTestEventData", {}).as("createEventDataResult");

    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      // Action
      cy.visit(`${Cypress.env("ROOT_URL")}/event/${event.slug}`);
      cy.getCy("eventpage-quotas-link-0").click();
      cy.url().should(
        "equal",
        `${Cypress.env("ROOT_URL")}/register/e/${event.id}/q/${quota.id}`
      );

      // Create first registration
      cy.getCy("createregistration-input-firstname").type("Test");
      cy.getCy("createregistration-input-lastname").type("Testersson");
      cy.getCy("createregistration-input-email").type(
        "test.testersson@example.com"
      );
      cy.getCy("createregistration-button-create").click();

      cy.getCy("eventpage-quotas-link-0").click();
      cy.url().should(
        "equal",
        `${Cypress.env("ROOT_URL")}/register/e/${event.id}/q/${quota.id}`
      );

      // Create second registration
      cy.getCy("createregistration-input-firstname").type("Per");
      cy.getCy("createregistration-input-lastname").type("Webteamsson");
      cy.getCy("createregistration-input-email").type(
        "per.Webteamsson@example.com"
      );
      cy.getCy("createregistration-button-create").click();

      // Assertions
      cy.getCy("eventpage-signups-table").contains(quota.title);

      cy.getCy("eventpage-signups-table").should("exist");
      cy.getCy("eventpage-signups-table").contains("Test");
      cy.getCy("eventpage-signups-table").contains("Testersson");
      cy.getCy("eventpage-signups-table").contains("Per");
      cy.getCy("eventpage-signups-table").contains("Webteamsson");
    });
  });

  it("Registration rate limiting works", () => {
    // Setup
    cy.serverCommand("createTestEventData", {}).as("createEventDataResult");

    cy.get("@createEventDataResult").then(({ event, quota }: any) => {
      // Action
      cy.visit(`${Cypress.env("ROOT_URL")}/event/${event.slug}`);
      cy.getCy("eventpage-quotas-link-0").click();
      cy.url().should(
        "equal",
        `${Cypress.env("ROOT_URL")}/register/e/${event.id}/q/${quota.id}`
      );

      // Reload page, hit rate limit (3 requests from the same IP)
      [...Array(3)].forEach(() => {
        cy.reload();
      });

      // Assertions
      cy.getCy("createregistration-error-alert").contains("Too many requests.");
    });
  });
});
