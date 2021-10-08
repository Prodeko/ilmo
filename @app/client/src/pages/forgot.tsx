import { useCallback, useEffect, useRef, useState } from "react"
import { UserOutlined } from "@ant-design/icons"
import { AuthRestrict, ErrorAlert, SharedLayout } from "@app/components"
import { useForgotPasswordMutation, useSharedQuery } from "@app/graphql"
import { Alert, Button, Col, Form, Input, Row } from "antd"
import { NextPage } from "next"
import Link from "next/link"
import useTranslation from "next-translate/useTranslation"

const ForgotPassword: NextPage = () => {
  const [query] = useSharedQuery()

  const { t } = useTranslation("forgot")
  const [form] = Form.useForm()
  const [{ error }, forgotPassword] = useForgotPasswordMutation()
  const [successfulEmail, setSuccessfulEmail] = useState<string | null>(null)

  const handleSubmit = useCallback(
    (values): void => {
      ;(async () => {
        try {
          const email = values.email
          const { error } = await forgotPassword({
            email,
          })
          if (error) throw error
          setSuccessfulEmail(email)
        } catch (e) {
          console.error(e)
        }
      })()
    },
    [forgotPassword]
  )

  const focusElement = useRef<Input>(null)
  useEffect(
    () => void (focusElement.current && focusElement.current!.focus()),
    [focusElement]
  )

  if (successfulEmail != null) {
    return (
      <SharedLayout query={query} title="Forgot Password">
        <Row justify="center">
          <Col sm={14} xs={24}>
            <Alert
              description={t("alerts.successEmail.description", {
                email: successfulEmail,
              })}
              message={t("alerts.successEmail.message")}
              type="success"
            />
          </Col>
        </Row>
      </SharedLayout>
    )
  }

  return (
    <SharedLayout
      forbidWhen={AuthRestrict.LOGGED_IN}
      query={query}
      title={t("title")}
    >
      <Row justify="center" style={{ marginTop: 32 }}>
        <Col sm={12} xs={24}>
          <Form
            form={form}
            layout="vertical"
            style={{ width: "100%" }}
            onFinish={handleSubmit}
          >
            <Form.Item
              name="email"
              rules={[
                {
                  type: "email",
                  message: t("form.messages.emailInvalid"),
                },
                { required: true, message: t("form.messages.emailRequired") },
              ]}
            >
              <Input
                ref={focusElement}
                placeholder={t("common:email")}
                prefix={<UserOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
              />
            </Form.Item>

            {error && (
              <Form.Item>
                <ErrorAlert error={error} message={t("common:unknownError")} />
              </Form.Item>
            )}
            <Form.Item>
              <Button htmlType="submit" type="primary">
                {t("resetButton")}
              </Button>
            </Form.Item>
            <Form.Item>
              <p>
                <Link href="/login">
                  <a> {t("rememberedButton")}</a>
                </Link>
              </p>
            </Form.Item>
          </Form>
        </Col>
      </Row>
    </SharedLayout>
  )
}

export default ForgotPassword
