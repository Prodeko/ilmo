import { useCallback, useState } from "react"
import {
  ErrorAlert,
  ErrorResult,
  P,
  PasswordStrength,
  SettingsLayout,
} from "@app/components"
import {
  useChangePasswordMutation,
  useForgotPasswordMutation,
  useSettingsPasswordQuery,
  useSharedQuery,
} from "@app/graphql"
import {
  formItemLayout,
  getCodeFromError,
  setPasswordInfo,
  tailFormItemLayout,
} from "@app/lib"
import * as Sentry from "@sentry/react"
import { Alert, Button, Form, Input, PageHeader } from "antd"
import { useForm } from "antd/lib/form/Form"
import { NextPage } from "next"
import Link from "next/link"
import { Store } from "rc-field-form/lib/interface"

const Settings_Security: NextPage = () => {
  const [passwordStrength, setPasswordStrength] = useState<number>(0)
  const [passwordSuggestions, setPasswordSuggestions] = useState<string[]>([])

  const [query] = useSharedQuery()

  const [form] = useForm()
  const [{ error }, changePassword] = useChangePasswordMutation()
  const [success, setSuccess] = useState(false)

  const handleSubmit = useCallback(
    async (values: Store) => {
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
              errors: [
                "The server believes this passphrase is too weak, please make it stronger",
              ],
            },
          ])
        } else if (errcode === "CREDS") {
          form.setFields([
            {
              name: "oldPassword",
              value: form.getFieldValue("oldPassword"),
              errors: ["Incorrect old passphrase"],
            },
          ])
        } else {
          Sentry.captureException(e)
        }
      }
    },
    [changePassword, form]
  )

  const [{ data, error: graphqlQueryError, fetching }] =
    useSettingsPasswordQuery()
  const [_res2, forgotPassword] = useForgotPasswordMutation()
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
      setPasswordInfo(
        { setPasswordStrength, setPasswordSuggestions },
        changedValues,
        "newPassword"
      )
      setPasswordIsDirty(form.isFieldTouched("password"))
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
          <PageHeader title="Change passphrase" />
          <P>
            You registered your account through social login, so you do not
            currently have a passphrase. If you would like a passphrase, press
            the button below to request a passphrase reset email to '{email}'
            (you can choose a different email by making it primary in{" "}
            <Link href="/settings/emails">email settings</Link>).
          </P>
          <Button disabled={resetInProgress} onClick={handleResetPassword}>
            Reset passphrase
          </Button>
        </div>
      )
    }

    return (
      <div>
        <PageHeader title="Change passphrase" />
        <Form
          {...formItemLayout}
          form={form}
          onFinish={handleSubmit}
          onValuesChange={handleValuesChange}
        >
          <Form.Item
            label="Old passphrase"
            name="oldPassword"
            rules={[
              {
                required: true,
                message: "Please input your passphrase",
              },
            ]}
          >
            <Input type="password" />
          </Form.Item>
          <Form.Item label="New passphrase" required>
            <Form.Item
              name="newPassword"
              rules={[
                {
                  required: true,
                  message: "Please confirm your passphrase",
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
            <Form.Item>
              <ErrorAlert error={error} message="Changing passphrase failed" />
            </Form.Item>
          ) : success ? (
            <Form.Item>
              <Alert message="Password changed!" type="success" />
            </Form.Item>
          ) : null}
          <Form.Item {...tailFormItemLayout}>
            <Button htmlType="submit">Change Passphrase</Button>
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
