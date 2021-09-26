import { useCallback, useState } from "react"
import { ErrorAlert, P, SettingsLayout } from "@app/components"
import {
  useConfirmAccountDeletionMutation,
  useRequestAccountDeletionMutation,
  useSharedQuery,
} from "@app/graphql"
import { getCodeFromError } from "@app/lib"
import { Alert, Button, Modal, PageHeader, Typography } from "antd"
import { NextPage } from "next"
import { useRouter } from "next/router"
import { CombinedError } from "urql"

const { Text } = Typography

const Settings_Accounts: NextPage = () => {
  const router = useRouter()
  const token: string | null =
    (router?.query?.token && !Array.isArray(router?.query?.token)
      ? router.query.token
      : null) || null
  const [error, setError] = useState<Error | CombinedError | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [itIsDone, setItIsDone] = useState(false)
  const [doingIt, setDoingIt] = useState(false)
  const openModal = useCallback(() => setConfirmOpen(true), [])
  const closeModal = useCallback(() => setConfirmOpen(false), [])

  const [, requestAccountDeletion] = useRequestAccountDeletionMutation()
  const doIt = useCallback(() => {
    setDoingIt(true)
    ;(async () => {
      try {
        const result = await requestAccountDeletion()
        if (!result) {
          throw new Error("Result expected")
        }
        const { data, error } = result
        if (!data?.requestAccountDeletion?.success) {
          throw new Error("Requesting deletion failed")
        }
        if (error) throw error
        setItIsDone(true)
      } catch (e) {
        setError(e)
      }
      setDoingIt(false)
      setConfirmOpen(false)
    })()
  }, [requestAccountDeletion])

  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [, confirmAccountDeletion] = useConfirmAccountDeletionMutation()
  const confirmDeletion = useCallback(() => {
    if (deleting || !token) {
      return
    }
    setError(null)
    setDeleting(true)
    ;(async () => {
      try {
        const { error } = await confirmAccountDeletion({ token })
        if (error) throw error
        // Display confirmation
        setDeleted(true)
      } catch (e) {
        setError(e)
      }
      setDeleting(false)
    })()
  }, [confirmAccountDeletion, deleting, token])

  const [query] = useSharedQuery()

  return (
    <SettingsLayout href="/settings/delete" query={query}>
      <PageHeader title="Delete account" />
      <P>
        Deleting your user account will delete all data (except that which we
        must retain for legal, compliance and accounting reasons) and cannot be
        undone. Make sure you want to do this.
      </P>
      <P>
        To protect your account, we require you to confirm you wish to delete
        your account here, then you will be sent an email with a confirmation
        code (to check your identity) and when you click that link you will be
        asked to confirm your account deletion again.
      </P>
      {token ? (
        <Alert
          description={
            <>
              <P>
                This is it.{" "}
                <Text mark>
                  Press this button and your account will be deleted.
                </Text>{" "}
                We're sorry to see you go, please don't hesitate to reach out
                and let us know why you no longer want your account.
              </P>
              <Button disabled={deleting} danger onClick={confirmDeletion}>
                PERMANENTLY DELETE MY ACCOUNT
              </Button>
            </>
          }
          message="Confirm account deletion"
          type="error"
        />
      ) : itIsDone ? (
        <Alert
          description={
            <P>
              You've been sent an email with a confirmation link in it, you must
              click it to confirm that you are the account holder so that you
              may continue deleting your account.
            </P>
          }
          message="Confirm deletion via email link"
          type="warning"
        />
      ) : (
        <Alert
          description={
            <>
              <P>
                Deleting your account cannot be undone, you will lose all your
                data.
              </P>
              <Button danger onClick={openModal}>
                I want to delete my account
              </Button>
            </>
          }
          message="Delete user account?"
          type="error"
        />
      )}
      {error &&
        (getCodeFromError(error) === "OWNER" ? (
          <Alert
            description={
              <>
                <P>
                  You cannot delete your account whilst you are the owner of an
                  organization.
                </P>
                <P>
                  For each organization you are the owner of, please either
                  assign your ownership to another user or delete the
                  organization to continue.
                </P>
              </>
            }
            message="Cannot delete account"
            type="error"
            showIcon
          />
        ) : (
          <ErrorAlert error={error} style={{ marginTop: "12px" }} />
        ))}

      <Modal
        confirmLoading={doingIt}
        okButtonProps={{ danger: true }}
        okText="Send delete account email"
        okType="primary"
        title="Send delete account confirmation email?"
        visible={confirmOpen}
        onCancel={closeModal}
        onOk={doIt}
      >
        <P>
          Before we can delete your account, we need to confirm it's definitely
          you. We'll send you an email with a link in it, which when clicked
          will give you the option to delete your account.
        </P>
        <P>
          You should not trigger this unless you're sure you want to delete your
          account.
        </P>
      </Modal>
      <Modal
        closable={false}
        footer={
          <div>
            <Button
              type="primary"
              onClick={() => {
                window.location.href = "/"
              }}
            >
              Return to homepage
            </Button>
          </div>
        }
        title="Account deleted"
        visible={deleted}
      >
        Your account has been successfully deleted. We wish you all the best.
      </Modal>
    </SettingsLayout>
  )
}

export default Settings_Accounts
