// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

/// <reference types="Cypress" />

// Import commands.js using ES2015 syntax:
import "./commands"

// Work around 'ResizeObserver loop limit exceeded' error
const resizeObserverLoopErrRe = /^[^(ResizeObserver loop limit exceeded)]/
Cypress.on("uncaught:exception", (err) => {
  /* returning false here prevents Cypress from failing the test */
  if (resizeObserverLoopErrRe.test(err.message)) {
    return false
  }
  // antd-img-crop calls ctx.drawImage on the cropper's <img> before
  // the element is in the DOM in some Electron versions. The crop
  // still produces a valid blob, so swallow the exception.
  if (
    /drawImage|HTMLImageElement|CanvasRenderingContext2D/i.test(err.message)
  ) {
    return false
  }
})

// Hide the Next.js dev error overlay so it doesn't cover elements the test
// is trying to click. The overlay is rendered into <nextjs-portal>.
Cypress.on("window:before:load", (win) => {
  const style = win.document.createElement("style")
  style.textContent =
    "nextjs-portal, [data-nextjs-dialog-overlay] { display: none !important; }"
  ;(win.document.head || win.document.documentElement).appendChild(style)
})
