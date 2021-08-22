import { AdminLayout, EventForm } from "@app/components"
import { useCreateEventPageQuery } from "@app/graphql"
import { Col, PageHeader, Row } from "antd"
import { NextPage } from "next"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"

const Admin_CreateEvent: NextPage = () => {
  const { t } = useTranslation("admin")
  const router = useRouter()
  const [query] = useCreateEventPageQuery()

  return (
    <AdminLayout href="/admin/event/create" query={query}>
      <Row>
        <Col flex={1}>
          <PageHeader
            title={t("pageTitle.createEvent")}
            onBack={() => router.push("/admin/event/list")}
          />
          <EventForm
            data={query.data}
            formRedirect="/admin/event/list"
            type="create"
          />
        </Col>
      </Row>
    </AdminLayout>
  )
}

export default Admin_CreateEvent
