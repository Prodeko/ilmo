import {
  AdminLayout,
  EventCategoryForm,
  Redirect,
  useQueryId,
} from "@app/components"
import { useUpdateEventCategoryPageQuery } from "@app/graphql"
import { filterObjectByKeys } from "@app/lib"
import { Col, PageHeader, Row } from "antd"
import { NextPage } from "next"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"

type UpdateFormInitialValues = {
  name: string
  description: string
}

function constructInitialValues(values: any) {
  const filteredValues = filterObjectByKeys(values, [
    "name",
    "description",
    "color",
  ]) as UpdateFormInitialValues
  const languages = Object.keys(filteredValues?.name || {})

  return {
    ...filteredValues,
    languages,
    ownerOrganizationId: values?.ownerOrganization?.id,
  }
}

const Admin_UpdateEventCategory: NextPage = () => {
  const { t } = useTranslation("admin")
  const router = useRouter()
  const categoryId = useQueryId()
  const [query] = useUpdateEventCategoryPageQuery({
    variables: { id: categoryId },
  })
  const { data, fetching, error, stale } = query
  const eventCategory = data?.eventCategory

  // If event category is not found redirect to index
  if (!fetching && !error && !stale && !eventCategory) {
    return <Redirect href="/" layout />
  }

  return (
    <AdminLayout href={`/admin/event-category/${categoryId}`} query={query}>
      <Row>
        <Col flex={1}>
          <PageHeader
            title={t("pageTitle.updateEventCategory")}
            onBack={() => router.push("/admin/event-category/list")}
          />
          <EventCategoryForm
            categoryId={categoryId}
            data={data}
            formRedirect="/admin/event-category/list"
            initialValues={constructInitialValues(eventCategory)}
            type="update"
          />
        </Col>
      </Row>
    </AdminLayout>
  )
}

export default Admin_UpdateEventCategory
