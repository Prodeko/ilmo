import {
  AdminLayout,
  AuthRestrict,
  FeatureFlagsAdmin,
  isDeveloperUser,
} from "@app/components"
import { useSharedQuery } from "@app/graphql"
import { Col, Row } from "antd"

import type { NextPage } from "next"

const Admin_Features: NextPage = () => {
  const [query] = useSharedQuery()
  const currentUser = query.data?.currentUser

  return (
    <AdminLayout
      forbidWhen={AuthRestrict.NOT_DEVELOPER}
      href="/admin/features"
      query={query}
    >
      {/* The flags are only queried once the viewer is known to be a
          developer; the layout redirects everyone else. */}
      {currentUser && isDeveloperUser(currentUser) ? (
        <Row>
          <Col flex={1}>
            <FeatureFlagsAdmin currentUserId={currentUser.id} />
          </Col>
        </Row>
      ) : null}
    </AdminLayout>
  )
}

export default Admin_Features
