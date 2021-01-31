import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import passport from "passport";

declare module "http" {
  export interface IncomingMessage {
    login(user: Express.User, done: (err: any) => void): void;
    logout(): void;
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

  app.get("/logout", (req, res) => {
    req.raw.logout();
    res.redirect("/");
  });
};

export default fp(Passport);
