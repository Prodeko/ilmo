module.exports = {
  locales: ["fi", "en"],
  defaultLocale: "fi",
  pages: {
    "*": ["common"],
    "/404": ["error"],
    "/": ["home"],
  },
  loadLocaleFrom: (lang, ns) =>
    import(`./locales/${lang}/${ns}.json`).then((m) => m.default),
};
