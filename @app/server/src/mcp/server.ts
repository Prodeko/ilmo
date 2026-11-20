import {
  ClaimRegistrationTokenDocument,
  ClaimRegistrationTokenMutation,
  CreateEventDocument,
  CreateEventMutation,
  CreateEventRegistrationDocument,
  CreateEventRegistrationMutation,
  McpEventDocument,
  McpEventOptionsDocument,
  McpEventOptionsQuery,
  McpEventQuery,
  McpEventsDocument,
  McpEventsQuery,
  McpEventSummaryFragment,
  QuestionType,
} from "@app/graphql"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { DocumentNode } from "graphql"
import { z } from "zod"

import { createEventInput, validateNewEvent } from "./events"
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

export function createMcpServer(
  runner: GraphQLRunner,
  { isAdmin }: { isAdmin: boolean }
) {
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

  if (isAdmin) registerAdminTools(server, runner)

  return server
}

const translatedSchema = z.object({
  fi: z.string().min(1),
  en: z.string().min(1).optional(),
})

const datetimeSchema = z.iso
  .datetime({ offset: true })
  .describe("ISO 8601 with a UTC offset, e.g. 2026-11-07T10:00:00+02:00")

function registerAdminTools(server: McpServer, runner: GraphQLRunner) {
  server.registerTool(
    "list_event_options",
    {
      title: "List organizers and categories",
      description:
        "Admin only. Lists the organizations that can organize events and the event categories of each, with the ids create_event needs.",
      annotations: { readOnlyHint: true },
    },
    () =>
      withToolErrors(async () => {
        const data = await runner.transaction((run) =>
          run<McpEventOptionsQuery>(McpEventOptionsDocument)
        )
        const categories = data.eventCategories?.nodes ?? []
        const organizations = [...(data.organizations?.nodes ?? [])].sort(
          (a, b) => a.name.localeCompare(b.name, "fi")
        )
        return json(
          organizations.map((o) => ({
            id: o.id,
            name: o.name,
            categories: categories
              .filter((c) => c.ownerOrganization?.id === o.id)
              .map((c) => ({ id: c.id, name: c.name })),
          }))
        )
      })
  )

  server.registerTool(
    "create_event",
    {
      title: "Create event (draft)",
      description:
        "Admin only. Creates an event as an unpublished draft with its quotas and registration questions. An admin reviews and publishes it in the ilmo admin UI; the result links there. Confirm the details with the user before calling this. Finnish texts are required, English ones optional.",
      inputSchema: {
        organizationId: z.string().describe("From list_event_options"),
        categoryId: z
          .string()
          .describe("A category of that organization, from list_event_options"),
        name: translatedSchema,
        description: z
          .object({ fi: z.string().optional(), en: z.string().optional() })
          .describe("Plain text; separate paragraphs with a blank line"),
        location: z.string().min(1),
        eventStartTime: datetimeSchema,
        eventEndTime: datetimeSchema,
        registrationStartTime: datetimeSchema,
        registrationEndTime: datetimeSchema.describe(
          "Must be before eventStartTime"
        ),
        openQuotaSize: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe(
            "Extra spots shared by all quotas once a quota is full; 0 for none"
          ),
        isHighlighted: z.boolean().default(false),
        quotas: z
          .array(
            z.object({ title: translatedSchema, size: z.number().int().min(1) })
          )
          .default([]),
        questions: z
          .array(
            z.object({
              type: z.enum(QuestionType),
              label: translatedSchema,
              required: z.boolean().default(false),
              options: z
                .array(translatedSchema)
                .optional()
                .describe("Answer options for RADIO and CHECKBOX questions"),
            })
          )
          .default([]),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args) =>
      withToolErrors(async () => {
        const options = await runner.transaction((run) =>
          run<McpEventOptionsQuery>(McpEventOptionsDocument)
        )
        const errors = validateNewEvent(args, options)
        if (errors.length > 0) {
          throw new ToolError(`Event not created:\n- ${errors.join("\n- ")}`)
        }

        const data = await runner.transaction((run) =>
          run<CreateEventMutation>(CreateEventDocument, {
            input: createEventInput(args),
          })
        )
        const event = data.createEvent?.event
        if (!event) throw new ToolError("Creating the event failed.")

        return json({
          created: true,
          isDraft: true,
          id: event.id,
          slug: event.slug,
          name: event.name,
          editUrl: `${process.env.ROOT_URL}/admin/event/update/${event.id}`,
          note: "The event is a draft and not visible to members. Review it at editUrl and publish it there.",
        })
      })
  )
}
