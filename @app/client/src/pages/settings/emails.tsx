import { useCallback, useState } from "react"
import { PageHeader } from "@ant-design/pro-layout"
import {
  ErrorAlert,
  P,
  Redirect,
  SettingsLayout,
  Strong,
  useTranslation,
} from "@app/components"
import {
  EmailsForm_UserEmailFragment,
  useAddEmailMutation,
  useDeleteEmailMutation,
  useMakeEmailPrimaryMutation,
  useResendEmailVerificationMutation,
  useSharedQuery,
} from "@app/graphql"
import { formItemLayout, tailFormItemLayout } from "@app/lib"
import { Alert, Avatar, Button, Form, Input, List } from "antd"

import type { NextPage } from "next"

function Email({
  email,
  hasOtherEmails,
}: {
  email: EmailsForm_UserEmailFragment
  hasOtherEmails: boolean
}) {
  const { t } = useTranslation("settings")
  const canDelete = !email.isPrimary && hasOtherEmails
  const [, deleteEmail] = useDeleteEmailMutation()
  const [, resendEmailVerification] = useResendEmailVerificationMutation()
  const [, makeEmailPrimary] = useMakeEmailPrimaryMutation()

  return (
    <List.Item
      key={email.id}
      actions={[
        email.isPrimary && (
          <span data-cy="settingsemails-indicator-primary">
            {t("common:primary")}
          </span>
        ),
        canDelete && (
          <a
            data-cy="settingsemails-button-delete"
            onClick={() => deleteEmail({ emailId: email.id })}
          >
            {t("common:delete")}
          </a>
        ),
        !email.isVerified && (
          <a onClick={() => resendEmailVerification({ emailId: email.id })}>
            {t("pages.emails.resendVerification")}
          </a>
        ),
        email.isVerified && !email.isPrimary && (
          <a
            data-cy="settingsemails-button-makeprimary"
            onClick={() => makeEmailPrimary({ emailId: email.id })}
          >
            {t("pages.emails.makePrimary")}
          </a>
        ),
      ].filter((_) => _)}
      data-cy={`settingsemails-emailitem-${email.email.replace(
        /[^a-zA-Z0-9]/g,
        "-"
      )}`}
    >
      <List.Item.Meta
        avatar={
          <Avatar size="large" style={{ backgroundColor: "transparent" }}>
            ✉️
          </Avatar>
        }
        description={`${t("common:added")} ${new Date(
          Date.parse(email.createdAt)
        ).toLocaleString()}`}
        title={
          <span>
            {" "}
            {email.email}{" "}
            <span
              title={
                email.isVerified
                  ? t("pages.emails.verified")
                  : t("pages.emails.pendingVerification")
              }
            >
              {" "}
              {email.isVerified ? (
                "✅"
              ) : (
                <small style={{ color: "red" }}>
                  ({t("pages.emails.unverified")})
                </small>
              )}{" "}
            </span>{" "}
          </span>
        }
      />
    </List.Item>
  )
}

const Settings_Emails: NextPage = () => {
  const { t } = useTranslation("settings")
  const [showAddEmailForm, setShowAddEmailForm] = useState(false)
  const [query] = useSharedQuery()
  const { data, fetching, error } = query
  const user = data?.currentUser

  return (
    <SettingsLayout href="/settings/emails" query={query}>
      {user ? (
        <div>
          {user.isVerified ? null : (
            <div style={{ marginBottom: "0.5rem" }}>
              <Alert
                description={t("pages.emails.alerts.notVerified.description")}
                message={t("pages.emails.alerts.notVerified.message")}
                type="warning"
                showIcon
              />
            </div>
          )}
          <PageHeader title={t("titles.emails")} />
          <P>
            <Strong>{t("pages.emails.accountNoticeInfo1")}</Strong>{" "}
            {t("pages.emails.accountNoticeInfo2")}
          </P>
          <List
            dataSource={user.userEmails.nodes}
            footer={
              !showAddEmailForm ? (
                <div>
                  <Button
                    data-cy="settingsemails-button-addemail"
                    type="primary"
                    onClick={() => setShowAddEmailForm(true)}
                  >
                    {t("buttons.addEmail")}
                  </Button>
                </div>
              ) : (
                <AddEmailForm onComplete={() => setShowAddEmailForm(false)} />
              )
            }
            renderItem={(email) => (
              <Email
                email={email}
                hasOtherEmails={user.userEmails.nodes.length > 1}
              />
            )}
            size="large"
            bordered
          />
        </div>
      ) : fetching ? (
        t("common:loading")
      ) : error ? (
        <ErrorAlert error={error} />
      ) : (
        <Redirect
          href={`/login?next=${encodeURIComponent("/settings/emails")}`}
        />
      )}
    </SettingsLayout>
  )
}

export default Settings_Emails
interface AddEmailFormProps {
  onComplete: () => void
}

function AddEmailForm({ onComplete }: AddEmailFormProps) {
  const { t } = useTranslation("settings")
  const [form] = Form.useForm()
  const [{ error }, addEmail] = useAddEmailMutation()
  const handleSubmit = useCallback(
    async (values) => {
      const { error } = await addEmail({ email: values.email })
      if (!error) onComplete()
    },
    [addEmail, onComplete]
  )
  return (
    <Form {...formItemLayout} form={form} onFinish={handleSubmit}>
      <Form.Item
        label={t("form.label.newEmail")}
        name="email"
        rules={[
          {
            required: true,
            message: t("form.messages.email"),
          },
        ]}
      >
        <Input data-cy="settingsemails-input-email" />
      </Form.Item>
      {error && (
        <Form.Item>
          <ErrorAlert
            error={error}
            message={t("form.feedback.emailAddFailed")}
          />
        </Form.Item>
      )}
      <Form.Item {...tailFormItemLayout}>
        <Button data-cy="settingsemails-button-submit" htmlType="submit">
          {t("buttons.addEmail")}
        </Button>
      </Form.Item>
    </Form>
  )
}
