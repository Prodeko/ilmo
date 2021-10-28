import { useCallback, useState } from "react"
import {
  ErrorAlert,
  Redirect,
  SettingsLayout,
  useTranslation,
} from "@app/components"
import {
  SharedLayout_UserFragment,
  useSharedQuery,
  useUpdateUserMutation,
} from "@app/graphql"
import { formItemLayout, getCodeFromError, tailFormItemLayout } from "@app/lib"
import { Alert, Button, Form, Input, PageHeader } from "antd"

import type { NextPage } from "next"

const Settings_Profile: NextPage = () => {
  const { t } = useTranslation("settings")
  const [query] = useSharedQuery()
  const { data, fetching, error } = query

  return (
    <SettingsLayout href="/settings/profile" query={query}>
      {data?.currentUser ? (
        <ProfileSettingsForm user={data.currentUser} />
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
        if (errcode === "23505") {
          form.setFields([
            {
              name: t("username"),
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
          <Form.Item>
            <ErrorAlert
              error={error}
              message={t("form.feedback.profileUpdating")}
            />
          </Form.Item>
        ) : success ? (
          <Form.Item>
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
