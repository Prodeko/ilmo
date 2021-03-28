module.exports = {
  locales: ["fi", "en"],
  defaultLocale: "fi",
  pages: {
    "*": ["common", "error"],
    "/404": ["error"],
    "/": ["home", "events"],
    "/login": ["login"],
    "/create-event-category": ["events"],
    "/event/create": ["events"],
    "/event/update/[id]": ["events"],
    "/event/[slug]": ["register", "events"],
    "/event/register/[eventId]/q/[quotaId]": ["register"],
    "/update-registration/[updateToken]": ["register"],
  },
  loadLocaleFrom: (lang, ns) =>
    import(`./src/translations/${lang}/${ns}.json`).then((m) => m.default),
};
