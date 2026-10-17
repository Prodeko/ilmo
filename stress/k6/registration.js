// One VU = one person trying to get into a contested event.
//
// Flow: load the event page some time before opening and hold its websocket
// subscriptions (EventPage, CurrentTime), then at opening + 0-1 s jitter do
// what the register page does on mount (page query, EventRegistrations
// subscription, ClaimRegistrationToken), fill in the form for 5-20 s and
// submit CreateEventRegistration.
//
// Env: BASE_URL, SEED (JSON from seed.sh), REPO (repo root inside the
// container), VUS.
import { sleep } from "k6"
import http from "k6/http"
import ws from "k6/ws"
import exec from "k6/execution"
import { Counter, Trend } from "k6/metrics"

const BASE_URL = __ENV.BASE_URL || "http://localhost:5678"
const WS_URL = BASE_URL.replace(/^http/, "ws") + "/graphql"
const SEED = JSON.parse(__ENV.SEED)
const VUS = parseInt(__ENV.VUS || "400", 10)
const REPO = __ENV.REPO || "/repo"
const OPENS_AT_MS = Date.parse(SEED.registrationStartTime)

const hashes = JSON.parse(open(`${REPO}/@app/graphql/client.json`))
// The server accepts unpersisted mutations and subscriptions only when the
// text starts with the operation keyword, as urql sends them, while the
// persisted files list fragments first.
const documentOf = (name) => {
  const doc = open(
    `${REPO}/@app/graphql/.persisted_operations/${hashes[name]}.graphql`
  )
  const start = doc.search(/^(query|mutation|subscription)\b/m)
  const rest = doc.slice(start)
  const end = rest.search(/^fragment\b/m)
  const operation = end === -1 ? rest : rest.slice(0, end)
  return operation + "\n" + doc.slice(0, start) + (end === -1 ? "" : rest.slice(end))
}
const EVENT_PAGE_DOC = documentOf("EventPage")
const CURRENT_TIME_DOC = documentOf("CurrentTime")
const EVENT_REGISTRATIONS_DOC = documentOf("EventRegistrations")
const CLAIM_DOC = documentOf("ClaimRegistrationToken")
const CREATE_DOC = documentOf("CreateEventRegistration")

const claimDuration = new Trend("claim_duration", true)
const submitDuration = new Trend("submit_duration", true)
const pageQueryDuration = new Trend("register_page_query_duration", true)
const failures = new Counter("failures")

export const options = {
  scenarios: {
    stampede: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,
      maxDuration: "5m",
    },
  },
  summaryTrendStats: ["p(50)", "p(95)", "p(99)", "max", "count"],
}

