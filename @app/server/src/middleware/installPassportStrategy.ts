import fastifyPassport, { Strategy } from "@fastify/passport"
import { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify"
import { Pool } from "pg"

interface DbSession {
  uuid: string
  user_id: string
  created_at: Date
  last_active: Date
}

interface UserSpec {
  id: string
  displayName: string
  username: string
  avatarUrl?: string
  email: string
  profile?: any
  auth?: any
}

type GetUserInformationFunction = (
  profile: any,
  accessToken: string,
  refreshToken: string,
  extra: any,
  req: FastifyRequest
) => UserSpec | Promise<UserSpec>

/*
 * Add returnTo property using [declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html).
 */
declare module '@fastify/secure-session' {
  interface SessionData {
    returnTo: string;
  }
}

/*
 * Stores where to redirect the user to on authentication success.
 * Tries to avoid redirect loops or malicious redirects.
 */
const setReturnTo: preHandlerHookHandler = (req, _res, done) => {
  const BLOCKED_REDIRECT_PATHS = /^\/+(|auth.*|logout)(\?.*)?$/
  if (!req.session) {
    done()
    return
  }
  // @ts-ignore
  const returnTo = String(req?.query!.next) || req.session.returnTo
  if (
    returnTo &&
    returnTo[0] === "/" &&
    returnTo[1] !== "/" && // Prevent protocol-relative URLs
    !returnTo.match(BLOCKED_REDIRECT_PATHS)
  ) {
    req.session.returnTo = returnTo
  } else {
    delete req.session.returnTo
  }
  done()
}

export default (
  app: FastifyInstance,
  rootPgPool: Pool,
  service: string,
  Strategy: new (...args: any) => Strategy,
  strategyConfig: any,
  authenticateConfig: any,
  getUserInformation: GetUserInformationFunction,
  tokenNames = ["accessToken", "refreshToken"]
) => {
  fastifyPassport.use(
    new Strategy(
      {
        ...strategyConfig,
        callbackURL: `${process.env.ROOT_URL}/auth/${service}/callback`,
        passReqToCallback: true,
      },
      async (
        req: FastifyRequest,
        accessToken: string,
        refreshToken: string,
        extra: any,
        profile: any,
        done: (error: any, user?: any) => void
      ) => {
        try {
          const userInformation = await getUserInformation(
            profile,
            accessToken,
            refreshToken,
            extra,
            req
          )
          if (!userInformation.id) {
            throw new Error(
              `getUserInformation must return a unique id for each user`
            )
          }
          let session: DbSession | null = null
          if (req?.user?.sessionId) {
            ; ({
              rows: [session],
            } = await rootPgPool.query<DbSession>(
              "select * from app_private.sessions where uuid = $1",
              [req.user.sessionId]
            ))
          }
          const {
            rows: [user],
          } = await rootPgPool.query(
            `select * from app_private.link_or_register_user($1, $2, $3, $4, $5)`,
            [
              session ? session.user_id : null,
              service,
              userInformation.id,
              JSON.stringify({
                username: userInformation.username,
                avatar_url: userInformation.avatarUrl,
                email: userInformation.email,
                name: userInformation.displayName,
                ...userInformation.profile,
              }),
              JSON.stringify({
                [tokenNames[0]]: accessToken,
                [tokenNames[1]]: refreshToken,
                ...userInformation.auth,
              }),
            ]
          )
          if (!user || !user.id) {
            throw Object.assign(new Error("Registration failed"), {
              code: "FFFFF",
            });
          }
          if (!session) {
            ; ({
              rows: [session],
            } = await rootPgPool.query<DbSession>(
              `insert into app_private.sessions (user_id) values ($1) returning *`,
              [user.id]
            ))
          }
          if (!session) {
            throw Object.assign(new Error("Failed to create session"), {
              code: "FFFFF",
            });
          }
          done(null, { sessionId: session.uuid })
        } catch (e) {
          done(e)
        }
      }
    )
  )

  app.get(
    `/auth/${service}`,
    {
      preValidation: fastifyPassport.authenticate(service, authenticateConfig),
      preHandler: setReturnTo,
    },
    async (_req, _res) => { }
  )

  app.get(
    `/auth/${service}/callback`,
    {
      preValidation: fastifyPassport.authenticate(service, {
        failureRedirect: "/login",
        successReturnToOrRedirect: "/",
      }),
    },
    async (_req, _res) => { }
  )
}
