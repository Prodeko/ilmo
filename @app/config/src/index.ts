// @ts-ignore
const packageJson = require("../../../package.json");

export const fromEmail = '"Prodeko ilmo" <no-reply@prodeko.org';
export const awsRegion = "eu-north-1";
export const projectName = packageJson.name.replace(/[-_]/g, " ");
export const companyName = projectName; // For copyright ownership
export const emailLegalText =
  // Envvar here so we can override on the demo website
  process.env.LEGAL_TEXT || "© Prodeko Webbitiimi";
