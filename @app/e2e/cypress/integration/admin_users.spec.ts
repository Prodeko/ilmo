/// <reference types="Cypress" />

context("Create event category", () => {
  beforeEach(() => cy.serverCommand("clearTestUsers"))
  beforeEach(() => cy.serverCommand("clearTestEventData"))
  beforeEach(() => cy.serverCommand("clearTestOrganizations"))

  it("admin can navigate to users page and make another user admin", () => {
    // Setup
    cy.serverCommand("createTestEventData", {
      eventSignupUpcoming: true,
    }).as("createEventDataResult")

    // Action
    cy.get("@createEventDataResult").then(() => {
      // Run login again to create two new users
      cy.login({
        username: "testuser2",
        password: "DOESNT MATTER",
        isAdmin: true,
      })

      cy.getCy("layout-dropdown-user").click()
      cy.getCy("layout-link-admin").click()
      cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/event/list")
      cy.getCy("admin-sider-users").click()
      cy.url().should("equal", Cypress.env("ROOT_URL") + "/admin/users/list")

      // Make the user created with createTestEventData an admin
      cy.getCy("admin-users-switch-is-admin-testuser").click()

      cy.get(".ant-message").contains("Admin statuksen päivitys onnistui")
    })
  })
})
