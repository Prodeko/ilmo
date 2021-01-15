module.exports = {
  locales: ["fi", "en"],
  defaultLocale: "fi",
  pages: {
    "*": ["common", "error"],
    "/404": ["error"],
    "/": ["home", "events"],
    "/create-event-category": ["events"],
    "/create-event": ["events"],
    "/event/[slug]": ["register", "events"],
    "/register/e/[eventId]/q/[quotaId]": ["register"],
  },
  loadLocaleFrom: (lang, ns) =>
    import(`./locales/${lang}/${ns}.json`).then((m) => m.default),
};
