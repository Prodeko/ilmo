// @ts-ignore
const packageJson = require("../../../package.json");

// TODO: customise this with your own settings!

export const fromEmail = '"Prodeko Tapahtumat" <no-reply@prodeko.org>';
export const awsRegion = "us-east-1";
export const projectName = packageJson.name.replace(/[-_]/g, " ");
export const companyName = "Prodeko"; // For copyright ownership
export const emailLegalText =
  // Envvar here so we can override on the demo website
  process.env.LEGAL_TEXT || "<Insert legal email footer text here >";
