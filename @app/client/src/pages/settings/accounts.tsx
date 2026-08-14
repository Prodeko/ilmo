import { useCallback, useState } from "react"
import {
  ErrorAlert,
  LoadingPadded,
  PageHeader,
  ProdekoIcon,
  SettingsLayout,
  Strong,
  useTranslation,
} from "@app/components"
import {
  useCurrentUserAuthenticationsQuery,
  UserAuthentication,
  useSharedQuery,
  useUnlinkUserAuthenticationMutation,
} from "@app/graphql"
import { Alert, Avatar, Button, Card, List, message, Modal, Spin } from "antd"
import { useRouter } from "next/router"
import { Translate } from "next-translate"

import type { NextPage } from "next"

const AUTH_NAME_LOOKUP = {
  // `oauth2` rows exist in production data and are display-only; new links are
  // always `keycloak`.
  oauth2: "Prodeko",
  keycloak: "Prodeko ID",
}
function authName(service: string) {
  return AUTH_NAME_LOOKUP[service] || service
}

const AUTH_ICON_LOOKUP = {
  oauth2: <ProdekoIcon size="25px" />,
  keycloak: <ProdekoIcon size="25px" />,
}
function authAvatar(service: string) {
  const icon = AUTH_ICON_LOOKUP[service] || null
  if (icon) {
    return (
      <Avatar
        icon={icon}
        size="large"
        style={{
          backgroundColor: "var(--primary-color)",
          verticalAlign: "sub",
        }}
      />
    )
  }
}

function UnlinkAccountButton({ id }: { id: string }) {
  const { t } = useTranslation("settings")
  const [, unlinkUserAuthentication] = useUnlinkUserAuthenticationMutation()
  const [modalOpen, setModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleOpenModal = useCallback(() => {
    setModalOpen(true)
  }, [setModalOpen])
  const handleCloseModal = useCallback(() => {
    setModalOpen(false)
  }, [setModalOpen])
  const handleUnlink = useCallback(async () => {
    setModalOpen(false)
    setDeleting(true)
    // urql resolves with an error instead of rejecting, so this is the
    // failure path that actually fires.
    const result = await unlinkUserAuthentication({ id })
    if (result.error) {
      setDeleting(false)
      message.error(t("pages.accounts.unlinkError"))
    }
  }, [id, t, unlinkUserAuthentication])

  return (
    <>
      <Modal
        open={modalOpen}
        title="Are you sure?"
        onCancel={handleCloseModal}
        onOk={handleUnlink}
      >
        {t("pages.accounts.unlinkAccountNotice")}
      </Modal>
      <a key="unlink" onClick={handleOpenModal}>
        {deleting ? <Spin /> : t("pages.accounts.unlink")}
      </a>
    </>
  )
}

function renderAuth(
  t: Translate,
  auth: Pick<UserAuthentication, "id" | "service" | "createdAt">
) {
  return (
    <List.Item
      key={auth.id}
      actions={[<UnlinkAccountButton key="unlink" id={auth.id} />]}
    >
      <List.Item.Meta
        avatar={authAvatar(auth.service)}
        description={`${t("common:added")} ${new Date(
          Date.parse(auth.createdAt)
        ).toLocaleString()}`}
        title={<Strong>{authName(auth.service)}</Strong>}
      />
    </List.Item>
  )
}

const Settings_Accounts: NextPage = () => {
  const [query] = useSharedQuery()
  const [{ data, fetching, error }] = useCurrentUserAuthenticationsQuery()
  const { t } = useTranslation("settings")
  const router = useRouter()
  // Set by /auth/keycloak when a link=1 request could not be verified as a
  // same-origin navigation; the flow was refused rather than silently
  // degraded to a plain login.
  const linkIntentFailed = router.query.linkError === "intent"

  const linkedAccounts =
    fetching || !data || !data.currentUser ? (
      <LoadingPadded />
    ) : (
      <List
        dataSource={data.currentUser.authentications}
        renderItem={(item) => renderAuth(t, item)}
        size="large"
        bordered
      />
    )

  return (
    <SettingsLayout href="/settings/accounts" query={query}>
      <PageHeader title={t("titles.accounts")} />
      {error && !fetching ? <ErrorAlert error={error} /> : linkedAccounts}
      {/* Without Keycloak configured the `/auth/keycloak` route is absent, so
          the link affordance would lead to a 404. */}
      {query.data?.ssoLoginEnabled ? (
        <Card
          style={{ marginTop: "2rem" }}
          title={t("pages.accounts.linkAnother")}
        >
          {linkIntentFailed && (
            <Alert
              data-cy="settingsaccounts-alert-linkintent"
              message={t("pages.accounts.linkIntentError")}
              style={{ marginBottom: 16 }}
              type="error"
            />
          )}
          <Button
            href={`/auth/keycloak?link=1&next=${encodeURIComponent(
              "/settings/accounts"
            )}`}
            icon={
              <ProdekoIcon size="20px" style={{ verticalAlign: "middle" }} />
            }
            type="primary"
          >
            {t("pages.accounts.linkProdekoId")}
          </Button>
        </Card>
      ) : null}
    </SettingsLayout>
  )
}

export default Settings_Accounts
