import React from "react"
import { AdminLayout, EventCategoryForm } from "@app/components"
import { useCreateEventCategoryPageQuery } from "@app/graphql"
import { Col, PageHeader, Row } from "antd"
import { NextPage } from "next"
import { useRouter } from "next/dist/client/router"
import useTranslation from "next-translate/useTranslation"

const Admin_CreateEventCategory: NextPage = () => {
  const query = useCreateEventCategoryPageQuery()
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
