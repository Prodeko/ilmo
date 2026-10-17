import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CreateEventDocument,
  CreateEventPageQuery,
  EventQuestion,
  Quota,
  UpdateEventDocument,
  UpdateEventPageQuery,
} from "@app/graphql"
import { filterObjectByKeys, formItemLayout, lowercased } from "@app/lib"
import { Badge, Col, Form, Row, Tabs } from "antd"
import dayjs from "dayjs"
import uniq from "lodash/uniq"
import { useRouter } from "next/router"
import slugify from "slugify"
import { CombinedError, useMutation } from "urql"

import { ButtonLink, useTranslation } from "../."

import { EmailTab } from "./EmailTab"
import { EventFormFooter } from "./EventFormFooter"
import { MainTab } from "./MainTab"
import { QuestionsTab } from "./QuestionsTab"
import { QuotasTab } from "./QuotasTab"
import { RegistrationsTab } from "./RegistrationsTab"

import type { Scalars } from "@app/graphql"
import type { JsonValue } from "type-fest"

export type FormValues = {
  languages?: string[]
  ownerOrganizationId?: string
  categoryId?: string
  name?: Scalars["TranslatedField"]["input"]
  description?: JsonValue
  location?: string
  eventTime?: dayjs.Dayjs[]
  registrationTime?: dayjs.Dayjs[]
  isHighlighted?: boolean
  headerImageFile?: string
  isDraft?: boolean
  quotas?: Quota[]
  Questions?: EventQuestion[]
}

interface EventFormProps {
  type: "update" | "create"
  formRedirect: string
  data: CreateEventPageQuery | UpdateEventPageQuery
  // eventId and initialValues are only used when type is "update"
  // i.e. we are updating an existing event
  eventId?: string
  initialValues?: any
}

export function getEventSlug(
  name?: Scalars["TranslatedField"]["input"],
  dates?: dayjs.Dayjs[]
) {
  const eventStartTime = dates?.[0].toISOString()

  const nameFi = name?.fi
  const nameSlug = nameFi
    ? nameFi
    : Object.values(name || {})?.[0] || ("" as string)

  const daySlug = dayjs(eventStartTime).format("YYYY-M-D")
  const slug = slugify(`${daySlug}-${nameSlug}`, {
    lower: true,
  })

  return slug
}

enum TAB {
  General = "general",
  Quotas = "quotas",
  Questions = "questions",
  Registrations = "registrations",
  Email = "email",
}

// Tabs holding the event's form fields, which the footer moves between
const FORM_TABS = [TAB.General, TAB.Quotas, TAB.Questions]

