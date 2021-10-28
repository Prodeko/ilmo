import { useEffect, useState } from "react"
import { SharedLayout, useTranslation } from "@app/components"
import { useSharedQuery, useVerifyEmailMutation } from "@app/graphql"
import { Alert, Col, Row } from "antd"

import type { GetServerSideProps, NextPage } from "next"

interface Props {
  id: string | null
  token: string | null
}

const VerifyPage: NextPage<Props> = (props) => {
  const { t } = useTranslation("verify")
  const [[id, token], setIdAndToken] = useState<[string, string]>([
    props.id || "",
    props.token || "",
  ])
  const [state, setState] = useState<"PENDING" | "SUBMITTING" | "SUCCESS">(
    props.id && props.token ? "SUBMITTING" : "PENDING"
  )
  const [error, setError] = useState<Error | null>(null)
  const [, verifyEmail] = useVerifyEmailMutation()

  useEffect(() => {
    if (state === "SUBMITTING") {
      setError(null)
      verifyEmail({
        id,
        token,
      })
        .then((result) => {
          if (result?.data?.verifyEmail?.success) {
            setState("SUCCESS")
          } else {
            setState("PENDING")
            setError(new Error(t("error:incorrectToken")))
          }
        })
        .catch((e: Error) => {
          setError(e)
          setState("PENDING")
        })
    }
  }, [id, token, state, props, verifyEmail, t])

  function form() {
    return (
      <form onSubmit={() => setState("SUBMITTING")}>
        <p>{t("enterCode")}</p>
        <input
          type="text"
          value={token}
          onChange={(e) => setIdAndToken([id, e.target.value])}
        />
        {error && <p>{error.message || error}</p>}
        <button>{t("common:submit")}</button>
      </form>
    )
  }

  const [query] = useSharedQuery()

  return (
    <SharedLayout query={query} title="Verify Email Address">
      <Row>
        <Col flex={1}>
          {state === "PENDING" ? (
            form()
          ) : state === "SUBMITTING" ? (
            <Alert
              description={t("alerts.submitting.description")}
              message={t("alerts.submitting.message")}
              type="info"
            />
          ) : state === "SUCCESS" ? (
            <Alert
              description={t("alerts.success.description")}
              message={t("alerts.success.message")}
              type="success"
              showIcon
            />
          ) : null}
        </Col>
      </Row>
    </SharedLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { query } = context
  const { id, token } = query
  return {
    props: {
      id: typeof id === "string" ? id : null,
      token: typeof token === "string" ? token : null,
    },
  }
}

export default VerifyPage
