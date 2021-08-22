import { useCallback, useState } from "react"
import {
  ErrorAlert,
  ProdekoIcon,
  SettingsLayout,
  SocialLoginOptions,
  SpinPadded,
  Strong,
} from "@app/components"
import {
  useCurrentUserAuthenticationsQuery,
  UserAuthentication,
  useSharedQuery,
  useUnlinkUserAuthenticationMutation,
} from "@app/graphql"
import { Avatar, Card, List, Modal, PageHeader, Spin } from "antd"
import { NextPage } from "next"

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
          backgroundColor: "var(--primary-color)",
          verticalAlign: "sub",
        }}
      />
    )
  }
}

function UnlinkAccountButton({ id }: { id: string }) {
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
        title="Are you sure?"
        visible={modalOpen}
        onCancel={handleCloseModal}
        onOk={handleUnlink}
      >
        If you unlink this account you won't be able to log in with it any more;
        please make sure your email is valid.
      </Modal>
      <a key="unlink" onClick={handleOpenModal}>
        {deleting ? <Spin /> : "Unlink"}
      </a>
    </>
  )
}

function renderAuth(
  auth: Pick<UserAuthentication, "id" | "service" | "createdAt">
) {
  return (
    <List.Item
      key={auth.id}
      actions={[<UnlinkAccountButton key="unlink" id={auth.id} />]}
    >
      <List.Item.Meta
        avatar={authAvatar(auth.service)}
        description={`Added ${new Date(
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

  const linkedAccounts =
    fetching || !data || !data.currentUser ? (
      <SpinPadded />
    ) : (
      <List
        dataSource={data.currentUser.authentications}
        renderItem={renderAuth}
        size="large"
        bordered
      />
    )

  return (
    <SettingsLayout href="/settings/accounts" query={query}>
      <PageHeader title="Linked accounts" />
      {error && !fetching ? <ErrorAlert error={error} /> : linkedAccounts}
      <Card style={{ marginTop: "2rem" }} title="Link another account">
        <SocialLoginOptions
          buttonTextFromService={(service) => `Link ${service} account`}
          next="/settings/accounts"
        />
      </Card>
    </SettingsLayout>
  )
}

export default Settings_Accounts
