import { useMemo } from "react"
import {
  AdminLayout,
  EventForm,
  PageHeader,
  Redirect,
  toFormValues,
  useQueryId,
  useTranslation,
} from "@app/components"
import { useUpdateEventPageQuery } from "@app/graphql"
import { Col, Row } from "antd"
import { useRouter } from "next/router"

import type { NextPage } from "next"

const Admin_UpdateEvent: NextPage = () => {
  const { t } = useTranslation("admin")
  const router = useRouter()
  const eventId = useQueryId()
  const [query] = useUpdateEventPageQuery({
    variables: { id: eventId },
  })
  const { data, fetching, error, stale } = query
  const event = data?.event
  // EventForm resets its fields whenever initialValues changes, so a new
  // object on every render (e.g. on a locale switch) would discard edits
  const initialValues = useMemo(() => toFormValues(event), [event])

  // If event is not found redirect to index
  if (!fetching && !error && !stale && !event) {
    return <Redirect href="/" layout />
  }

  return (
    <AdminLayout href="/admin/event/update" query={query}>
      <Row>
        <Col flex={1}>
          <PageHeader
            title={t("pageTitle.updateEvent")}
            onBack={() => router.push("/admin/event/list")}
          />
          <EventForm
            data={data}
            eventId={eventId}
            formRedirect="/admin/event/list"
            initialValues={initialValues}
            type="update"
          />
        </Col>
      </Row>
    </AdminLayout>
  )
}

export default Admin_UpdateEvent
