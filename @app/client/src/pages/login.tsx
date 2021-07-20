import { useCallback, useEffect, useRef, useState } from "react"
import LockOutlined from "@ant-design/icons/LockOutlined"
import UserAddOutlined from "@ant-design/icons/UserAddOutlined"
import UserOutlined from "@ant-design/icons/UserOutlined"
import {
  AuthRestrict,
  ButtonLink,
  Col,
  ErrorAlert,
  Redirect,
  Row,
  SharedLayout,
  SharedLayoutChildProps,
  SocialLoginOptions,
} from "@app/components"
import { useLoginMutation, useSharedQuery } from "@app/graphql"
import { getCodeFromError, resetWebsocketConnection } from "@app/lib"
import * as Sentry from "@sentry/react"
import { Button, Form, Input } from "antd"
import { useForm } from "antd/lib/form/Form"
import { NextPage } from "next"
import Link from "next/link"
import Router from "next/router"
import { Store } from "rc-field-form/lib/interface"

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
  const [showLogin, setShowLogin] = useState(false)
  const [query] = useSharedQuery()

  const next: string = isSafe(rawNext) ? rawNext! : "/"

  return (
    <SharedLayout
      forbidWhen={AuthRestrict.LOGGED_IN}
      query={query}
      title="Sign in"
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
                      Sign in with E-mail or Username
                    </Button>
                  </Col>
                </Row>
                <Row style={{ marginBottom: 8 }}>
                  <Col span={24}>
                    <SocialLoginOptions next={next} />
                  </Col>
                </Row>
                {process.env.ENABLE_ACCOUNT_REGISTER && (
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
                        Create an account
                      </ButtonLink>
                    </Col>
                  </Row>
                )}
              </Col>
            )}
          </Row>
        )
      }
    </SharedLayout>
  )
}

Login.getInitialProps = async ({ query }) => ({
  next: typeof query.next === "string" ? query.next : null,
})

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
  const [form] = useForm()
  const [{ error }, login] = useLoginMutation()

  const [submitDisabled, setSubmitDisabled] = useState(false)
  const handleSubmit = useCallback(
    async (values: Store) => {
      try {
        const { error } = await login({
          username: values.username,
          password: values.password,
        })
        if (error) throw error
        // Success: refetch
        resetWebsocketConnection()
        resetUrqlClient()
        Router.push(onSuccessRedirectTo)
      } catch (e) {
        const code = getCodeFromError(e)
        if (code === "CREDS") {
          form.setFields([
            {
              name: "password",
              value: form.getFieldValue("password"),
              errors: ["Incorrect username or passphrase"],
            },
          ])
          setSubmitDisabled(true)
        } else {
          Sentry.captureException(e)
        }
      }
    },
    [form, login, onSuccessRedirectTo, resetUrqlClient]
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
        rules={[{ required: true, message: "Please input your username" }]}
      >
        <Input
          ref={focusElement}
          autoComplete="email username"
          data-cy="loginpage-input-username"
          placeholder="E-mail or Username"
          prefix={<UserOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
          size="large"
        />
      </Form.Item>
      <Form.Item
        name="password"
        rules={[{ required: true, message: "Please input your passphrase" }]}
      >
        <Input
          autoComplete="current-password"
          data-cy="loginpage-input-password"
          placeholder="Passphrase"
          prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
          size="large"
          type="password"
        />
      </Form.Item>
      {process.env.ENABLE_ACCOUNT_REGISTER && (
        <Form.Item>
          <Link href="/forgot">
            <a>Forgotten passphrase?</a>
          </Link>
        </Form.Item>
      )}
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
          Sign in
        </Button>
        <a style={{ marginLeft: 16 }} onClick={onCancel}>
          Use a different sign in method
        </a>
      </Form.Item>
    </Form>
  )
}