export const EventForm: React.FC<EventFormProps> = (props) => {
  const { formRedirect, data, initialValues, type, eventId } = props
  const { languages, slug, isDraft: initialIsDraft } = initialValues || {}
  const { supportedLanguages } = data || {}
  const languagesLower = useMemo(
    () => lowercased(supportedLanguages),
    [supportedLanguages]
  )
  const initialSelectedLanguages = useMemo(
    () => (type === "update" ? languages || {} : languagesLower),
    [type, languages, languagesLower]
  )

  // Translations, router, urql
  const { t, lang } = useTranslation("events")
  const router = useRouter()

  // Handling form values, errors and submission
  const [form] = Form.useForm()
  const { setFieldsValue } = form
  const [formValues, setFormValues] = useState<FormValues>(initialValues || {})
  const [activeTab, setActiveTab] = useState<TAB>(TAB.General)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<Error | CombinedError | null>(null)
  const [isDraft, setIsDraft] = useState(type === "create" || initialIsDraft)
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    initialSelectedLanguages || []
  )
  // Errors that keep the form from being saved, null until first checked
  const [missingFields, setMissingFields] = useState<string[] | null>(null)
  // Field errors found when saving, shown in the footer since the fields
  // they belong to can be on another tab
  const [submitErrors, setSubmitErrors] = useState<string[] | null>(null)
  const tabsRef = useRef<HTMLDivElement>(null)

  // Saving stays disabled until every field passes validation. useWatch also
  // fires on setFieldsValue, which onValuesChange doesn't. The check also
  // runs again on a language switch, which keeps the form's values, so the
  // reasons are given in the new language
  const watchedValues = Form.useWatch([], form)
  const [recheck, setRecheck] = useState(0)
  useEffect(() => {
    let cancelled = false
    form
      .validateFields({ validateOnly: true })
      .then(() => !cancelled && setMissingFields([]))
      .catch(({ errorFields, outOfDate }) => {
        if (cancelled) return
        // Another validation (e.g. a field validating itself on change)
        // started after this one, which rejects this one without errors
        // whatever the fields hold. Check again once it has started
        if (outOfDate) {
          setTimeout(() => !cancelled && setRecheck((n) => n + 1))
          return
        }
        setMissingFields(
          uniq(errorFields.flatMap(({ errors }) => errors as string[]))
        )
      })
    return () => {
      cancelled = true
    }
  }, [form, watchedValues, recheck, lang])

  // The save errors were given in the previous language
  useEffect(() => {
    setSubmitErrors(null)
    setFormError(null)
  }, [lang])

  const changeTab = useCallback((tab: string) => {
    setActiveTab(tab as TAB)
    // Bring the top of the new tab into view when the footer was used
    // further down the page
    const top = tabsRef.current?.getBoundingClientRect().top
    if (top !== undefined && top < 0) {
      tabsRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [])

  // Mutations
  const eventMutation =
    type === "update" ? UpdateEventDocument : CreateEventDocument
  const [, mutation] = useMutation(eventMutation)

  useEffect(() => {
    // Set form initialValues if they have changed after the initial rendering
    setFieldsValue(initialValues)

    // setSelectedLanguages if languages from initialValues change
    if (initialSelectedLanguages) {
      setSelectedLanguages(initialSelectedLanguages)
      setFieldsValue({ languages: initialSelectedLanguages })
    }
  }, [setFieldsValue, initialValues, initialSelectedLanguages])

  const handleSubmit = useCallback(
    async (values) => {
      setFormSubmitting(true)
      setFormError(null)
      try {
        const {
          name,
          eventTime,
          registrationTime,
          openQuotaSize,
          quotas: formQuotas,
          questions: formQuestions,
          headerImageFile: headerFile,
        } = values

        if (!formQuotas?.length) {
          throw new Error(t("errors.mustProvideEventQuota"))
        }

        const eventStartTime = eventTime[0].toISOString()
        const eventEndTime = eventTime[1].toISOString()

        const registrationStartTime = registrationTime[0].toISOString()
        const registrationEndTime = registrationTime[1].toISOString()

        const slug = getEventSlug(name, eventTime)
        const headerImageFile = headerFile?.originFileObj

        const event = {
          ...filterObjectByKeys(values, [
            "ownerOrganizationId",
            "categoryId",
            "name",
            "description",
            "location",
            "isHighlighted",
            "isDraft",
          ]),
          slug,
          eventStartTime,
          eventEndTime,
          registrationStartTime,
          registrationEndTime,
          headerImageFile,
          openQuotaSize,
        }

        // FormQuotas can be empty if only the open quota is specified
        const quotas =
          formQuotas?.map((q: Quota, index: number) => {
            // Set quota position
            q.position = index
            return filterObjectByKeys(q, ["id", "position", "title", "size"])
          }) || []

        // Questions may be empty
        const questions = formQuestions?.map(
          (q: EventQuestion, index: number) => {
            // Set question position and isRequired
            q.position = index
            q.isRequired = q.isRequired ?? false
            return filterObjectByKeys(q, [
              "id",
              "position",
              "type",
              "label",
              "isRequired",
              "data",
            ])
          }
        )

        const commonInput = { event, quotas, questions }
        const input =
          type === "update"
            ? {
                id: eventId,
                ...commonInput,
              }
            : commonInput

        // eventId is only used in update mutation
        const { error } = await mutation({ input })
        if (error) throw error

        setFormError(null)
        router.push(formRedirect, formRedirect)
      } catch (e) {
        setFormError(e)
      }
      setFormSubmitting(false)
    },
    [mutation, formRedirect, router, t, type, eventId]
  )

  const tabLabels: Record<string, string> = {
    [TAB.General]: t("admin:events.tabs.generalInfo"),
    [TAB.Quotas]: t("admin:events.tabs.quotas"),
    [TAB.Questions]: t("admin:events.tabs.questions"),
  }

  const mainTabProps = {
    type,
    data,
    formValues,
    selectedLanguages,
    setSelectedLanguages,
    supportedLanguages: languagesLower,
  }

  return (
    <Form
      {...formItemLayout}
      form={form}
      initialValues={{
        languages: selectedLanguages,
        isDraft,
        isHighlighted: false,
        openQuotaSize: 0,
        ...initialValues,
      }}
      onFinish={handleSubmit}
      onFinishFailed={({ errorFields }) =>
        setSubmitErrors(uniq(errorFields.flatMap(({ errors }) => errors)))
      }
      onValuesChange={(_, values) => {
        setFormValues(values)
        setSubmitErrors(null)
      }}
    >
      <div ref={tabsRef} />
      <Tabs
        activeKey={activeTab}
        items={[
          {
            key: TAB.General,
            label: tabLabels[TAB.General],
            forceRender: true,
            children: <MainTab {...mainTabProps} />,
          },
          {
            key: TAB.Quotas,
            label: tabLabels[TAB.Quotas],
            forceRender: true,
            children: (
              <QuotasTab
                initialValues={initialValues}
                lang={lang}
                selectedLanguages={selectedLanguages}
              />
            ),
          },
          {
            key: TAB.Questions,
            label: tabLabels[TAB.Questions],
            forceRender: true,
            children: (
              <QuestionsTab
                form={form}
                lang={lang}
                selectedLanguages={selectedLanguages}
              />
            ),
          },
          ...(type === "update"
            ? [
                {
                  key: TAB.Registrations,
                  label: t("common:registrations"),
                  forceRender: true,
                  children: (
                    <RegistrationsTab
                      eventSlug={
                        (data as UpdateEventPageQuery)?.event?.slug as string
                      }
                      questions={
                        (data as UpdateEventPageQuery)?.event?.eventQuestions
                          ?.nodes
                      }
                    />
                  ),
                },
              ]
            : []),
          // The email preview tab is only available in development
          ...(process.env.NODE_ENV !== "production"
            ? [
                {
                  key: TAB.Email,
                  label: t("admin:events.tabs.email"),
                  // Only render the email tab body when it is the active tab to
                  // avoid spamming renderEmailTemplate queries on every form change.
                  children:
                    activeTab === TAB.Email ? (
                      <EmailTab formValues={formValues} />
                    ) : null,
                },
              ]
            : []),
        ]}
        tabBarExtraContent={{
          right: (
            <Row gutter={16}>
              <Col flex={1}>
                <Badge
                  color={isDraft ? "yellow" : "green"}
                  style={{ marginLeft: 8 }}
                  text={isDraft ? t("forms.isDraft") : t("forms.isNotDraft")}
                />
              </Col>
              {type === "update" && (
                <Col flex={1}>
                  <ButtonLink
                    data-cy="admin-button-link-eventpage"
                    disabled={!slug ? true : false}
                    href={`/event/${slug}`}
                    size="small"
                    type="primary"
                  >
                    {t("admin:events.update.showEvent")}
                  </ButtonLink>
                </Col>
              )}
            </Row>
          ),
        }}
        onChange={(tab) => setActiveTab(tab as TAB)}
      />
      <EventFormFooter
        activeTab={activeTab}
        canSubmit={missingFields?.length === 0 && selectedLanguages.length > 0}
        formError={formError}
        formSubmitting={formSubmitting}
        hidden={!FORM_TABS.includes(activeTab)}
        isDraft={isDraft}
        missingFields={missingFields}
        setActiveTab={changeTab}
        setIsDraft={setIsDraft}
        submitErrors={submitErrors}
        tabs={FORM_TABS.map((key) => ({ key, label: tabLabels[key] }))}
        type={type}
      />
    </Form>
  )
}
