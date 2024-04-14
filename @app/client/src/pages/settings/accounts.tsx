import { useCallback, useState } from "react"
import { PageHeader } from "@ant-design/pro-layout"
import {
  ErrorAlert,
  LoadingPadded,
  ProdekoIcon,
  SettingsLayout,
  SocialLoginOptions,
  Strong,
  useTranslation,
} from "@app/components"
import {
  useCurrentUserAuthenticationsQuery,
  UserAuthentication,
  useSharedQuery,
  useUnlinkUserAuthenticationMutation,
} from "@app/graphql"
import { Avatar, Card, List, Modal, Spin } from "antd"
import { Translate } from "next-translate"

import type { NextPage } from "next"

const AUTH_NAME_LOOKUP = {
  // Could add more login options in the future
  // github: "GitHub",
  // facebook: "Facebook",
  // twitter: "Twitter",
  oauth2: "Prodeko",
}
function authName(service: string) {
  return AUTH_NAME_LOOKUP[service] || service
}

const AUTH_ICON_LOOKUP = {
  oauth2: <ProdekoIcon size="25px" />,
}
function authAvatar(service: string) {
  const icon = AUTH_ICON_LOOKUP[service] || null
  if (icon) {
    return (
      <Avatar
        icon={icon}
        size="large"
        style={{
          backgroundColor: "#002e7d",
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
    try {
      await unlinkUserAuthentication({ id })
    } catch (e) {
      setDeleting(false)
    }
  }, [id, unlinkUserAuthentication])

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
      <Card
        style={{ marginTop: "2rem" }}
        title={t("pages.accounts.linkAnother")}
      >
        <SocialLoginOptions
          buttonTextFromService={(service) =>
            t("pages.accounts.linkAccount", { service })
          }
          next="/settings/accounts"
        />
      </Card>
    </SettingsLayout>
  )
}

export default Settings_Accounts
