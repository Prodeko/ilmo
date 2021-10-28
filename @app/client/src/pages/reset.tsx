import { useCallback, useState } from "react"
import {
  AuthRestrict,
  ErrorAlert,
  PasswordStrength,
  SharedLayout,
  usePasswordStrength,
  useTranslation,
} from "@app/components"
import { useResetPasswordMutation, useSharedQuery } from "@app/graphql"
import { formItemLayout, getCodeFromError, tailFormItemLayout } from "@app/lib"
import { Alert, Button, Form, Input } from "antd"

import type { GetServerSideProps, NextPage } from "next"
import type { FocusEvent } from "react"

interface Props {
  userId: string | null
  token: string | null
}

enum State {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
}

const ResetPage: NextPage<Props> = ({ userId: rawUserId, token: rawToken }) => {
  const { t } = useTranslation("reset")
  const [form] = Form.useForm()
  const [query] = useSharedQuery()
  const [error, setError] = useState<Error | null>(null)
  const [formValues, setFormValues] = useState()
  const { strength: passwordStrength, suggestions: passwordSuggestions } =
    usePasswordStrength(formValues, "password")
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

  const [, resetPassword] = useResetPasswordMutation()
  const handleSubmit = useCallback(
    (values) => {
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
          } else if (!!result.error) {
            const code = getCodeFromError(result.error)
            if (code === "WEAKP") {
              setError(new Error(t("error:weakp")))
            } else {
              setError(new Error(t("error:errorOccurred")))
            }
            setState(State.PENDING)
          } else {
            setState(State.PENDING)
            setError(new Error(t("error:incorrectToken")))
          }
        } catch (e) {
          if (e.message) {
            setError(e)
          } else {
            setError(new Error(t("errors.unknownError")))
          }
          setState(State.PENDING)
        }
      })()
    },
    [resetPassword, token, userId, t]
  )

  const [passwordIsDirty, setPasswordIsDirty] = useState(false)
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

  const compareToFirstPassword = useCallback(
    async (_rule: any, value: any) => {
      if (value && value !== form.getFieldValue("password")) {
        throw t("errors.passwordMatch")
      }
    },
    [form, t]
  )

  return (
    <SharedLayout
      forbidWhen={
        // reset is used to change password of OAuth-authenticated users
        AuthRestrict.NEVER
      }
      query={query}
      title={t("title")}
    >
      {state === "SUCCESS" ? (
        <Alert
          description={t("alerts.success.description")}
          message={t("alerts.success.message")}
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
        <Form.Item label={t("form.labels.resetToken")}>
          <Input
            type="text"
            value={token}
            onChange={(e) => {
              setIdAndToken([userId, e.target.value])
              clearError()
            }}
          />
        </Form.Item>
        <Form.Item label={t("form.labels.password")} required>
          <Form.Item
            name="password"
            rules={[
              {
                required: true,
                message: t("form.messages.password"),
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
          label={t("form.labels.confirm")}
          name="confirm"
          rules={[
            {
              required: true,
              message: t("form.messages.confirm"),
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
              data-cy="eventregistrationform-error-alert"
              error={error}
            />
          </Form.Item>
        )}
        <Form.Item {...tailFormItemLayout}>
          <Button data-cy="resetpage-submit-button" htmlType="submit">
            {t("resetButton")}
          </Button>
        </Form.Item>
      </Form>
    </SharedLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { query } = context
  const { user_id, token } = query
  return {
    props: {
      userId: typeof user_id === "string" ? user_id : null,
      token: typeof token === "string" ? token : null,
    },
  }
}

export default ResetPage
