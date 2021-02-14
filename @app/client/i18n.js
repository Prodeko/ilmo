module.exports = {
  locales: ["fi", "en"],
  defaultLocale: "fi",
  pages: {
    "*": ["common", "error"],
    "/404": ["error"],
    "/": ["home", "events"],
    "/admin/create-event-category": ["events"],
    "/admin/create-event": ["events"],
    "/event/[slug]": ["register", "events"],
    "/register/e/[eventId]/q/[quotaId]": ["register"],
    "rgx:/admin": ["admin"],
  },
  loadLocaleFrom: (lang, ns) =>
    import(`./src/translations/${lang}/${ns}.json`).then((m) => m.default),
};
