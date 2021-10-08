import { useCallback, useState } from "react"
import {
  ErrorAlert,
  ErrorResult,
  P,
  PasswordStrength,
  SettingsLayout,
  usePasswordStrength,
} from "@app/components"
import {
  useChangePasswordMutation,
  useForgotPasswordMutation,
  useSettingsPasswordQuery,
  useSharedQuery,
} from "@app/graphql"
import { formItemLayout, getCodeFromError, tailFormItemLayout } from "@app/lib"
import { Alert, Button, Form, Input, PageHeader } from "antd"
import { NextPage } from "next"
import Link from "next/link"
import useTranslation from "next-translate/useTranslation"

const Settings_Security: NextPage = () => {
  const { t } = useTranslation("settings")
  const [query] = useSharedQuery()

  const [form] = Form.useForm()
  const [formValues, setFormValues] = useState()
  const { strength: passwordStrength, suggestions: passwordSuggestions } =
    usePasswordStrength(formValues, "newPassword")
  const [{ error }, changePassword] = useChangePasswordMutation()
  const [success, setSuccess] = useState(false)

  const handleSubmit = useCallback(
    async (values) => {
      setSuccess(false)
      try {
        const { error } = await changePassword({
          oldPassword: values.oldPassword,
          newPassword: values.newPassword,
        })
        if (error) throw error
        setSuccess(true)
      } catch (e) {
        const errcode = getCodeFromError(e)
        if (errcode === "WEAKP") {
          form.setFields([
            {
              name: "newPassword",
              value: form.getFieldValue("newPassword"),
              errors: [t("error:weakp")],
            },
          ])
        } else if (errcode === "CREDS") {
          form.setFields([
            {
              name: "oldPassword",
              value: form.getFieldValue("oldPassword"),
              errors: [t("errors.incorrectOldPassword")],
            },
          ])
        } else {
        }
      }
    },
    [changePassword, form, t]
  )

  const [{ data, error: graphqlQueryError, fetching }] =
    useSettingsPasswordQuery()
  const [, forgotPassword] = useForgotPasswordMutation()
  const user = data?.currentUser
  const email = user ? user.primaryEmail : null
  const [resetInProgress, setResetInProgress] = useState(false)

  const handleResetPassword = useCallback(() => {
    if (!email) return
    if (resetInProgress) return
    ;(async () => {
      setResetInProgress(true)
      await forgotPassword({ email })
      setResetInProgress(false)
    })()
  }, [email, forgotPassword, resetInProgress])

  const [passwordIsFocussed, setPasswordIsFocussed] = useState(false)
  const setPasswordFocussed = useCallback(() => {
    setPasswordIsFocussed(true)
  }, [setPasswordIsFocussed])

  const setPasswordNotFocussed = useCallback(() => {
    setPasswordIsFocussed(false)
  }, [setPasswordIsFocussed])

  const [passwordIsDirty, setPasswordIsDirty] = useState(false)
  const handleValuesChange = useCallback(
    (changedValues) => {
      setFormValues(changedValues)
      setPasswordIsDirty(form.isFieldTouched("newPassword"))
    },
    [form]
  )

  const inner = () => {
    if (fetching) {
      /* noop */
    } else if (graphqlQueryError) {
      return <ErrorResult error={graphqlQueryError} />
    } else if (!data?.currentUser?.hasPassword) {
      return (
        <div>
          <PageHeader title={t("titles.security")} />
          <P>
            {t("pages.security.socialLoginNoPassword", { email })}{" "}
            <Link href="/settings/emails">
              {t("pages.security.linkEmailSettings")}
            </Link>
            ).
          </P>
          <Button disabled={resetInProgress} onClick={handleResetPassword}>
            {t("buttons.resetPassphrase")}
          </Button>
        </div>
      )
    }

    return (
      <div>
        <PageHeader title={t("titles.security")} />
        <Form
          {...formItemLayout}
          form={form}
          onFinish={handleSubmit}
          onValuesChange={handleValuesChange}
        >
          <Form.Item
            label={t("form.label.oldPassphrase")}
            name="oldPassword"
            rules={[
              {
                required: true,
                message: t("form.messages.oldPassword"),
              },
            ]}
          >
            <Input type="password" />
          </Form.Item>
          <Form.Item label={t("form.label.newPassphrase")} required>
            <Form.Item
              name="newPassword"
              rules={[
                {
                  required: true,
                  message: t("form.messages.newPassword"),
                },
              ]}
              noStyle
            >
              <Input
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
          {error ? (
            <Form.Item {...tailFormItemLayout}>
              <ErrorAlert
                error={error}
                message={t("form.feedback.passwordChangeFailed")}
              />
            </Form.Item>
          ) : success ? (
            <Form.Item {...tailFormItemLayout}>
              <Alert
                message={t("form.feedback.passwordChanged")}
                type="success"
              />
            </Form.Item>
          ) : null}
          <Form.Item {...tailFormItemLayout}>
            <Button htmlType="submit">{t("buttons.changePassphrase")}</Button>
          </Form.Item>
        </Form>
      </div>
    )
  }
  return (
    <SettingsLayout href="/settings/security" query={query}>
      {inner()}
    </SettingsLayout>
  )
}

export default Settings_Security
