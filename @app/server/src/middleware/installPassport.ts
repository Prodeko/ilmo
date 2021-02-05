import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import got from "got";
import passport from "passport";
import { Strategy as Oauth2Strategy } from "passport-oauth2";

import installPassportStrategy from "./installPassportStrategy";

const { NODE_ENV } = process.env;
const isDevOrTest = NODE_ENV === "development" || NODE_ENV === "test";
interface ProdekoUser {
  pk: string;
  email: string;
  first_name: string;
  last_name: string;
  has_accepted_policies: boolean;
  is_staff: boolean;
  is_superuser: boolean;
}
declare module "http" {
  export interface IncomingMessage {
    login(user: Express.User, done: (err: any) => void): void;
    logout(): void;
    user: { session_id: string };
  }
}

declare global {
  namespace Express {
    interface User {
      session_id: string;
    }
  }
}
const Passport: FastifyPluginAsync = async (app) => {
  passport.serializeUser((sessionObject, done) => {
    done(null, sessionObject.session_id);
  });

  passport.deserializeUser((session_id: string, done) => {
    done(null, { session_id });
  });

  const passportInitializeMiddleware = passport.initialize();
  app.use(passportInitializeMiddleware);
  app.websocketMiddlewares.push(passportInitializeMiddleware);

  const passportSessionMiddleware = passport.session();
  app.use(passportSessionMiddleware);
  app.websocketMiddlewares.push(passportSessionMiddleware);

  if (process.env.PRODEKO_OAUTH_KEY) {
    await installPassportStrategy(
      app.express,
      app.rootPgPool,
      "oauth2",
      Oauth2Strategy,
      {
        clientID: process.env.PRODEKO_OAUTH_KEY,
        clientSecret: process.env.PRODEKO_OAUTH_SECRET,
        authorizationURL: `${process.env.PRODEKO_OAUTH_ROOT_URL}/oauth2/auth`,
        tokenURL: `${process.env.PRODEKO_OAUTH_ROOT_URL}/oauth2/token`,
      },
      {},
      async (_empty, accessToken, _refreshToken, _extra, _req) => {
        const headers = {
          Authorization: `Bearer ${accessToken}`,
        };

        // Get user details
        const userResponse = await got<ProdekoUser>(
          `${process.env.PRODEKO_OAUTH_ROOT_URL}/oauth2/user_details/`,
          {
            method: "GET",
            headers,
            responseType: "json",
            https: {
              rejectUnauthorized: !isDevOrTest,
            },
          }
        );

        const {
          pk,
          email,
          first_name,
          has_accepted_policies,
        } = userResponse.body;

        if (!has_accepted_policies) {
          const e = new Error(
            `You have not accepted Prodeko's privacy policy.
Please accept our privacy policy in order to use the site while logged in.
You may accept the policy by logging in via https://prodeko.org/login,
and clicking 'I agree' on the displayed prompt.`.replace(/\n/g, " ")
          );
          e["code"] = "PRPOL";
          throw e;
        }

        // Use email as username since that is the
        // unique field in prodeko.org authentication
        return {
          id: pk,
          displayName: first_name || "",
          username: email,
          avatarUrl:
            "https://static.prodeko.org/media/public/2020/07/07/anonymous_prodeko.jpg",
          email: email,
        };
      },
      ["token", "tokenSecret"]
    );
  }

  app.get("/logout", (req, res) => {
    req.raw.logout();
    res.redirect("/");
  });
};

export default fp(Passport);