// 10% of VUs sit in the guild room behind one shared address.
function clientIp(vu) {
  if (vu % 10 === 0) return "10.99.0.1"
  return `10.${(vu >> 16) & 255}.${(vu >> 8) & 255}.${vu & 255}`
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

// Production cookies are Secure, which k6's jar will not send over plain
// http, so cookies are tracked by hand.
function absorbCookies(jar, res) {
  for (const [name, values] of Object.entries(res.cookies || {})) {
    if (values.length) jar[name] = values[values.length - 1].value
  }
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ")
}

function graphqlErrors(res) {
  if (res.status !== 200) return [`HTTP ${res.status}`]
  let body
  try {
    body = res.json()
  } catch (e) {
    return ["invalid JSON response"]
  }
  return (body.errors || []).map((e) => e.message)
}

export default function () {
  const vu = exec.vu.idInTest
  const ip = clientIp(vu)
  const jar = {}
  const result = {
    vu,
    email: `bot-${vu}@stress.test`,
    clickedAtMs: null,
    claimOk: false,
    submitOk: false,
    errors: [],
  }
  const fail = (step, message) => {
    failures.add(1, { step })
    result.errors.push(`${step}: ${message}`)
  }

  // Arrive on the event page some time in the window before opening.
  const arriveBy = OPENS_AT_MS - 5000
  const waitMs = Math.max(0, randomBetween(0, arriveBy - Date.now()))
  if (waitMs > 0) sleep(waitMs / 1000)

  const page = http.get(`${BASE_URL}/event/${SEED.slug}`, {
    headers: { "X-Forwarded-For": ip },
    tags: { name: "event_page" },
  })
  absorbCookies(jar, page)
  if (page.status !== 200) fail("event_page", `HTTP ${page.status}`)

  const post = (operationName, body, tag) => {
    const res = http.post(`${BASE_URL}/graphql`, JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json",
        "CSRF-Token": jar.csrfToken || "",
        Cookie: cookieHeader(jar),
        "X-Forwarded-For": ip,
      },
      tags: { name: tag },
      timeout: "60s",
    })
    absorbCookies(jar, res)
    return res
  }

  const quotaId = SEED.quotaIds[vu % SEED.quotaIds.length]
  let nextId = 1
  const subscribe = (socket, query, variables) => {
    socket.send(
      JSON.stringify({
        id: String(nextId++),
        type: "subscribe",
        payload: { query, variables },
      })
    )
  }

  const wsRes = ws.connect(
    WS_URL,
    {
      headers: {
        "Sec-WebSocket-Protocol": "graphql-transport-ws",
        Cookie: cookieHeader(jar),
        "X-Forwarded-For": ip,
      },
      tags: { name: "graphql_ws" },
    },
    (socket) => {
      socket.on("open", () => {
        socket.send(JSON.stringify({ type: "connection_init", payload: {} }))
      })

      socket.on("message", (raw) => {
        const msg = JSON.parse(raw)
        if (msg.type === "connection_ack") {
          subscribe(socket, EVENT_PAGE_DOC, { slug: SEED.slug })
          subscribe(socket, CURRENT_TIME_DOC, {})
          const untilOpen = OPENS_AT_MS - Date.now() + randomBetween(0, 1000)
          socket.setTimeout(() => register(socket), Math.max(0, untilOpen))
        } else if (msg.type === "error") {
          fail("subscription", JSON.stringify(msg.payload))
        } else if (msg.type === "next" && msg.payload && msg.payload.errors) {
          for (const e of msg.payload.errors) fail("subscription", e.message)
        }
      })

      socket.on("error", (e) => fail("websocket", String(e.error())))

      // Safety net: never hold a VU beyond the scenario.
      socket.setTimeout(() => socket.close(), 4 * 60 * 1000)
    }
  )
  if (!wsRes || wsRes.status !== 101) {
    fail("websocket", `handshake status ${wsRes && wsRes.status}`)
  }

  function register(socket) {
    const pageQuery = post(
      "CreateEventRegistrationPage",
      {
        operationName: "CreateEventRegistrationPage",
        variables: { slug: SEED.slug, quotaId },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: hashes.CreateEventRegistrationPage,
          },
        },
      },
      "register_page_query"
    )
    pageQueryDuration.add(pageQuery.timings.duration)
    for (const e of graphqlErrors(pageQuery)) fail("register_page_query", e)

    subscribe(socket, EVENT_REGISTRATIONS_DOC, {
      eventId: SEED.eventId,
      after: new Date().toISOString(),
    })

    result.clickedAtMs = Date.now()
    const claim = post(
      "ClaimRegistrationToken",
      {
        operationName: "ClaimRegistrationToken",
        query: CLAIM_DOC,
        variables: { input: { eventId: SEED.eventId, quotaId } },
      },
      "claim"
    )
    claimDuration.add(claim.timings.duration)
    const claimErrors = graphqlErrors(claim)
    for (const e of claimErrors) fail("claim", e)
    if (claimErrors.length) {
      socket.close()
      return
    }
    const token =
      claim.json().data.claimRegistrationToken.claimRegistrationTokenOutput
        .registrationToken
    result.claimOk = true

    socket.setTimeout(() => {
      const submit = post(
        "CreateEventRegistration",
        {
          operationName: "CreateEventRegistration",
          query: CREATE_DOC,
          variables: {
            input: {
              eventId: SEED.eventId,
              quotaId,
              registrationToken: token,
              firstName: "Bot",
              lastName: `Number${vu}`,
              email: result.email,
              answers: null,
            },
          },
        },
        "submit"
      )
      submitDuration.add(submit.timings.duration)
      const submitErrors = graphqlErrors(submit)
      for (const e of submitErrors) fail("submit", e)
      result.submitOk = submitErrors.length === 0
      // Linger briefly like a person reading the confirmation.
      socket.setTimeout(() => socket.close(), 3000)
    }, randomBetween(5000, 20000))
  }

  console.log(`RESULT ${JSON.stringify(result)}`)
}
