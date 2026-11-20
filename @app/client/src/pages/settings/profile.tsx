import { useCallback, useState } from "react"
import {
  ErrorAlert,
  PageHeader,
  Redirect,
  SettingsLayout,
  useTranslation,
} from "@app/components"
import {
  SharedLayout_UserFragment,
  useRegistrationProfileQuery,
  useSetRegistrationProfileMutation,
  useSharedQuery,
  useUpdateUserMutation,
} from "@app/graphql"
import { formItemLayout, getCodeFromError, tailFormItemLayout } from "@app/lib"
import { Alert, Button, Form, Input, Typography } from "antd"

import type { NextPage } from "next"

const Settings_Profile: NextPage = () => {
  const { t } = useTranslation("settings")
  const [query] = useSharedQuery()
  const { data, fetching, error } = query

  return (
    <SettingsLayout href="/settings/profile" query={query}>
      {data?.currentUser ? (
        <>
          <ProfileSettingsForm user={data.currentUser} />
          <RegistrationProfileForm />
        </>
      ) : fetching ? (
        t("common:loading")
      ) : error ? (
        <ErrorAlert error={error} />
      ) : (
        <Redirect
          href={`/login?next=${encodeURIComponent("/settings/profile")}`}
        />
      )}
    </SettingsLayout>
  )
}

export default Settings_Profile

interface ProfileSettingsFormProps {
  user: SharedLayout_UserFragment
}

function ProfileSettingsForm({ user }: ProfileSettingsFormProps) {
  const [form] = Form.useForm()
  const { t } = useTranslation("settings")
  const [{ error }, updateUser] = useUpdateUserMutation()
  const [success, setSuccess] = useState(false)

  const handleSubmit = useCallback(
    async (values) => {
      setSuccess(false)
      try {
        const { error } = await updateUser({
          id: user.id,
          patch: {
            username: values.username,
            name: values.name,
          },
        })
        if (error) throw error
        setSuccess(true)
      } catch (e) {
        const errcode = getCodeFromError(e)
        if (errcode === "NUNIQ") {
          form.setFields([
            {
              name: "username",
              value: form.getFieldValue("username"),
              errors: [t("errors.usernameTaken")],
            },
          ])
        }
      }
    },
    [updateUser, user.id, form, t]
  )

  return (
    <div>
      <PageHeader title={t("titles.index")} />
      <Form
        {...formItemLayout}
        form={form}
        initialValues={{ name: user.name, username: user.username }}
        onFinish={handleSubmit}
      >
        <Form.Item
          label={t("common:name")}
          name="name"
          rules={[
            {
              required: true,
              message: t("form.messages.name"),
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label={t("common:username")}
          name="username"
          rules={[
            {
              required: true,
              message: t("form.messages.username"),
            },
          ]}
        >
          <Input />
        </Form.Item>
        {error ? (
          <Form.Item {...tailFormItemLayout}>
            <ErrorAlert
              error={error}
              message={t("errors.errorUpdatingUsername")}
            />
          </Form.Item>
        ) : success ? (
          <Form.Item {...tailFormItemLayout}>
            <Alert message={t("form.feedback.profileUpdated")} type="success" />
          </Form.Item>
        ) : null}
        <Form.Item {...tailFormItemLayout}>
          <Button htmlType="submit">{t("buttons.updateProfile")}</Button>
        </Form.Item>
      </Form>
    </div>
  )
}

function RegistrationProfileForm() {
  const { t } = useTranslation("settings")
  const [query] = useRegistrationProfileQuery()
  const [{ error }, setRegistrationProfile] =
    useSetRegistrationProfileMutation()
  const [success, setSuccess] = useState(false)

  const handleSubmit = useCallback(
    async (values) => {
      setSuccess(false)
      const { error } = await setRegistrationProfile({
        telegram: values.telegram ?? "",
        dietaryRestrictions: values.dietaryRestrictions ?? "",
      })
      if (!error) setSuccess(true)
    },
    [setRegistrationProfile]
  )

  if (query.fetching && !query.data) return <>{t("common:loading")}</>
  if (query.error) return <ErrorAlert error={query.error} />

  const { telegram, dietaryRestrictions } =
    query.data?.currentUser?.registrationProfile || {}

  return (
    <div>
      <PageHeader title={t("titles.registrationProfile")} />
      <Typography.Paragraph type="secondary">
        {t("registrationProfile.description")}
      </Typography.Paragraph>
      <Form
        {...formItemLayout}
        initialValues={{ telegram, dietaryRestrictions }}
        onFinish={handleSubmit}
      >
        <Form.Item
          label={t("form.label.telegram")}
          name="telegram"
          rules={[{ max: 64, message: t("form.messages.telegramTooLong") }]}
        >
          <Input data-cy="settings-input-telegram" />
        </Form.Item>
        <Form.Item
          label={t("form.label.dietaryRestrictions")}
          name="dietaryRestrictions"
          rules={[
            {
              max: 1000,
              message: t("form.messages.dietaryRestrictionsTooLong"),
            },
          ]}
        >
          <Input.TextArea
            autoSize={{ minRows: 2 }}
            data-cy="settings-input-dietary-restrictions"
          />
        </Form.Item>
        {error ? (
          <Form.Item {...tailFormItemLayout}>
            <ErrorAlert
              error={error}
              message={t("errors.errorUpdatingRegistrationProfile")}
            />
          </Form.Item>
        ) : success ? (
          <Form.Item {...tailFormItemLayout}>
            <Alert
              message={t("form.feedback.registrationProfileUpdated")}
              type="success"
            />
          </Form.Item>
        ) : null}
        <Form.Item {...tailFormItemLayout}>
          <Button
            data-cy="settings-button-update-registration-profile"
            htmlType="submit"
          >
            {t("buttons.updateRegistrationProfile")}
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}
