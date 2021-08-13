import { EventRegistrationForm, Redirect, SharedLayout } from "@app/components"
import { useUpdateEventRegistrationPageQuery } from "@app/graphql"
import { filterObjectByKeys } from "@app/lib"
import { Col, PageHeader, Row } from "antd"
import { NextPage } from "next"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"

type UpdateFormInitialValues = {
  firstName: string
  lastName: string
}

function constructInitialValues(values: any) {
  const filteredValues = filterObjectByKeys(values, [
    "firstName",
    "lastName",
  ]) as UpdateFormInitialValues

  return filteredValues
}

const UpdateEventRegistrationPage: NextPage = () => {
  const { t, lang } = useTranslation("register")
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
        questions={event.eventQuestions.nodes}
        type="update"
        updateToken={updateToken as string}
      />
    </SharedLayout>
  )
}

export default UpdateEventRegistrationPage
