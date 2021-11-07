import { FocusEvent, useCallback, useEffect, useRef, useState } from "react"
import {
  AuthRestrict,
  ErrorAlert,
  PasswordStrength,
  Redirect,
  SharedLayout,
  usePasswordStrength,
  useTranslation,
} from "@app/components"
import { useRegisterMutation, useSharedQuery } from "@app/graphql"
import {
  formItemLayout,
  getCodeFromError,
  getExceptionFromError,
  resetWebsocketConnection,
  tailFormItemLayout,
} from "@app/lib"
import { Button, Form, Input } from "antd"
import { useRouter } from "next/router"

import { isSafe } from "./login"

import type { GetServerSideProps, NextPage } from "next"

interface RegisterProps {
  next: string | null
  // Comes from _app.tsx withUrql HOC
  resetUrqlClient?: () => void
}

/**
 * The registration page just renders the standard layout and embeds the
 * registration form.
 */
const Register: NextPage<RegisterProps> = ({
  next: rawNext,
  resetUrqlClient,
}) => {
  const router = useRouter()
  const { t } = useTranslation("register_user")
  const [formValues, setFormValues] = useState()
  const { strength: passwordStrength, suggestions: passwordSuggestions } =
    usePasswordStrength(formValues, "password")
  const next: string = isSafe(rawNext) ? rawNext! : "/"
  const [query] = useSharedQuery()

  const [{ error }, register] = useRegisterMutation()
  const [confirmDirty, setConfirmDirty] = useState(false)
  const [form] = Form.useForm()

  const handleSubmit = useCallback(
    async (values) => {
      try {
        const { error } = await register({
          ...values,
        })
        if (error) throw error
        // Success: refetch
        resetWebsocketConnection()
        resetUrqlClient()
        router.push(next)
      } catch (e) {
        const code = getCodeFromError(e)
        const exception = getExceptionFromError(e)
        const fields: any = exception && exception["fields"]
        if (code === "WEAKP") {
          form.setFields([
            {
              name: "password",
              value: form.getFieldValue("password"),
              errors: [t("error:weakp")],
            },
          ])
        } else if (code === "EMTKN") {
          form.setFields([
            {
              name: "email",
              value: form.getFieldValue("email"),
              errors: [t("errors.emailAlreadyExists")],
            },
          ])
        } else if (code === "NUNIQ" && fields && fields[0] === "username") {
          form.setFields([
            {
              name: "username",
              value: form.getFieldValue("username"),
              errors: [t("errors.usernameAlreadyExists")],
            },
          ])
        } else if (code === "23514") {
          form.setFields([
            {
              name: "username",
              value: form.getFieldValue("username"),
              errors: [t("errors.usernameInvalid")],
            },
          ])
        }
      }
    },
    [form, register, resetUrqlClient, next, router, t]
  )

  const handleConfirmBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      const value = e.target.value
      setConfirmDirty(confirmDirty || !!value)
    },
    [setConfirmDirty, confirmDirty]
  )

  const compareToFirstPassword = useCallback(
    async (_rule: any, value: any) => {
      if (value && value !== form.getFieldValue("password")) {
        throw t("errors.checkpasswordMatch")
      }
    },
    [form, t]
  )

  const focusElement = useRef<Input>(null)
  useEffect(
    () => void (focusElement.current && focusElement.current!.focus()),
    [focusElement]
  )

  const [passwordIsFocussed, setPasswordIsFocussed] = useState(false)
  const [passwordIsDirty, setPasswordIsDirty] = useState(false)
  const setPasswordFocussed = useCallback(() => {
    setPasswordIsFocussed(true)
  }, [setPasswordIsFocussed])
  const setPasswordNotFocussed = useCallback(() => {
    setPasswordIsFocussed(false)
  }, [setPasswordIsFocussed])

  const handleValuesChange = useCallback(
    (changedValues) => {
      setFormValues(changedValues)
      setPasswordIsDirty(form.isFieldTouched("password"))
      if (changedValues.confirm) {
        if (form.isFieldTouched("password")) {
          form.validateFields(["password"])
        }
      } else if (changedValues.password) {
        if (form.isFieldTouched("confirm")) {
          form.validateFields(["confirm"])
        }
      }
    },
    [form]
  )

  return (
    <SharedLayout
      forbidWhen={AuthRestrict.LOGGED_IN}
      noHandleErrors={!!query.data?.currentUser}
      query={query}
      title={t("title")}
    >
      {({ currentUser }) =>
        currentUser ? (
          <Redirect href={next} />
        ) : (
          <Form
            {...formItemLayout}
            form={form}
            onFinish={handleSubmit}
            onValuesChange={handleValuesChange}
          >
            <Form.Item
              label={t("common:name")}
              name="name"
              rules={[
                {
                  required: true,
                  message: t("form.messages.inputName"),
                  whitespace: true,
                },
              ]}
            >
              <Input
                ref={focusElement}
                autoComplete="name"
                data-cy="registerpage-input-name"
              />
            </Form.Item>
            <Form.Item
              label={t("common:username")}
              name="username"
              rules={[
                {
                  required: true,
                  message: t("form.messages.inputUsername"),
                  whitespace: true,
                },
                {
                  min: 2,
                  message: t("form.messages.usernameMinLength"),
                },
                {
                  max: 24,
                  message: t("form.messages.usernameMaxLength"),
                },
                {
                  pattern: /^([a-zA-Z]|$)/,
                  message: t("form.messages.usernameStartLetter"),
                },
                {
                  pattern: /^([^_]|_[^_]|_$)*$/,
                  message: t("form.messages.usernameNoTwoUnderscores"),
                },
                {
                  pattern: /^[a-zA-Z0-9_]*$/,
                  message: t("form.messages.usernameAlphanumeric"),
                },
              ]}
            >
              <Input
                autoComplete="username"
                data-cy="registerpage-input-username"
              />
            </Form.Item>
            <Form.Item
              label={t("form.labels.email")}
              name="email"
              rules={[
                {
                  type: "email",
                  message: t("form.messages.inputEmailValid"),
                },
                {
                  required: true,
                  message: t("form.messages.inputEmail"),
                },
              ]}
            >
              <Input data-cy="registerpage-input-email" />
            </Form.Item>
            <Form.Item label={t("form.labels.passphrase")} required>
              <Form.Item
                name="password"
                rules={[
                  {
                    required: true,
                    message: t("form.messages.inputPassphrase"),
                  },
                ]}
                noStyle
              >
                <Input
                  autoComplete="new-password"
                  data-cy="registerpage-input-password"
                  type="password"
                  onBlur={setPasswordNotFocussed}
                  onFocus={setPasswordFocussed}
                />
              </Form.Item>
              <PasswordStrength
                isDirty={passwordIsDirty}
                isFocussed={passwordIsFocussed}
                passwordStrength={passwordStrength}
                suggestions={passwordSuggestions}
              />
            </Form.Item>
            <Form.Item
              label={t("form.labels.confirmPassphrase")}
              name="confirm"
              rules={[
                {
                  required: true,
                  message: t("form.messages.confirmPassphrase"),
                },
                {
                  validator: compareToFirstPassword,
                },
              ]}
            >
              <Input
                autoComplete="new-password"
                data-cy="registerpage-input-password2"
                type="password"
                onBlur={handleConfirmBlur}
              />
            </Form.Item>
            {error && (
              <Form.Item {...tailFormItemLayout}>
                <ErrorAlert
                  error={error}
                  message={t("errors.registrationFailed")}
                />
              </Form.Item>
            )}
            <Form.Item {...tailFormItemLayout}>
              <Button data-cy="registerpage-submit-button" htmlType="submit">
                {t("form.submit")}
              </Button>
            </Form.Item>
          </Form>
        )
      }
    </SharedLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { query } = context
  const { next, token } = query
  return {
    props: {
      next: typeof next === "string" ? next : null,
      token: typeof token === "string" ? token : null,
    },
  }
}

export default Register
