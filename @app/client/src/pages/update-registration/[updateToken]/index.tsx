import { PageHeader } from "@ant-design/pro-layout"
import {
  EventRegistrationForm,
  Redirect,
  SharedLayout,
  useTranslation,
} from "@app/components"
import { useUpdateEventRegistrationPageQuery } from "@app/graphql"
import { filterObjectByKeys } from "@app/lib"
import { Col, Row } from "antd"
import { useRouter } from "next/router"

import type { NextPage } from "next"

type UpdateFormInitialValues = {
  firstName: string
  lastName: string
  answers: any
}

function constructInitialValues(values: any) {
  const filteredValues = filterObjectByKeys(values, [
    "firstName",
    "lastName",
    "answers",
  ]) as UpdateFormInitialValues

  return filteredValues
}

const UpdateEventRegistrationPage: NextPage = () => {
  const { t, lang } = useTranslation("register_event")
  const router = useRouter()
  const { updateToken } = router.query

  const [query] = useUpdateEventRegistrationPageQuery({
    variables: { updateToken: updateToken as string },
  })
  const { data, fetching, error, stale } = query

  const registration = data?.registrationByUpdateToken
  const event = registration?.event
  const quota = registration?.quota

  // If registration is not found redirect to index
  if (!fetching && !error && !registration && !stale) {
    return <Redirect href="/" layout />
  }

  return (
    <SharedLayout query={query} title="">
      <PageHeader title={t("updateRegistration.title")} />
      <Row>
        <Col sm={{ offset: 6 }} style={{ marginBottom: 12 }}>
          {event?.name[lang]} - {quota?.title[lang]}
        </Col>
      </Row>
      <EventRegistrationForm
        formRedirect={{
          pathname: "/event/[slug]",
          query: { slug: event?.slug },
        }}
        initialValues={constructInitialValues(registration)}
        questions={event?.eventQuestions?.nodes}
        type="update"
        updateToken={updateToken as string}
      />
    </SharedLayout>
  )
}

export default UpdateEventRegistrationPage
