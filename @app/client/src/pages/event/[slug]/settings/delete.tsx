import React, { useCallback, useState } from "react";
import { ApolloError } from "@apollo/client";
import {
  AuthRestrict,
  ErrorAlert,
  OrganizationSettingsLayout,
  P,
  SharedLayout,
  useOrganizationLoading,
  useOrganizationSlug,
} from "@app/components";
import {
  OrganizationPage_OrganizationFragment,
  SharedLayout_UserFragment,
  useDeleteOrganizationMutation,
  useOrganizationPageQuery,
} from "@app/graphql";
import * as Sentry from "@sentry/react";
import { Alert, Button, message, PageHeader, Popconfirm } from "antd";
import { NextPage } from "next";
import { useRouter } from "next/router";

const OrganizationSettingsPage: NextPage = () => {
  const slug = useOrganizationSlug();
  const query = useOrganizationPageQuery({ variables: { slug } });
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
          />
        )
      }
    </SharedLayout>
  );
};

interface OrganizationSettingsPageInnerProps {
  currentUser?: SharedLayout_UserFragment | null;
  organization: OrganizationPage_OrganizationFragment;
}

const OrganizationSettingsPageInner: React.FC<OrganizationSettingsPageInnerProps> = (
  props
) => {
  const { organization } = props;
  const router = useRouter();
  const [deleteOrganization] = useDeleteOrganizationMutation();
  const [error, setError] = useState<ApolloError | null>(null);
  const handleDelete = useCallback(async () => {
    try {
      await deleteOrganization({
        variables: {
          organizationId: organization.id,
        },
        refetchQueries: ["SharedLayout"],
      });
      message.info(`Organization '${organization.name}' successfully deleted`);
      router.push("/");
    } catch (e) {
      setError(e);
      Sentry.captureException(e);
      return;
    }
  }, [deleteOrganization, organization.id, organization.name, router]);
  return (
    <OrganizationSettingsLayout href={router.route} organization={organization}>
      <div>
        <PageHeader title="Delete Organization?" />
        {organization.currentUserIsOwner ? (
          <Alert
            description={
              <div>
                <P>This action cannot be undone, be very careful.</P>
                <Popconfirm
                  cancelText="No"
                  okText="Yes"
                  title={`Are you sure you want to delete ${organization.name}?`}
                  onConfirm={handleDelete}
                >
                  <Button>Delete this organization</Button>
                </Popconfirm>
              </div>
            }
            message={`Really delete '${organization.name}'`}
            type="error"
          />
        ) : (
          <Alert
            description="Only the owner may delete the organization. If you cannot reach the owner, please get in touch with support."
            message="You are not permitted to do this"
            type="warning"
          />
        )}
        {error && <ErrorAlert error={error} />}
      </div>
    </OrganizationSettingsLayout>
  );
};
export default OrganizationSettingsPage;
