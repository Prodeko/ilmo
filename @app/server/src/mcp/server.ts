import {
  ClaimRegistrationTokenDocument,
  ClaimRegistrationTokenMutation,
  CreateEventRegistrationDocument,
  CreateEventRegistrationMutation,
  McpEventDocument,
  McpEventQuery,
  McpEventsDocument,
  McpEventsQuery,
  McpEventSummaryFragment,
} from "@app/graphql"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { DocumentNode } from "graphql"
import { z } from "zod"

import { richTextToPlain, validateRegistration } from "./registration"

/**
 * Runs one GraphQL operation as the MCP user. Every call passed to
 * `transaction` shares a single database transaction, which is rolled back
 * when the callback throws.
 */
export type RunGraphQL = <TData>(
  document: DocumentNode,
  variables?: Record<string, unknown>
) => Promise<TData>

export interface GraphQLRunner {
  transaction<T>(fn: (run: RunGraphQL) => Promise<T>): Promise<T>
}

export class ToolError extends Error {}

function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }
}

function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] }
}

async function withToolErrors(
  fn: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ToolError) return toolError(e.message)
    throw e
  }
}

function summary(event: McpEventSummaryFragment) {
  return {
    slug: event.slug,
    name: event.name,
    organizer: event.ownerOrganization?.name ?? null,
    category: event.category?.name ?? null,
    location: event.location,
    eventStartTime: event.eventStartTime,
    eventEndTime: event.eventEndTime,
    registrationStartTime: event.registrationStartTime,
    registrationEndTime: event.registrationEndTime,
    signupOpen: !!event.signupOpen,
  }
}

async function fetchEvent(runner: GraphQLRunner, slug: string) {
  const data = await runner.transaction((run) =>
    run<McpEventQuery>(McpEventDocument, { slug })
  )
  if (!data.eventBySlug) {
    throw new ToolError(`No published event with slug "${slug}".`)
  }
  return { event: data.eventBySlug, currentUser: data.currentUser }
}

export function createMcpServer(runner: GraphQLRunner) {
  const server = new McpServer({ name: "ilmo", version: "1.0.0" })

  server.registerTool(
    "list_events",
    {
      title: "List events",
      description:
        "Lists published Prodeko events whose registration is open now or opens later. Names are given in Finnish (fi) and English (en); times are ISO 8601.",
      annotations: { readOnlyHint: true },
    },
    () =>
      withToolErrors(async () => {
        const data = await runner.transaction((run) =>
          run<McpEventsQuery>(McpEventsDocument)
        )
        return json({
          registrationOpen: data.signupOpenEvents?.nodes.map(summary) ?? [],
          registrationUpcoming:
            data.signupUpcomingEvents?.nodes.map(summary) ?? [],
        })
      })
  )

  server.registerTool(
    "get_event",
    {
      title: "Get event",
      description:
        "Returns one event with its description, quotas (with how many have registered) and the registration questions. Call this before register_to_event: it lists the quota ids, the question ids and the allowed answer options.",
      inputSchema: { slug: z.string().describe("Event slug from list_events") },
      annotations: { readOnlyHint: true },
    },
    ({ slug }) =>
      withToolErrors(async () => {
        const { event, currentUser } = await fetchEvent(runner, slug)
        return json({
          ...summary(event),
          description: {
            fi: richTextToPlain(event.description?.fi),
            en: richTextToPlain(event.description?.en),
          },
          quotas: event.quotas.nodes.map((q) => ({
            id: q.id,
            title: q.title,
            size: q.size,
            registered: q.registrations.totalCount,
          })),
          openQuotaSize: event.openQuotaSize,
          questions: event.eventQuestions.nodes.map((q) => ({
            id: q.id,
            type: q.type,
            label: q.label,
            required: q.isRequired,
            options: q.data?.filter(Boolean) ?? null,
          })),
          answerFormat:
            "answers maps question id to a string for TEXT and RADIO questions and to a list of strings for CHECKBOX questions. RADIO and CHECKBOX answers must be option labels, in either language.",
          you: {
            name: currentUser?.name ?? null,
            email: currentUser?.primaryEmail ?? null,
          },
        })
      })
  )

  server.registerTool(
    "register_to_event",
    {
      title: "Register to event",
      description:
        "Registers a person to an event quota. Registrations are first come, first served: when the quota is full the person is placed in the open quota or the queue, and the result says which. A confirmation email with a link for editing or cancelling the registration is sent to the given email address. Confirm the details with the user before calling this.",
      inputSchema: {
        slug: z.string().describe("Event slug"),
        quotaId: z.string().describe("Quota id from get_event"),
        firstName: z.string().describe("First name, no spaces"),
        lastName: z.string().describe("Last name, no spaces"),
        email: z
          .string()
          .email()
          .optional()
          .describe("Defaults to the signed-in user's primary email"),
        answers: z
          .record(z.string(), z.union([z.string(), z.array(z.string())]))
          .optional()
          .describe("Question id to answer, see get_event"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args) =>
      withToolErrors(async () => {
        const { event, currentUser } = await fetchEvent(runner, args.slug)
        const email = args.email ?? currentUser?.primaryEmail
        if (!email) {
          throw new ToolError(
            "No email given and the signed-in user has no primary email."
          )
        }
        const input = {
          quotaId: args.quotaId,
          firstName: args.firstName,
          lastName: args.lastName,
          email,
          answers: args.answers ?? {},
        }
        const errors = validateRegistration(event, input)
        if (errors.length > 0) {
          throw new ToolError(
            `Registration not sent:\n- ${errors.join("\n- ")}`
          )
        }

        const registration = await runner.transaction(async (run) => {
          const claim = await run<ClaimRegistrationTokenMutation>(
            ClaimRegistrationTokenDocument,
            { input: { eventId: event.id, quotaId: input.quotaId } }
          )
          const registrationToken =
            claim.claimRegistrationToken?.claimRegistrationTokenOutput
              ?.registrationToken
          if (!registrationToken) {
            throw new ToolError("Claiming a registration spot failed.")
          }
          const created = await run<CreateEventRegistrationMutation>(
            CreateEventRegistrationDocument,
            {
              input: {
                ...input,
                eventId: event.id,
                registrationToken,
              },
            }
          )
          return created.createRegistration?.registration
        })
        if (!registration) {
          throw new ToolError("Registration failed.")
        }

        return json({
          registered: true,
          event: event.name,
          quota: registration.quota?.title ?? null,
          status: registration.status,
          position: registration.position,
          email,
          note: "IN_QUOTA means a confirmed spot, IN_OPEN_QUOTA a spot in the shared open quota, IN_QUEUE a place in the waiting list. A confirmation email was sent.",
        })
      })
  )

  return server
}
