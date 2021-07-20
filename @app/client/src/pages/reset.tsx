import { FocusEvent, useCallback, useState } from "react"
import {
  AuthRestrict,
  Col,
  PasswordStrength,
  Row,
  SharedLayout,
} from "@app/components"
import { useResetPasswordMutation, useSharedQuery } from "@app/graphql"
import { formItemLayout, setPasswordInfo, tailFormItemLayout } from "@app/lib"
import * as Sentry from "@sentry/react"
import { Alert, Button, Form, Input } from "antd"
import { useForm } from "antd/lib/form/Form"
import { NextPage } from "next"
import { Store } from "rc-field-form/lib/interface"

interface Props {
  userId: string | null
  token: string | null
}

enum State {
  PENDING = "PENDING",
  SUBMITTING = "SUBMITTING",
  SUCCESS = "SUCCESS",
}

const ResetPage: NextPage<Props> = ({ userId: rawUserId, token: rawToken }) => {
  const [form] = useForm()
  const [query] = useSharedQuery()
  const [error, setError] = useState<Error | null>(null)
  const [passwordStrength, setPasswordStrength] = useState<number>(0)
  const [passwordSuggestions, setPasswordSuggestions] = useState<string[]>([])
  const [state, setState] = useState<State>(State.PENDING)
  const [[userId, token], setIdAndToken] = useState<[string, string]>([
    rawUserId || "",
    rawToken || "",
  ])

  const clearError = useCallback(() => {
    setError(null)
  }, [setError])

  const [passwordIsFocussed, setPasswordIsFocussed] = useState(false)
  const setPasswordFocussed = useCallback(() => {
    setPasswordIsFocussed(true)
  }, [setPasswordIsFocussed])
  const setPasswordNotFocussed = useCallback(() => {
    setPasswordIsFocussed(false)
  }, [setPasswordIsFocussed])

  const [confirmDirty, setConfirmDirty] = useState(false)
  const handleConfirmBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      const value = e.target.value
      setConfirmDirty(confirmDirty || !!value)
    },
    [confirmDirty]
  )

  const [_res1, resetPassword] = useResetPasswordMutation()
  const handleSubmit = useCallback(
    (values: Store) => {
      setState(State.SUBMITTING)
      setError(null)
      ;(async () => {
        try {
          const result = await resetPassword({
            userId,
            token,
            password: values.password,
          })
          if (result?.data?.resetPassword?.success) {
            setState(State.SUCCESS)
          } else {
            setState(State.PENDING)
            setError(new Error("Incorrect token, please check and try again"))
          }
        } catch (e) {
          if (e.message) {
            setError(e)
          } else {
            setError(new Error("Please check the errors above and try again"))
          }
          setState(State.PENDING)
          Sentry.captureException(e)
        }
      })()
    },
    [resetPassword, token, userId]
  )

  const [passwordIsDirty, setPasswordIsDirty] = useState(false)
  const handleValuesChange = useCallback(
    (changedValues) => {
      setPasswordInfo(
        { setPasswordStrength, setPasswordSuggestions },
        changedValues
      )
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

  const compareToFirstPassword = useCallback(
    async (_rule: any, value: any) => {
      if (value && value !== form.getFieldValue("password")) {
        throw "Make sure your passphrase is the same in both passphrase boxes."
      }
    },
    [form]
  )

  return (
    <SharedLayout
      forbidWhen={
        // reset is used to change password of OAuth-authenticated users
        AuthRestrict.NEVER
      }
      query={query}
      title="Reset Password"
    >
      <Row>
        <Col flex={1}>
          <div>
            {state === "SUBMITTING" ? (
              <Alert
                description="This might take a few moments..."
                message="Submitting..."
                type="info"
              />
            ) : state === "SUCCESS" ? (
              <Alert
                description="Your password was reset; you can go and log in now"
                message="Password Reset"
                type="success"
              />
            ) : null}

            <Form
              {...formItemLayout}
              form={form}
              style={{ display: state === State.PENDING ? "" : "none" }}
              onFinish={handleSubmit}
              onValuesChange={handleValuesChange}
            >
              <Form.Item label="Enter your reset token:">
                <Input
                  type="text"
                  value={token}
                  onChange={(e) => setIdAndToken([userId, e.target.value])}
                />
              </Form.Item>
              <Form.Item label="Choose a new passphrase:" required>
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
                <Form.Item>
                  <Alert
                    message={
                      error.message ? String(error.message) : String(error)
                    }
                    type="error"
                    closable
                    onClose={clearError}
                  />
                </Form.Item>
              )}
              <Form.Item {...tailFormItemLayout}>
                <Button data-cy="resetpage-submit-button" htmlType="submit">
                  Reset passphrase
                </Button>
              </Form.Item>
            </Form>
          </div>
        </Col>
      </Row>
    </SharedLayout>
  )
}

ResetPage.getInitialProps = async ({ query: { user_id, token } = {} }) => ({
  userId: typeof user_id === "string" ? user_id : null,
  token: typeof token === "string" ? token : null,
})

export default ResetPage
