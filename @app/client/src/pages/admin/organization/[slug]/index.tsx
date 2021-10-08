import { useState } from "react"
import {
  AdminLayout,
  ORGANIZATION_RESULTS_PER_PAGE,
  OrganizationMembers,
  Redirect,
  UpdateOrganizationForm,
  useOrganizationLoading,
  useQuerySlug,
} from "@app/components"
import {
  OrganizationPage_OrganizationFragment,
  useOrganizationPageQuery,
} from "@app/graphql"
import { Col, message, PageHeader, Row } from "antd"
import { NextPage } from "next"
import useTranslation from "next-translate/useTranslation"

const Admin_Organizations: NextPage = () => {
  const slug = useQuerySlug()
  const [page, setPage] = useState(1)
  const [query] = useOrganizationPageQuery({
    variables: { slug, offset: (page - 1) * ORGANIZATION_RESULTS_PER_PAGE },
  })
  const organizationLoadingElement = useOrganizationLoading(query)
  const organization = query.data?.organizationBySlug

  const props = { page, setPage }

  return (
    <AdminLayout href="/admin/organization/[slug]" query={query}>
      {organizationLoadingElement || (
        <OrganizationPageInner organization={organization!} {...props} />
      )}
    </AdminLayout>
  )
}

interface OrganizationPageInnerProps {
  organization: OrganizationPage_OrganizationFragment
  page: number
  setPage: React.Dispatch<React.SetStateAction<number>>
}

const OrganizationPageInner: React.FC<OrganizationPageInnerProps> = (props) => {
  const { t } = useTranslation("admin")
  const { organization, ...rest } = props

  if (!organization.currentUserIsOwner) {
    message.warning({
      key: "organizations-access-denied",
      content: t("organizations.accessDenied"),
    })
    return <Redirect as="/admin/event/list" href="/admin/event/list" />
  }

  return (
    <Row>
      <Col flex={1}>
        <PageHeader title={organization.name} />
        <UpdateOrganizationForm organization={organization} />
        <OrganizationMembers organization={organization} {...rest} />
      </Col>
    </Row>
  )
}

export default Admin_Organizations
