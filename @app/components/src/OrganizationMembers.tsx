import { useCallback, useState } from "react"
import {
  OrganizationPage_MembershipFragment,
  OrganizationPage_OrganizationFragment,
  SharedLayout_UserFragment,
  useInviteToOrganizationMutation,
  useRemoveFromOrganizationMutation,
  useTransferOrganizationOwnershipMutation,
} from "@app/graphql"
import { formItemLayout, tailFormItemLayout } from "@app/lib"
import {
  Button,
  Card,
  Form,
  Input,
  List,
  message,
  Popconfirm,
  Typography,
} from "antd"

import { useTranslation } from "."

const { Text } = Typography

interface OrganizationMembersProps {
  currentUser?: SharedLayout_UserFragment | null
  organization: OrganizationPage_OrganizationFragment
  page: number
  setPage: (newPage: number) => void
}

export const ORGANIZATION_RESULTS_PER_PAGE = 10

export const OrganizationMembers: React.FC<OrganizationMembersProps> = (
  props
) => {
  const { organization, currentUser, page, setPage } = props

  const handlePaginationChange = (
    page: number
    //pageSize?: number | undefined
  ) => {
    setPage(page)
  }

  const renderItem = useCallback(
    (node: OrganizationPage_MembershipFragment) => (
      <OrganizationMemberListItem
        currentUser={currentUser}
        node={node}
        organization={organization}
      />
    ),
    [currentUser, organization]
  )

  const { t } = useTranslation("admin")
  const [, inviteToOrganization] = useInviteToOrganizationMutation()
  const [inviteInProgress, setInviteInProgress] = useState(false)
  const [form] = Form.useForm()
  const handleInviteSubmit = useCallback(
    async (values) => {
      if (inviteInProgress) {
        return
      }
      const { inviteText } = values
      setInviteInProgress(true)
      const isEmail = inviteText.includes("@")
      try {
        await inviteToOrganization({
          organizationId: organization.id,
          email: isEmail ? inviteText : null,
          username: isEmail ? null : inviteText,
        })
        message.success(`'${inviteText}' invited.`)
        form.setFieldsValue({ inviteText: "" })
      } catch (e) {
        // TODO: handle this through the interface
        message.error(
          `${t("organizations.couldNotInvite")}: ` +
            e.message.replace(/^GraphQL Error:/i, "")
        )
      } finally {
        setInviteInProgress(false)
      }
    },
    [form, inviteInProgress, inviteToOrganization, organization.id, t]
  )

  return (
    <>
      <Card title={t("organizations.inviteNewMember")}>
        <Form {...formItemLayout} form={form} onFinish={handleInviteSubmit}>
          <Form.Item
            label={t("organizations.usernameOrEmail")}
            name="inviteText"
          >
            <Input
              disabled={inviteInProgress}
              placeholder={t("organizations.enterEmailOrUsername")}
            />
          </Form.Item>
          <Form.Item {...tailFormItemLayout}>
            <Button disabled={inviteInProgress} htmlType="submit">
              {t("common:invite")}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <List
        dataSource={organization.organizationMemberships?.nodes ?? []}
        header={
          <Typography.Text style={{ fontSize: "16px" }} strong>
            {t("organizations.existingMembers")}
          </Typography.Text>
        }
        pagination={{
          current: page,
          pageSize: ORGANIZATION_RESULTS_PER_PAGE,
          total: organization.organizationMemberships?.totalCount,
          onChange: handlePaginationChange,
        }}
        renderItem={renderItem}
        size="large"
        style={{ marginTop: "2rem", borderColor: "#f0f0f0" }}
        bordered
      />
    </>
  )
}

interface OrganizationMemberListItemProps {
  node: OrganizationPage_MembershipFragment
  organization: OrganizationPage_OrganizationFragment
  currentUser?: SharedLayout_UserFragment | null
}

const OrganizationMemberListItem: React.FC<OrganizationMemberListItemProps> = (
  props
) => {
  const { node, organization, currentUser } = props

  const { t } = useTranslation("admin")
  const [, removeMember] = useRemoveFromOrganizationMutation()
  const handleRemove = useCallback(async () => {
    try {
      await removeMember({
        organizationId: organization.id,
        userId: node.user?.id ?? 0,
      })
    } catch (e) {
      message.error(t("organizations.errors.remove") + e.message)
    }
  }, [node.user, organization.id, removeMember, t])

  const [, transferOwnership] = useTransferOrganizationOwnershipMutation()
  const handleTransfer = useCallback(async () => {
    try {
      await transferOwnership({
        organizationId: organization.id,
        userId: node.user?.id ?? 0,
      })
    } catch (e) {
      message.error(t("organizations.errors.transfer") + e.message)
    }
  }, [node.user, organization.id, transferOwnership, t])

  const roles = [node.isOwner ? "owner" : null].filter(Boolean).join(" and ")
  return (
    <List.Item
      actions={[
        organization.currentUserIsOwner &&
          node.user?.id !== currentUser?.id && (
            <Popconfirm
              key="remove"
              cancelText={t("common:no")}
              okText={t("common:yes")}
              title={t("organizations.confirmDelete", {
                organizationName: organization.name,
                username: node.user?.name as string,
              })}
              onConfirm={handleRemove}
            >
              <a>{t("common:remove")}</a>
            </Popconfirm>
          ),
        organization.currentUserIsOwner &&
          node.user?.id !== currentUser?.id && (
            <Popconfirm
              key="transfer"
              cancelText={t("common:no")}
              okText={t("common:yes")}
              title={t("organizations.confirmTransfer", {
                organizationName: organization.name,
                username: node.user?.name as string,
              })}
              onConfirm={handleTransfer}
            >
              <a>{t("organizations.makeOwner")}</a>
            </Popconfirm>
          ),
      ].filter(Boolean)}
    >
      <List.Item.Meta
        description={
          <div>
            <Text>{node.user?.username}</Text>
            {roles && (
              <div>
                <Text type="secondary">({roles})</Text>
              </div>
            )}
          </div>
        }
        title={node.user?.name}
      />
    </List.Item>
  )
}
