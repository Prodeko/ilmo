import { useCallback, useEffect, useRef, useState } from "react"
import { LockOutlined, UserOutlined } from "@ant-design/icons"
import {
  AuthRestrict,
  ErrorAlert,
  Link,
  ProdekoIcon,
  Redirect,
  SharedLayout,
  SharedLayoutChildProps,
  useTranslation,
} from "@app/components"
import { useLoginMutation, useSharedQuery } from "@app/graphql"
import { getCodeFromError, resetWebsocketConnection } from "@app/lib"
import { Alert, Button, Col, Form, Input, Row } from "antd"
import { useRouter } from "next/router"

import type { GetServerSideProps, NextPage } from "next"

function hasErrors(fieldsError: Object) {
  return Object.keys(fieldsError).some((field) => fieldsError[field])
}

interface LoginProps {
  next: string | null
  errorCode: string | null
  local: boolean
  ssoAvailable: boolean
  // Comes from _app.tsx withUrql HOC
  resetUrqlClient?: () => void
}

/**
 * Mirrors `sanitizeNext` on the server: a destination is safe only when it is
 * a single-slash relative path. Browsers strip tab/CR/LF and treat "\" as "/"
 * when parsing a URL, so "/\evil.com" and "/<TAB>/evil.com" both resolve to
 * another origin.
 */
export function isSafe(nextUrl: string | null) {
  if (typeof nextUrl !== "string") return false
  const candidate = nextUrl.replace(/[\t\r\n]/g, "")
  if (!/^\/[^/\\]/.test(candidate)) return false
  // eslint-disable-next-line no-control-regex -- matching them is the point
  return !/[\u0000-\u001f\u007f]/.test(candidate)
}

/**
 * Error codes the `/auth/keycloak` callback may redirect back with. Anything
 * else falls back to the generic message.
 */
const KNOWN_SSO_ERRORS = [
  "sso_unavailable",
  "state_mismatch",
  "code_exchange_failed",
  "email_not_verified",
  "account_conflict",
  "login_failed",
]

/**
 * Login page just renders the standard layout and embeds the login form
 */
const Login: NextPage<LoginProps> = ({
  next: rawNext,
  errorCode,
  local,
  ssoAvailable,
  resetUrqlClient,
}) => {
  const { t } = useTranslation("login")
  const [showLogin, setShowLogin] = useState(local)
  const [query] = useSharedQuery()
  // Urql runs with `ssr: false`, so `ssoLoginEnabled` is only known once the
  // shared query resolves in the browser. `ssoAvailable` carries the same
  // answer through the server render, keeping the break-glass form hidden
  // until then.
  const ssoEnabled = query.data?.ssoLoginEnabled ?? ssoAvailable

  const next: string = isSafe(rawNext) ? rawNext! : "/"
  const ssoHref = `/auth/keycloak?next=${encodeURIComponent(next)}`
  const errorKey =
    errorCode && KNOWN_SSO_ERRORS.includes(errorCode)
      ? errorCode
      : "login_failed"

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
            <Col sm={12} xs={24}>
              {errorCode && (
                <Alert
                  data-cy="loginpage-error-alert"
                  message={t(`ssoError.${errorKey}`)}
                  style={{ marginBottom: 16 }}
                  type="error"
                />
              )}
              {showLogin || !ssoEnabled ? (
                <LoginForm
                  resetUrqlClient={resetUrqlClient}
                  onCancel={ssoEnabled ? () => setShowLogin(false) : undefined}
                  onSuccessRedirectTo={next}
                />
              ) : (
                <Button
                  data-cy="loginpage-button-sso"
                  href={ssoHref}
                  icon={
                    <ProdekoIcon
                      size="20px"
                      style={{ verticalAlign: "middle" }}
                    />
                  }
                  size="large"
                  type="primary"
                  block
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setShowLogin(true)
                  }}
                >
                  {errorCode ? t("tryAgain") : t("signinWithProdekoId")}
                </Button>
              )}
            </Col>
          </Row>
        )
      }
    </SharedLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { next: rawNext, error, local } = context.query
  const next = typeof rawNext === "string" ? rawNext : null
  const ssoEnabled = !!(
    process.env.KEYCLOAK_ISSUER &&
    process.env.KEYCLOAK_CLIENT_ID &&
    process.env.KEYCLOAK_CLIENT_SECRET
  )
  // SSO is the only visible login path: bounce straight to Keycloak unless
  // we need to show an error or the break-glass form.
  if (ssoEnabled && !error && !local) {
    const safeNext = isSafe(next) ? next! : "/"
    return {
      redirect: {
        destination: `/auth/keycloak?next=${encodeURIComponent(safeNext)}`,
        permanent: false,
      },
    }
  }
  return {
    props: {
      next,
      errorCode: typeof error === "string" ? error : null,
      local: local === "1",
      ssoAvailable: ssoEnabled,
    },
  }
}

export default Login

interface LoginFormProps {
  onSuccessRedirectTo: string
  onCancel?: () => void
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
        {onCancel && (
          <a style={{ marginLeft: 16 }} onClick={onCancel}>
            {t("signinDifferent")}
          </a>
        )}
      </Form.Item>
    </Form>
  )
}
