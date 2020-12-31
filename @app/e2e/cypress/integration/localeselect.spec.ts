/// <reference types="Cypress" />

context("LocaleSelect", () => {
  it("changes locale to en", () => {
    // Setup
    cy.visit(Cypress.env("ROOT_URL"));

    // Action
    cy.getCy("localeselect-en").click();

    // Assertions
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/en");
    cy.getCy("localeselect-fi").should("exist");
    cy.getCy("localeselect-en").should("exist");
  });

  it("changes locale to fi", () => {
    // Setup
    cy.visit(Cypress.env("ROOT_URL"));

    // Action
    cy.getCy("localeselect-fi").click();

    // Assertions
    // 'fi' is the default locale  so it doesn't get appended to the url
    cy.url().should("equal", Cypress.env("ROOT_URL") + "/");
    cy.getCy("localeselect-fi").should("exist");
    cy.getCy("localeselect-en").should("exist");
  });
});
