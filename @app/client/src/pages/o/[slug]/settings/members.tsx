import React, { useCallback, useState } from "react";
import {
  AuthRestrict,
  OrganizationSettingsLayout,
  Redirect,
  SharedLayout,
  useOrganizationLoading,
  useOrganizationSlug,
} from "@app/components";
import {
  OrganizationMembers_MembershipFragment,
  OrganizationMembers_OrganizationFragment,
  SharedLayout_UserFragment,
  useInviteToOrganizationMutation,
  useOrganizationMembersQuery,
  useRemoveFromOrganizationMutation,
  useTransferOrganizationOwnershipMutation,
} from "@app/graphql";
import { formItemLayout, tailFormItemLayout } from "@app/lib";
import * as Sentry from "@sentry/react";
import {
  Button,
  Card,
  Form,
  Input,
  List,
  message,
  PageHeader,
  Popconfirm,
  Typography,
} from "antd";
import Text from "antd/lib/typography/Text";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { Store } from "rc-field-form/lib/interface";

const OrganizationSettingsPage: NextPage = () => {
  const slug = useOrganizationSlug();
  const [page, setPage] = useState(1);
  const query = useOrganizationMembersQuery({
    variables: {
      slug,
      offset: (page - 1) * RESULTS_PER_PAGE,
    },
  });
  const organizationLoadingElement = useOrganizationLoading(query);
  const organization = query?.data?.organizationBySlug;

  return (
    <SharedLayout
      forbidWhen={AuthRestrict.LOGGED_OUT}
      query={query}
      title={organization?.name ?? slug}
      titleHref={`/o/[slug]`}
      titleHrefAs={`/o/${slug}`}
      noPad
    >
      {({ currentUser }) =>
        organizationLoadingElement || (
          <OrganizationSettingsPageInner
            currentUser={currentUser}
            organization={organization!}
            page={page}
            setPage={setPage}
          />
        )
      }
    </SharedLayout>
  );
};

interface OrganizationSettingsPageInnerProps {
  currentUser?: SharedLayout_UserFragment | null;
  organization: OrganizationMembers_OrganizationFragment;
  page: number;
  setPage: (newPage: number) => void;
}

// This needs to match the `first:` used in OrganizationMembers.graphql
const RESULTS_PER_PAGE = 10;

const OrganizationSettingsPageInner: React.FC<OrganizationSettingsPageInnerProps> = (
  props
) => {
  const { organization, currentUser, page, setPage } = props;
  const router = useRouter();

  const handlePaginationChange = (
    page: number
    //pageSize?: number | undefined
  ) => {
    setPage(page);
  };

  const renderItem = useCallback(
    (node: OrganizationMembers_MembershipFragment) => (
      <OrganizationMemberListItem
        currentUser={currentUser}
        node={node}
        organization={organization}
      />
    ),
    [currentUser, organization]
  );

  const [inviteToOrganization] = useInviteToOrganizationMutation();
  const [inviteInProgress, setInviteInProgress] = useState(false);
  const [form] = Form.useForm();
  const handleInviteSubmit = useCallback(
    async (values: Store) => {
      if (inviteInProgress) {
        return;
      }
      const { inviteText } = values;
      setInviteInProgress(true);
      const isEmail = inviteText.includes("@");
      try {
        await inviteToOrganization({
          variables: {
            organizationId: organization.id,
            email: isEmail ? inviteText : null,
            username: isEmail ? null : inviteText,
          },
        });
        message.success(`'${inviteText}' invited.`);
        form.setFieldsValue({ inviteText: "" });
      } catch (e) {
        // TODO: handle this through the interface
        message.error(
          "Could not invite to organization: " +
            e.message.replace(/^GraphQL Error:/i, "")
        );
        Sentry.captureException(e);
      } finally {
        setInviteInProgress(false);
      }
    },
    [form, inviteInProgress, inviteToOrganization, organization.id]
  );

  if (!organization.currentUserIsOwner) {
    return <Redirect as={`/o/${organization.slug}`} href="/o/[slug]" />;
  }

  return (
    <OrganizationSettingsLayout href={router.route} organization={organization}>
      <div>
        <PageHeader title="Members" />
        <Card title="Invite new member">
          <Form {...formItemLayout} form={form} onFinish={handleInviteSubmit}>
            <Form.Item label="Username or email" name="inviteText">
              <Input
                disabled={inviteInProgress}
                placeholder="Enter username or email"
              />
            </Form.Item>
            <Form.Item {...tailFormItemLayout}>
              <Button disabled={inviteInProgress} htmlType="submit">
                Invite
              </Button>
            </Form.Item>
          </Form>
        </Card>
        <List
          dataSource={organization.organizationMemberships?.nodes ?? []}
          header={
            <Typography.Text style={{ fontSize: "16px" }} strong>
              Existing members
            </Typography.Text>
          }
          pagination={{
            current: page,
            pageSize: RESULTS_PER_PAGE,
            total: organization.organizationMemberships?.totalCount,
            onChange: handlePaginationChange,
          }}
          renderItem={renderItem}
          size="large"
          style={{ marginTop: "2rem", borderColor: "#f0f0f0" }}
          bordered
        />
      </div>
    </OrganizationSettingsLayout>
  );
};

interface OrganizationMemberListItemProps {
  node: OrganizationMembers_MembershipFragment;
  organization: OrganizationMembers_OrganizationFragment;
  currentUser?: SharedLayout_UserFragment | null;
}

const OrganizationMemberListItem: React.FC<OrganizationMemberListItemProps> = (
  props
) => {
  const { node, organization, currentUser } = props;

  const [removeMember] = useRemoveFromOrganizationMutation();
  const handleRemove = useCallback(async () => {
    try {
      await removeMember({
        variables: {
          organizationId: organization.id,
          userId: node.user?.id ?? 0,
        },
        refetchQueries: ["OrganizationMembers"],
      });
    } catch (e) {
      message.error("Error occurred when removing member: " + e.message);
      Sentry.captureException(e);
    }
  }, [node.user, organization.id, removeMember]);

  const [transferOwnership] = useTransferOrganizationOwnershipMutation();
  const handleTransfer = useCallback(async () => {
    try {
      await transferOwnership({
        variables: {
          organizationId: organization.id,
          userId: node.user?.id ?? 0,
        },
        refetchQueries: ["OrganizationMembers"],
      });
    } catch (e) {
      message.error("Error occurred when transferring ownership: " + e.message);
      Sentry.captureException(e);
    }
  }, [node.user, organization.id, transferOwnership]);

  const roles = [node.isOwner ? "owner" : null].filter(Boolean).join(" and ");
  return (
    <List.Item
      actions={[
        organization.currentUserIsOwner && node.user?.id !== currentUser?.id && (
          <Popconfirm
            key="remove"
            cancelText="No"
            okText="Yes"
            title={`Are you sure you want to remove ${node.user?.name} from ${organization.name}?`}
            onConfirm={handleRemove}
          >
            <a>Remove</a>
          </Popconfirm>
        ),
        organization.currentUserIsOwner && node.user?.id !== currentUser?.id && (
          <Popconfirm
            key="transfer"
            cancelText="No"
            okText="Yes"
            title={`Are you sure you want to transfer ownership of ${organization.name} to ${node.user?.name}?`}
            onConfirm={handleTransfer}
          >
            <a>Make owner</a>
          </Popconfirm>
        ),
      ].filter(Boolean)}
    >
      <List.Item.Meta
        //avatar={...}
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
  );
};

export default OrganizationSettingsPage;
