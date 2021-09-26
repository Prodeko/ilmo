import { useCallback, useState } from "react"
import { ErrorAlert, Redirect, SettingsLayout } from "@app/components"
import {
  ProfileSettingsForm_UserFragment,
  useSettingsProfileQuery,
  useUpdateUserMutation,
} from "@app/graphql"
import { formItemLayout, getCodeFromError, tailFormItemLayout } from "@app/lib"
import { Alert, Button, Form, Input, PageHeader } from "antd"
import { NextPage } from "next"
import useTranslation from "next-translate/useTranslation"

const Settings_Profile: NextPage = () => {
  const { t } = useTranslation()
  const [query] = useSettingsProfileQuery()
  const { data, fetching, error } = query

  return (
    <SettingsLayout href="/settings" query={query}>
      {data && data.currentUser ? (
        <ProfileSettingsForm user={data.currentUser} />
      ) : fetching ? (
        t("common:loading")
      ) : error ? (
        <ErrorAlert error={error} />
      ) : (
        <Redirect href={`/login?next=${encodeURIComponent("/settings")}`} />
      )}
    </SettingsLayout>
  )
}

export default Settings_Profile

interface ProfileSettingsFormProps {
  user: ProfileSettingsForm_UserFragment
}

function ProfileSettingsForm({ user }: ProfileSettingsFormProps) {
  const [form] = Form.useForm()
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
              name: "username",
              value: form.getFieldValue("username"),
              errors: [
                "This username is already in use, please pick a different name",
              ],
            },
          ])
        }
      }
    },
    [updateUser, user.id, form]
  )

  return (
    <div>
      <PageHeader title="Edit profile" />
      <Form
        {...formItemLayout}
        form={form}
        initialValues={{ name: user.name, username: user.username }}
        onFinish={handleSubmit}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[
            {
              required: true,
              message: "Please enter your name",
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label="Username"
          name="username"
          rules={[
            {
              required: true,
              message: "Please choose a username",
            },
          ]}
        >
          <Input />
        </Form.Item>
        {error ? (
          <Form.Item>
            <ErrorAlert error={error} message="Updating username" />
          </Form.Item>
        ) : success ? (
          <Form.Item>
            <Alert message={`Profile updated`} type="success" />
          </Form.Item>
        ) : null}
        <Form.Item {...tailFormItemLayout}>
          <Button htmlType="submit">Update Profile</Button>
        </Form.Item>
      </Form>
    </div>
  )
}
