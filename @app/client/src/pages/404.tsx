import { FourOhFour, SharedLayout, useTranslation } from "@app/components"
import { useSharedQuery } from "@app/graphql"
import { Col, Row } from "antd"

const Page404 = () => {
  const { t } = useTranslation("error")
  const [query] = useSharedQuery()

  return (
    <SharedLayout query={query} title={t("pageNotFound")}>
      <Row>
        <Col flex={1}>
          <FourOhFour />
        </Col>
      </Row>
    </SharedLayout>
  )
}

export default Page404
