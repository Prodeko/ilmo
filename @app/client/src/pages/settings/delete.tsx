import { useCallback, useState } from "react"
import { ErrorAlert, P, SettingsLayout, useTranslation } from "@app/components"
import {
  useConfirmAccountDeletionMutation,
  useRequestAccountDeletionMutation,
  useSharedQuery,
} from "@app/graphql"
import { getCodeFromError } from "@app/lib"
import { Alert, Button, Modal, PageHeader, Typography } from "antd"
import { useRouter } from "next/router"
import { CombinedError } from "urql"

import type { NextPage } from "next"

const { Text } = Typography

const Settings_Accounts: NextPage = () => {
  const { t } = useTranslation("settings")
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
          throw new Error(t("error:errorOccurred"))
        }
        const { data, error } = result
        if (!data?.requestAccountDeletion?.success) {
          throw new Error(t("errors.deleteFailed"))
        }
        if (error) throw error
        setItIsDone(true)
      } catch (e) {
        setError(e)
      }
      setDoingIt(false)
      setConfirmOpen(false)
    })()
  }, [requestAccountDeletion, t])

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
      <PageHeader title={t("titles.delete")} />
      <P>{t("pages.delete.deleteNotice1")}</P>
      <P>{t("pages.delete.deleteNotice2")}</P>
      {token ? (
        <Alert
          description={
            <>
              <P>
                <Text mark>{t("pages.delete.deleteNotice3")}</Text>
              </P>
              <Button disabled={deleting} danger onClick={confirmDeletion}>
                {t("buttons.permanentDelete")}
              </Button>
            </>
          }
          message={t("pages.delete.confirmDelete1")}
          type="error"
        />
      ) : itIsDone ? (
        <Alert
          description={<P>{t("pages.delete.deleteNotice4")}</P>}
          message={t("pages.delete.confirmDeleteEmail")}
          type="warning"
        />
      ) : (
        <Alert
          description={
            <>
              <P>{t("pages.delete.deleteNotice5")}</P>
              <Button danger onClick={openModal}>
                {t("buttons.wantToDeleteAccount")}
              </Button>
            </>
          }
          message={t("pages.delete.confirmDelete2")}
          type="error"
        />
      )}
      {error &&
        (getCodeFromError(error) === "OWNER" ? (
          <Alert
            description={
              <>
                <P>{t("errors.accountDeleteFailedOrgOwner1")}</P>
                <P>{t("errors.accountDeleteFailedOrgOwner2")}</P>
              </>
            }
            message={"form.feedback.cannotDeleteAccount"}
            type="error"
            showIcon
          />
        ) : (
          <ErrorAlert error={error} style={{ marginTop: "12px" }} />
        ))}

      <Modal
        confirmLoading={doingIt}
        okButtonProps={{ danger: true }}
        okText={t("pages.delete.modals.okText")}
        okType="primary"
        title={t("pages.delete.modals.title")}
        visible={confirmOpen}
        onCancel={closeModal}
        onOk={doIt}
      >
        <P>{t("pages.delete.modals.content1")}</P>
        <P>{t("pages.delete.modals.content2")}</P>
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
              {t("buttons.returnHome")}
            </Button>
          </div>
        }
        title={t("pages.delete.accountDeleted")}
        visible={deleted}
      >
        {t("pages.delete.accountDeletedInfo")}
      </Modal>
    </SettingsLayout>
  )
}

export default Settings_Accounts
