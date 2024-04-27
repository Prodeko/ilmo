import { useCallback, useEffect, useRef, useState } from "react"
import { LockOutlined, UserAddOutlined, UserOutlined } from "@ant-design/icons"
import {
  AuthRestrict,
  ButtonLink,
  ErrorAlert,
  Link,
  Redirect,
  SharedLayout,
  SharedLayoutChildProps,
  SocialLoginOptions,
  useTranslation,
} from "@app/components"
import { useLoginMutation, useSharedQuery } from "@app/graphql"
import { getCodeFromError, resetWebsocketConnection } from "@app/lib"
import { Button, Col, Form, Input, Row } from "antd"
import { useRouter } from "next/router"

import type { GetServerSideProps, NextPage } from "next"

function hasErrors(fieldsError: Object) {
  return Object.keys(fieldsError).some((field) => fieldsError[field])
}

interface LoginProps {
  next: string | null
  // Comes from _app.tsx withUrql HOC
  resetUrqlClient?: () => void
}

export function isSafe(nextUrl: string | null) {
  return (nextUrl && nextUrl[0] === "/") || false
}

/**
 * Login page just renders the standard layout and embeds the login form
 */
const Login: NextPage<LoginProps> = ({ next: rawNext, resetUrqlClient }) => {
  const { t } = useTranslation("login")
  const [showLogin, setShowLogin] = useState(false)
  const [query] = useSharedQuery()

  const next: string = isSafe(rawNext) ? rawNext! : "/"

  return (
    <SharedLayout
      forbidWhen={AuthRestrict.LOGGED_IN}
      noHandleErrors={!!query.data?.currentUser}
      query={query}
      title={t("common:signin")}
    >
      {({ currentUser }: SharedLayoutChildProps) =>
        currentUser ? (
          <Redirect href={next} />
        ) : (
          <Row justify="center" style={{ marginTop: 32 }}>
            {showLogin ? (
              <Col sm={12} xs={24}>
                <LoginForm
                  resetUrqlClient={resetUrqlClient}
                  onCancel={() => setShowLogin(false)}
                  onSuccessRedirectTo={next}
                />
              </Col>
            ) : (
              <Col sm={12} xs={24}>
                <Row style={{ marginBottom: 8 }}>
                  <Col span={24}>
                    <Button
                      data-cy="loginpage-button-withusername"
                      icon={<UserOutlined />}
                      size="large"
                      type="primary"
                      block
                      onClick={() => setShowLogin(true)}
                    >
                      {t("signinButton")}
                    </Button>
                  </Col>
                </Row>
                <Row style={{ marginBottom: 8 }}>
                  <Col span={24}>
                    <SocialLoginOptions next={next} />
                  </Col>
                </Row>
                <Row justify="center">
                  <Col flex={1}>
                    <ButtonLink
                      data-cy="loginpage-button-register"
                      href={`/register?next=${encodeURIComponent(next)}`}
                      icon={<UserAddOutlined />}
                      size="large"
                      type="default"
                      block
                    >
                      {t("registerButton")}
                    </ButtonLink>
                  </Col>
                </Row>
              </Col>
            )}
          </Row>
        )
      }
    </SharedLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const next = context?.query?.next
  return {
    props: {
      next: typeof next === "string" ? next : null,
    },
  }
}

export default Login

interface LoginFormProps {
  onSuccessRedirectTo: string
  onCancel: () => void
  resetUrqlClient: () => void
}

function LoginForm({
  onSuccessRedirectTo,
  onCancel,
  resetUrqlClient,
}: LoginFormProps) {
  const router = useRouter()
  const { t } = useTranslation("login")
  const [form] = Form.useForm()
  const [{ error }, login] = useLoginMutation()

  const [submitDisabled, setSubmitDisabled] = useState(false)
  const handleSubmit = useCallback(
    async (values) => {
      try {
        const { error } = await login({
          username: values.username,
          password: values.password,
        })
        if (error) throw error
        // Success: refetch
        resetWebsocketConnection()
        resetUrqlClient()
        router.push(onSuccessRedirectTo)
      } catch (e) {
        const code = getCodeFromError(e)
        if (code === "CREDS") {
          form.setFields([
            {
              name: "password",
              value: form.getFieldValue("password"),
              errors: [t("form.errors.incorrectCredentials")],
            },
          ])
          setSubmitDisabled(true)
        }
      }
    },
    [form, login, onSuccessRedirectTo, resetUrqlClient, router, t]
  )

  const focusElement = useRef<Input>(null)
  useEffect(() => void focusElement?.current!.focus(), [focusElement])

  const handleValuesChange = useCallback(() => {
    setSubmitDisabled(hasErrors(form.getFieldsError().length !== 0))
  }, [form])

  const code = getCodeFromError(error)

  return (
    <Form
      form={form}
      layout="vertical"
      style={{ width: "100%" }}
      onFinish={handleSubmit}
      onValuesChange={handleValuesChange}
    >
      <Form.Item
        name="username"
        rules={[{ required: true, message: t("form.messages.username") }]}
      >
        <Input
          ref={focusElement}
          autoComplete="email username"
          data-cy="loginpage-input-username"
          placeholder={t("form.placeholders.username")}
          prefix={<UserOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
          size="large"
        />
      </Form.Item>
      <Form.Item
        name="password"
        rules={[{ required: true, message: t("form.messages.password") }]}
      >
        <Input
          autoComplete="current-password"
          data-cy="loginpage-input-password"
          placeholder={t("form.placeholders.password")}
          prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
          size="large"
          type="password"
        />
      </Form.Item>
      <Form.Item>
        <Link href="/forgot">{t("forgotPassword")}</Link>
      </Form.Item>
      {error && code !== "CREDS" && (
        <Form.Item>
          <ErrorAlert error={error} />
        </Form.Item>
      )}
      <Form.Item>
        <Button
          data-cy="loginpage-button-submit"
          disabled={submitDisabled}
          htmlType="submit"
          type="primary"
        >
          {t("common:signin")}
        </Button>
        <a style={{ marginLeft: 16 }} onClick={onCancel}>
          {t("signinDifferent")}
        </a>
      </Form.Item>
    </Form>
  )
}
