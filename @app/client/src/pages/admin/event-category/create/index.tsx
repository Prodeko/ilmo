import { PageHeader } from "@ant-design/pro-layout"
import { AdminLayout, EventCategoryForm, useTranslation } from "@app/components"
import { useSharedQuery } from "@app/graphql"
import { Col, Row } from "antd"
import { useRouter } from "next/dist/client/router"

import type { NextPage } from "next"

const Admin_CreateEventCategory: NextPage = () => {
  const [query] = useSharedQuery()
  const { t } = useTranslation("admin")
  const router = useRouter()

  return (
    <AdminLayout href={"/admin/event-category/create"} query={query}>
      <Row>
        <Col flex={1}>
          <PageHeader
            title={t("pageTitle.createEventCategory")}
            onBack={() => router.push("/admin/event-category/list")}
          />
          <EventCategoryForm
            data={query.data}
            formRedirect="/admin/event-category/list"
            type="create"
          />
        </Col>
      </Row>
    </AdminLayout>
  )
}

export default Admin_CreateEventCategory
