module.exports = {
  locales: ["fi", "en"],
  defaultLocale: "fi",
  pages: {
    "*": ["common", "error"],
    "/": ["home", "events"],
    "/login": ["login"],
    "/reset": ["reset"],
    "/forgot": ["forgot"],
    "/verify": ["verify"],
    "/settings/profile": ["settings"],
    "/settings/accounts": ["settings"],
    "/settings/delete": ["settings"],
    "/settings/emails": ["settings"],
    "/settings/security": ["settings"],
    "/invitations/accept": ["invitations"],
    "/create-event-category": ["events"],
    "/update-registration/[updateToken]": ["register"],
    "rgx:^/admin": ["admin", "events", "home", "register"],
    "rgx:^/event": ["events", "register"],
  },
  loadLocaleFrom: (lang, ns) =>
    import(`./src/translations/${lang}/${ns}.json`).then((m) => m.default),
}
