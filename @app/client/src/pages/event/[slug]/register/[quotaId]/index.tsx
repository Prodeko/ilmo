import { useCallback, useMemo, useState } from "react"
import {
  EventRegistrationForm,
  Redirect,
  SharedLayout,
  useEventRegistrations,
} from "@app/components"
import {
  useCreateEventRegistrationPageQuery,
  useDeleteEventRegistrationMutation,
} from "@app/graphql"
import { Col, List, PageHeader, Popconfirm, Row, Typography } from "antd"
import { NextPage } from "next"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"

const EventRegistrationPage: NextPage = () => {
  const { t, lang } = useTranslation("register")
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

  // Subscribe to registrations created after this timestamp
  const after = useMemo(() => new Date().toISOString(), [])
  const recentRegistrations = useEventRegistrations(event?.id as string, after)
  const [, deleteRegistration] = useDeleteEventRegistrationMutation()
  const [updateToken, setUpdateToken] = useState<string | undefined>(undefined)

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
      {recentRegistrations.length > 0 && (
        <Row align="top" justify="center">
          <Col sm={12} xs={24}>
            <List
              data-cy="eventregistrationpage-recent-registrations-list"
              dataSource={recentRegistrations}
              header={<div>{t("recentlyRegisteredHeader")}</div>}
              renderItem={(item, i) => {
                const name = item?.fullName
                const quota = item?.quota?.title[lang]
                return i === 0 || name ? (
                  <List.Item>
                    <Typography.Text>
                      {i === 0
                        ? t("you")
                        : `${name} ${t("recentlyRegisteredListItem")} ${quota}`}
                    </Typography.Text>
                  </List.Item>
                ) : null
              }}
              bordered
            />
          </Col>
        </Row>
      )}
    </SharedLayout>
  )
}

export default EventRegistrationPage
