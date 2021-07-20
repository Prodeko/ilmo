import { useCallback, useState } from "react"
import {
  ErrorAlert,
  ErrorResult,
  P,
  Redirect,
  SettingsLayout,
  Strong,
} from "@app/components"
import {
  EmailsForm_UserEmailFragment,
  useAddEmailMutation,
  useDeleteEmailMutation,
  useMakeEmailPrimaryMutation,
  useResendEmailVerificationMutation,
  useSettingsEmailsQuery,
} from "@app/graphql"
import { formItemLayout, tailFormItemLayout } from "@app/lib"
import { Alert, Avatar, Button, Form, Input, List, PageHeader } from "antd"
import { useForm } from "antd/lib/form/Form"
import { NextPage } from "next"
import { Store } from "rc-field-form/lib/interface"

function Email({
  email,
  hasOtherEmails,
}: {
  email: EmailsForm_UserEmailFragment
  hasOtherEmails: boolean
}) {
  const canDelete = !email.isPrimary && hasOtherEmails
  const [_res1, deleteEmail] = useDeleteEmailMutation()
  const [_res2, resendEmailVerification] = useResendEmailVerificationMutation()
  const [_res3, makeEmailPrimary] = useMakeEmailPrimaryMutation()

  return (
    <List.Item
      key={email.id}
      actions={[
        email.isPrimary && (
          <span data-cy="settingsemails-indicator-primary">Primary</span>
        ),
        canDelete && (
          <a
            data-cy="settingsemails-button-delete"
            onClick={() => deleteEmail({ emailId: email.id })}
          >
            Delete
          </a>
        ),
        !email.isVerified && (
          <a onClick={() => resendEmailVerification({ emailId: email.id })}>
            Resend verification
          </a>
        ),
        email.isVerified && !email.isPrimary && (
          <a
            data-cy="settingsemails-button-makeprimary"
            onClick={() => makeEmailPrimary({ emailId: email.id })}
          >
            Make primary
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
        description={`Added ${new Date(
          Date.parse(email.createdAt)
        ).toLocaleString()}`}
        title={
          <span>
            {" "}
            {email.email}{" "}
            <span
              title={
                email.isVerified
                  ? "Verified"
                  : "Pending verification (please check your inbox / spam folder"
              }
            >
              {" "}
              {email.isVerified ? (
                "✅"
              ) : (
                <small style={{ color: "red" }}>(unverified)</small>
              )}{" "}
            </span>{" "}
          </span>
        }
      />
    </List.Item>
  )
}

const Settings_Emails: NextPage = () => {
  const [showAddEmailForm, setShowAddEmailForm] = useState(false)
  const [query] = useSettingsEmailsQuery()
  const { data, fetching, error } = query
  const user = data && data.currentUser
  const pageContent = (() => {
    if (error && !fetching) {
      return <ErrorResult error={error} />
    } else if (!user && !fetching) {
      return (
        <Redirect
          href={`/login?next=${encodeURIComponent("/settings/emails")}`}
        />
      )
    } else if (!user) {
      return "Loading"
    } else {
      return (
        <div>
          {user.isVerified ? null : (
            <div style={{ marginBottom: "0.5rem" }}>
              <Alert
                description={`
                  You do not have any verified email addresses, this will make
                  account recovery impossible and may limit your available
                  functionality within this application. Please complete email
                  verification.
                `}
                message="No verified emails"
                type="warning"
                showIcon
              />
            </div>
          )}
          <PageHeader title="Email addresses" />
          <P>
            <Strong>
              Account notices will be sent your primary email address.
            </Strong>{" "}
            Additional email addresses may be added to help with account
            recovery (or to change your primary email), but they cannot be used
            until verified.
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
                    Add email
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
      )
    }
  })()
  return (
    <SettingsLayout href="/settings/emails" query={query}>
      {pageContent}
    </SettingsLayout>
  )
}

export default Settings_Emails
interface AddEmailFormProps {
  onComplete: () => void
}

function AddEmailForm({ onComplete }: AddEmailFormProps) {
  const [form] = useForm()
  const [{ error }, addEmail] = useAddEmailMutation()
  const handleSubmit = useCallback(
    async (values: Store) => {
      const { error } = await addEmail({ email: values.email })
      if (!error) onComplete()
    },
    [addEmail, onComplete]
  )
  return (
    <Form {...formItemLayout} form={form} onFinish={handleSubmit}>
      <Form.Item
        label="New email"
        name="email"
        rules={[
          {
            required: true,
            message: "Please enter an email address",
          },
        ]}
      >
        <Input data-cy="settingsemails-input-email" />
      </Form.Item>
      {error && (
        <Form.Item>
          <ErrorAlert error={error} message="Error adding email" />
        </Form.Item>
      )}
      <Form.Item {...tailFormItemLayout}>
        <Button data-cy="settingsemails-button-submit" htmlType="submit">
          Add email
        </Button>
      </Form.Item>
    </Form>
  )
}
