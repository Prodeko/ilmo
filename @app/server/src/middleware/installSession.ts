import ConnectRedis from "connect-redis";
import { RequestHandler } from "express";
import session from "express-session";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const RedisStore = ConnectRedis(session);

const MILLISECOND = 1;
const SECOND = 1000 * MILLISECOND;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const { SECRET } = process.env;
if (!SECRET) {
  throw new Error("Server misconfigured");
}
const MAXIMUM_SESSION_DURATION_IN_MILLISECONDS =
  parseInt(process.env.MAXIMUM_SESSION_DURATION_IN_MILLISECONDS || "", 10) ||
  3 * DAY;

const Session: FastifyPluginAsync = async (app) => {
  const store = new RedisStore({
    client: app.redis,
  });

  const sessionMiddleware = session({
    rolling: true,
    saveUninitialized: false,
    resave: false,
    cookie: {
      maxAge: MAXIMUM_SESSION_DURATION_IN_MILLISECONDS,
      httpOnly: true, // default
      sameSite: "strict",
      secure: "auto", // May need to app.set('trust proxy') for this to work.
    },
    store,
    secret: SECRET,
  });

  /**
   * For security reasons we only enable sessions for requests within our
   * own website; external URLs that need to issue requests to us must use a
   * different authentication method such as bearer tokens.
   */
  const wrappedSessionMiddleware: RequestHandler = (req, res, next) => {
    if (req.isSameOrigin) {
      sessionMiddleware(req, res, next);
    } else {
      next();
    }
  };

  app.use(wrappedSessionMiddleware);
  app.websocketMiddlewares.push(wrappedSessionMiddleware);
};

export default fp(Session);
