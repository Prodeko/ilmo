// @ts-nocheck
/* eslint-disable */
import { FocusEvent, useCallback, useEffect, useRef, useState } from "react"
import { QuestionCircleOutlined } from "@ant-design/icons"
import {
  AuthRestrict,
  ErrorAlert,
  PasswordStrength,
  Redirect,
  SharedLayout,
} from "@app/components"
import { useRegisterMutation, useSharedQuery } from "@app/graphql"
import {
  formItemLayout,
  getCodeFromError,
  getExceptionFromError,
  resetWebsocketConnection,
  tailFormItemLayout,
} from "@app/lib"
import { Button, Form, Input, Tooltip } from "antd"
import type { NextPage } from "next"
import { useRouter } from "next/router"

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
          username: values.username,
          email: values.email,
          password: values.password,
          name: values.name,
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
              errors: [
                "The server believes this passphrase is too weak, please make it stronger",
              ],
            },
          ])
        } else if (code === "EMTKN") {
          form.setFields([
            {
              name: "email",
              value: form.getFieldValue("email"),
              errors: [
                "An account with this email address has already been registered, consider using the 'Forgot passphrase' function.",
              ],
            },
          ])
        } else if (code === "NUNIQ" && fields && fields[0] === "username") {
          form.setFields([
            {
              name: "username",
              value: form.getFieldValue("username"),
              errors: [
                "An account with this username has already been registered, please try a different username.",
              ],
            },
          ])
        } else if (code === "23514") {
          form.setFields([
            {
              name: "username",
              value: form.getFieldValue("username"),
              errors: [
                "This username is not allowed; usernames must be between 2 and 24 characters long (inclusive), must start with a letter, and must contain only alphanumeric characters and underscores.",
              ],
            },
          ])
        }
      }
    },
    [form, register, resetUrqlClient, next]
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
        throw "Make sure your passphrase is the same in both passphrase boxes."
      }
    },
    [form]
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
      query={query}
      title="Register"
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
              label={
                <span data-cy="registerpage-name-label">
                  Name&nbsp;
                  <Tooltip title="What is your name?">
                    <QuestionCircleOutlined />
                  </Tooltip>
                </span>
              }
              name="name"
              rules={[
                {
                  required: true,
                  message: "Please input your name.",
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
              label={
                <span>
                  Username&nbsp;
                  <Tooltip title="What do you want others to call you?">
                    <QuestionCircleOutlined />
                  </Tooltip>
                </span>
              }
              name="username"
              rules={[
                {
                  required: true,
                  message: "Please input your username.",
                  whitespace: true,
                },
                {
                  min: 2,
                  message: "Username must be at least 2 characters long.",
                },
                {
                  max: 24,
                  message: "Username must be no more than 24 characters long.",
                },
                {
                  pattern: /^([a-zA-Z]|$)/,
                  message: "Username must start with a letter.",
                },
                {
                  pattern: /^([^_]|_[^_]|_$)*$/,
                  message:
                    "Username must not contain two underscores next to each other.",
                },
                {
                  pattern: /^[a-zA-Z0-9_]*$/,
                  message:
                    "Username must contain only alphanumeric characters and underscores.",
                },
              ]}
            >
              <Input
                autoComplete="username"
                data-cy="registerpage-input-username"
              />
            </Form.Item>
            <Form.Item
              label="E-mail"
              name="email"
              rules={[
                {
                  type: "email",
                  message: "The input is not valid E-mail.",
                },
                {
                  required: true,
                  message: "Please input your E-mail.",
                },
              ]}
            >
              <Input data-cy="registerpage-input-email" />
            </Form.Item>
            <Form.Item label="Passphrase" required>
              <Form.Item
                name="password"
                rules={[
                  {
                    required: true,
                    message: "Please input your passphrase.",
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
              label="Confirm passphrase"
              name="confirm"
              rules={[
                {
                  required: true,
                  message: "Please confirm your passphrase.",
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
              <Form.Item label="Error">
                <ErrorAlert error={error} message="Registration failed" />
              </Form.Item>
            )}
            <Form.Item {...tailFormItemLayout}>
              <Button data-cy="registerpage-submit-button" htmlType="submit">
                Register
              </Button>
            </Form.Item>
          </Form>
        )
      }
    </SharedLayout>
  )
}

Register.getInitialProps = async ({ query }) => ({
  next: typeof query.next === "string" ? query.next : null,
})

export default Register
