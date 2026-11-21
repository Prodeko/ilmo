import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CreateEventDocument,
  CreateEventPageQuery,
  UpdateEventDocument,
  UpdateEventPageQuery,
} from "@app/graphql"
import { formItemLayout, lowercased } from "@app/lib"
import { Badge, Col, Form, Row, Skeleton, Tabs } from "antd"
import isEqual from "lodash/isEqual"
import uniq from "lodash/uniq"
import { useRouter } from "next/router"
import { CombinedError, useMutation } from "urql"

import {
  ButtonLink,
  useFeature,
  useFeatureFlagsLoaded,
  useTranslation,
} from "../."
import { useCelebrate } from "../celebrate"

import { EmailTab } from "./EmailTab"
import { EventFormFooter } from "./EventFormFooter"
import { MainTab } from "./MainTab"
import { PreviewTab } from "./PreviewTab"
import { QuestionsTab } from "./QuestionsTab"
import { QuotasTab } from "./QuotasTab"
import { RegistrationsTab } from "./RegistrationsTab"
import { RequiredMark } from "./RequiredMark"
import { FormValues, SubmittedFormValues, toEventInput } from "./values"

export * from "./values"

interface EventFormProps {
  type: "update" | "create"
  formRedirect: string
  data: CreateEventPageQuery | UpdateEventPageQuery
  // eventId and initialValues are only used when type is "update"
  // i.e. we are updating an existing event
  eventId?: string
  initialValues?: any
}

// Tab label with the same red asterisk antd shows next to required fields
const RequiredTabLabel: React.FC<{ label: string }> = ({ label }) => (
  <span>
    <RequiredMark />
    {label}
  </span>
)

enum TAB {
  General = "general",
  Quotas = "quotas",
  Questions = "questions",
  Preview = "preview",
  Registrations = "registrations",
  Email = "email",
}

// Tabs holding the event's form fields, which the footer moves between
const FORM_TABS = [TAB.General, TAB.Quotas, TAB.Questions]

const EventFormContent: React.FC<EventFormProps> = (props) => {
  const { formRedirect, data, initialValues, type, eventId } = props
  const { languages, slug, isDraft: initialIsDraft } = initialValues || {}
  const { supportedLanguages } = data || {}
  const paymentsEnabled = useFeature("payments")
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
  const celebrate = useCelebrate()

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

  // The initial values last put into the form. The page's query hands in a
  // new object whenever the cached event is written again (e.g. by another
  // query that loads the same event), which must not discard the user's edits.
  const appliedInitialValues = useRef<unknown>(null)
  useEffect(() => {
    const next = [initialValues, initialSelectedLanguages]
    if (isEqual(appliedInitialValues.current, next)) return
    appliedInitialValues.current = next

    // Set form initialValues if they have changed after the initial rendering
    setFieldsValue(initialValues)

    // setSelectedLanguages if languages from initialValues change
    if (initialSelectedLanguages) {
      setSelectedLanguages(initialSelectedLanguages)
      setFieldsValue({ languages: initialSelectedLanguages })
    }
  }, [setFieldsValue, initialValues, initialSelectedLanguages])

  const handleSubmit = useCallback(
    async (values: SubmittedFormValues) => {
      setFormSubmitting(true)
      setFormError(null)
      try {
        if (!values.quotas?.length) {
          throw new Error(t("errors.mustProvideEventQuota"))
        }

        const commonInput = toEventInput(values, {
          payments: paymentsEnabled,
        })
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

        if (type === "create") celebrate()

        setFormError(null)
        router.push(formRedirect, formRedirect)
      } catch (e) {
        setFormError(e)
      }
      setFormSubmitting(false)
    },
    [
      mutation,
      formRedirect,
      router,
      t,
      type,
      eventId,
      celebrate,
      paymentsEnabled,
    ]
  )

  const tabLabels: Record<string, string> = {
    [TAB.General]: t("admin:events.tabs.generalInfo"),
    [TAB.Quotas]: t("admin:events.tabs.quotas"),
    [TAB.Questions]: t("admin:events.tabs.questions"),
  }

  // Registration form preview tab
  const showPreviewTab = useFeature("form_preview")

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
            label: <RequiredTabLabel label={tabLabels[TAB.General]} />,
            forceRender: true,
            children: <MainTab {...mainTabProps} />,
          },
          {
            key: TAB.Quotas,
            label: <RequiredTabLabel label={tabLabels[TAB.Quotas]} />,
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
          ...(showPreviewTab
            ? [
                {
                  key: TAB.Preview,
                  label: t("admin:events.tabs.preview"),
                  // Only render when active so the preview uses the current
                  // questions
                  children:
                    activeTab === TAB.Preview ? (
                      <PreviewTab
                        form={form}
                        selectedLanguages={selectedLanguages}
                      />
                    ) : null,
                },
              ]
            : []),
          ...(type === "update"
            ? [
                {
                  key: TAB.Registrations,
                  label: t("common:registrations"),
                  forceRender: true,
                  children: (
                    <RegistrationsTab
                      eventId={eventId as string}
                      eventSlug={
                        (data as UpdateEventPageQuery)?.event?.slug as string
                      }
                      paymentsEnabled={paymentsEnabled}
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

/**
 * The event create and update form. Several of its fields and tabs depend on
 * feature flags, so it waits for them rather than rendering with every
 * feature off and then swapping controls in.
 */
export const EventForm: React.FC<EventFormProps> = (props) =>
  useFeatureFlagsLoaded() ? (
    <EventFormContent {...props} />
  ) : (
    <Skeleton active />
  )
