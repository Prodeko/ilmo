module.exports = {
  locales: ["fi", "en"],
  defaultLocale: "fi",
  pages: {
    "*": ["common", "error"],
    "/404": ["error"],
    "/": ["home", "events"],
    "/create-event-category": ["events"],
    "/create-event": ["events"],
  },
  loadLocaleFrom: (lang, ns) =>
    import(`./locales/${lang}/${ns}.json`).then((m) => m.default),
};
