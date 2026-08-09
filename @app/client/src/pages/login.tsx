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
import {
  getCodeFromError,
  keycloakEnabled,
  KNOWN_SSO_ERRORS,
  resetWebsocketConnection,
  sanitizeNext,
  SsoLoginError,
} from "@app/lib"
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
 * Narrows an `?error=` value from the `/auth/keycloak` callback to a code we
 * hold a translation for; anything else falls back to the generic message.
 */
function toSsoError(code: string | null): SsoLoginError | undefined {
  return KNOWN_SSO_ERRORS.find((known) => known === code)
}

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
  // answer through the server render, keeping the local sign-in form hidden
  // until then.
  const ssoEnabled = query.data?.ssoLoginEnabled ?? ssoAvailable

  const next = sanitizeNext(rawNext)
  const ssoHref = `/auth/keycloak?next=${encodeURIComponent(next)}`
  const localHref = `/login?local=1&next=${encodeURIComponent(next)}`
  const ssoError = toSsoError(errorCode)
  const errorKey: SsoLoginError = ssoError ?? "login_failed"
  const showLocalForm = showLogin || !ssoEnabled

  useEffect(() => {
    if (errorCode && !ssoError && process.env.NODE_ENV !== "production") {
      console.warn(
        `Unrecognised SSO error code "${errorCode}"; showing the generic sign-in failure. Add it to KNOWN_SSO_ERRORS and the login translations.`
      )
    }
  }, [errorCode, ssoError])

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
                  description={
                    errorKey === "sso_unavailable" && !showLocalForm ? (
                      <Link
                        data-cy="loginpage-link-local"
                        href={localHref}
                        onClick={() => setShowLogin(true)}
                      >
                        {t("useLocalSignin")}
                      </Link>
                    ) : undefined
                  }
                  message={t(`ssoError.${errorKey}`)}
                  style={{ marginBottom: 16 }}
                  type="error"
                />
              )}
              {showLocalForm ? (
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
  const ssoEnabled = keycloakEnabled()
  // SSO is the only visible login path: bounce straight to Keycloak unless
  // we need to show an error or the local sign-in form.
  if (ssoEnabled && !error && !local) {
    return {
      redirect: {
        destination: `/auth/keycloak?next=${encodeURIComponent(
          sanitizeNext(next)
        )}`,
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
