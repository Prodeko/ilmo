import React, { useCallback, useEffect, useRef, useState } from "react"
import LockOutlined from "@ant-design/icons/LockOutlined"
import UserAddOutlined from "@ant-design/icons/UserAddOutlined"
import UserOutlined from "@ant-design/icons/UserOutlined"
import { ApolloError, useApolloClient } from "@apollo/client"
import {
  AuthRestrict,
  ButtonLink,
  Col,
  Redirect,
  Row,
  SharedLayout,
  SharedLayoutChildProps,
  SocialLoginOptions,
} from "@app/components"
import { useLoginMutation, useSharedQuery } from "@app/graphql"
import {
  extractError,
  getCodeFromError,
  resetWebsocketConnection,
} from "@app/lib"
import * as Sentry from "@sentry/react"
import { Alert, Button, Form, Input } from "antd"
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
}

export function isSafe(nextUrl: string | null) {
  return (nextUrl && nextUrl[0] === "/") || false
}

/**
 * Login page just renders the standard layout and embeds the login form
 */
const Login: NextPage<LoginProps> = ({ next: rawNext }) => {
  const [error, setError] = useState<Error | ApolloError | null>(null)
  const [showLogin, setShowLogin] = useState<boolean>(false)
  const next: string = isSafe(rawNext) ? rawNext! : "/"
  const query = useSharedQuery()

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
                <Row>
                  <LoginForm
                    error={error}
                    setError={setError}
                    onCancel={() => setShowLogin(false)}
                    onSuccessRedirectTo={next}
                  />
                </Row>
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
  error: Error | ApolloError | null
  setError: (error: Error | ApolloError | null) => void
  onCancel: () => void
}

function LoginForm({
  onSuccessRedirectTo,
  onCancel,
  error,
  setError,
}: LoginFormProps) {
  const [form] = useForm()
  const [login] = useLoginMutation({})
  const client = useApolloClient()

  const [submitDisabled, setSubmitDisabled] = useState(false)
  const handleSubmit = useCallback(
    async (values: Store) => {
      setError(null)
      try {
        await login({
          variables: {
            username: values.username,
            password: values.password,
          },
        })
        // Success: refetch
        resetWebsocketConnection()
        client.resetStore()
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
          setError(e)
          Sentry.captureException(e)
        }
      }
    },
    [client, form, login, onSuccessRedirectTo, setError]
  )

  const focusElement = useRef<Input>(null)
  useEffect(
    () => void (focusElement.current && focusElement.current!.focus()),
    [focusElement]
  )

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
      <Form.Item>
        <Link href="/forgot">
          <a>Forgotten passphrase?</a>
        </Link>
      </Form.Item>
      {error && (
        <Form.Item>
          <Alert
            description={
              <span>
                {extractError(error).message}
                {code && (
                  <span>
                    (Error code: <code>ERR_{code}</code>)
                  </span>
                )}
              </span>
            }
            message={`Sign in failed`}
            type="error"
          />
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
