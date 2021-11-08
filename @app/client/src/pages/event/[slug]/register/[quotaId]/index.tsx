import { useCallback, useState } from "react"
import {
  EventRegistrationForm,
  RecentRegistrationsList,
  Redirect,
  SharedLayout,
  useLoading,
  useTranslation,
} from "@app/components"
import {
  useCreateEventRegistrationPageQuery,
  useDeleteEventRegistrationMutation,
} from "@app/graphql"
import { Col, PageHeader, Popconfirm, Row } from "antd"
import { useRouter } from "next/router"

import type { NextPage } from "next"

const EventRegistrationPage: NextPage = () => {
  const { t, lang } = useTranslation("register_event")
  const [visible, setVisible] = useState(false)

  const router = useRouter()
  const slug = router.query.slug as string
  const quotaId = router.query.quotaId as string

  const [query] = useCreateEventRegistrationPageQuery({
    variables: { slug, quotaId },
  })
  const { data, fetching, error, stale } = query

  const currentUser = data?.currentUser
  const event = data?.eventBySlug
  const quota = data?.quota
  const { signupClosed, signupUpcoming } = event || {}

  const { name, primaryEmail } = currentUser || {}
  // TODO: The users table schema could be changed to include first
  // and last names. For now infer first and last name like this...
  const [firstName, lastName] = name ? name?.split(" ") : []

  const formInitialValues = {
    firstName,
    lastName,
    email: primaryEmail,
  }

  const [, deleteRegistration] = useDeleteEventRegistrationMutation()
  const [updateToken, setUpdateToken] = useState<string | undefined>(undefined)
  const loadingElement = useLoading(query)

  const handleGoBack = useCallback(async () => {
    // Delete the pending registration if the user goes back to event page
    if (updateToken) {
      await deleteRegistration({
        updateToken,
      })
    }
    router.push(`/event/${event.slug}`)
  }, [deleteRegistration, router, event, updateToken])

  // If event or quota is not found, or if event
  // registration is not open redirect to index
  if (
    !fetching &&
    !error &&
    !stale &&
    (!event || !quota || signupClosed || signupUpcoming)
  ) {
    return <Redirect href="/" layout />
  }

  const showPopconfirm = (e?: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    setVisible(true)
  }

  const hidePopconfirm = () => {
    setVisible(false)
  }

  const eventName = event?.name[lang] || t("common:loading")
  const quotaName = quota?.title[lang] || t("common:loading")
  const title = `${t("title")} ${eventName} - ${quotaName}`

  return (
    <SharedLayout query={query} title="">
      {loadingElement || (
        <>
          <Row align="top" justify="center">
            <Col sm={12} xs={24}>
              <PageHeader title={title} onBack={showPopconfirm} />
              <Popconfirm
                cancelText={t("common:no")}
                okText={t("common:yes")}
                title={t("confirmGoBack")}
                visible={visible}
                onCancel={hidePopconfirm}
                onConfirm={handleGoBack}
              />
            </Col>
          </Row>
          <EventRegistrationForm
            eventId={event?.id}
            formRedirect={{
              pathname: "/event/[slug]",
              query: { slug: event?.slug },
            }}
            initialValues={formInitialValues}
            questions={event?.eventQuestions?.nodes}
            quotaId={quota?.id}
            // Used to delete an unfinished registration
            setUpdateToken={setUpdateToken}
            type="create"
          />
          <RecentRegistrationsList eventId={event.id} />
        </>
      )}
    </SharedLayout>
  )
}

export default EventRegistrationPage
