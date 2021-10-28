import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CreateEventDocument,
  CreateEventPageQuery,
  EventQuestion,
  Quota,
  UpdateEventDocument,
  UpdateEventPageQuery,
} from "@app/graphql"
import { filterObjectByKeys, formItemLayout } from "@app/lib"
import { Badge, Form, Tabs } from "antd"
import dayjs from "dayjs"
import debounce from "lodash/debounce"
import uniq from "lodash/uniq"
import { useRouter } from "next/router"
import slugify from "slugify"
import { CombinedError, useMutation } from "urql"

import { useTranslation } from "../."

import { EmailTab } from "./EmailTab"
import { MainTab } from "./MainTab"
import { QuestionsTab } from "./QuestionsTab"
import { QuotasTab } from "./QuotasTab"
import { RegistrationsTab } from "./RegistrationsTab"

const { TabPane } = Tabs

type TranslatedFormValue = {
  fi: string
  en: string
}

export type FormValues = {
  languages?: string[]
  ownerOrganizationId?: string
  categoryId?: string
  name?: TranslatedFormValue
  description?: TranslatedFormValue
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
  name?: TranslatedFormValue,
  dates?: dayjs.Dayjs[]
) {
  const eventStartTime = dates?.[0].toISOString()

  const daySlug = dayjs(eventStartTime).format("YYYY-M-D")
  const slug = slugify(`${daySlug}-${name?.["fi"]}`, {
    lower: true,
  })

  return name?.fi ? slug : ""
}

enum TAB {
  General = "general",
  Quotas = "quotas",
  Questions = "questions",
  Registrations = "registrations",
  Email = "email",
}

export const EventForm: React.FC<EventFormProps> = (props) => {
  const { formRedirect, data, initialValues, type, eventId } = props
  const { languages } = initialValues || {}
  const { supportedLanguages } = data!.languages! || {}
  const initialSelectedLanguages = useMemo(
    () => (type === "update" ? languages || {} : supportedLanguages),
    [type, languages, supportedLanguages]
  )

  // Translations, router, urql
  const { t } = useTranslation("events")
  const router = useRouter()

  // Handling form values, errors and submission
  const [form] = Form.useForm()
  const { setFieldsValue } = form
  const [formValues, setFormValues] = useState<FormValues>(initialValues || {})
  const [activeTab, setActiveTab] = useState<TAB>(TAB.General)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<Error | CombinedError | null>(null)
  const [tabErrors, setTabErrors] = useState<any[] | null>(null)
  const [isDraft, setIsDraft] = useState(
    type === "create" || initialValues.isDraft
  )
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    initialSelectedLanguages || []
  )

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
      setTabErrors(null)
      try {
        const {
          name,
          eventTime,
          registrationTime,
          openQuotaSize,
          headerImageFile: headerFile,
          quotas: formQuotas,
          questions: formQuestions,
        } = values

        if (!formQuotas && openQuotaSize < 1) {
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

  const debounceTabErrors = useMemo(
    () =>
      debounce(() => {
        let tabErrors = form
          .getFieldsError()
          .filter(
            ({ name, errors }) =>
              ["quotas", "questions"].includes(name[0] as string) &&
              errors.length > 0
          )
          .map(({ errors }) => errors[0])
          .filter((e) => !!e)

        if (tabErrors.length > 0) {
          setTabErrors(uniq(tabErrors))
        }
      }, 500),
    [form]
  )

  const handleFieldsChange = useCallback(async () => {
    // Filters form errors that relate to quotas or questions
    // in order to display them on the general tab
    debounceTabErrors()
  }, [debounceTabErrors])

  const mainTabProps = {
    type,
    data,
    isDraft,
    formValues,
    setIsDraft,
    formError,
    tabErrors,
    formSubmitting,
    selectedLanguages,
    setSelectedLanguages,
    supportedLanguages,
  }

  return (
    <Form
      {...formItemLayout}
      form={form}
      initialValues={{
        languages: selectedLanguages,
        isDraft,
        isHighlighted: false,
        ...initialValues,
      }}
      onFieldsChange={handleFieldsChange}
      onFinish={handleSubmit}
      onValuesChange={(_, values) => setFormValues(values)}
    >
      <Tabs
        defaultActiveKey="general"
        tabBarExtraContent={{
          right: (
            <Badge
              color={isDraft ? "yellow" : "green"}
              style={{ marginLeft: 8 }}
              text={isDraft ? t("forms.isDraft") : t("forms.isNotDraft")}
            />
          ),
        }}
        onChange={(tab) => setActiveTab(tab as TAB)}
      >
        <TabPane
          key={TAB.General}
          tab={t("admin:events.tabs.generalInfo")}
          forceRender
        >
          <MainTab {...mainTabProps} />
        </TabPane>
        <TabPane
          key={TAB.Quotas}
          tab={t("admin:events.tabs.quotas")}
          forceRender
        >
          <QuotasTab
            initialValues={initialValues}
            selectedLanguages={selectedLanguages}
          />
        </TabPane>
        <TabPane
          key={TAB.Questions}
          tab={t("admin:events.tabs.questions")}
          forceRender
        >
          <QuestionsTab form={form} selectedLanguages={selectedLanguages} />
        </TabPane>
        {type === "update" && (
          <TabPane
            key={TAB.Registrations}
            tab={t("common:registrations")}
            forceRender
          >
            <RegistrationsTab
              eventSlug={(data as UpdateEventPageQuery)?.event?.slug as string}
              questions={
                (data as UpdateEventPageQuery)?.event?.eventQuestions?.nodes
              }
            />
          </TabPane>
        )}
        <TabPane key={TAB.Email} tab={t("admin:events.tabs.email")}>
          {/*
            Only display email tab when activeTab is 'email' to reduce
            the number of api requests. EmailTab calls the renderEmailTemplate
            query to show what the email looks like that gets sent to event
            attendees.
          */}
          {activeTab === TAB.Email && <EmailTab formValues={formValues} />}
        </TabPane>
      </Tabs>
    </Form>
  )
}
