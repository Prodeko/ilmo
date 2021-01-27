import React from "react";
import {
  AuthRestrict,
  ButtonLink,
  SharedLayout,
  useOrganizationLoading,
  useOrganizationSlug,
} from "@app/components";
import {
  OrganizationPage_OrganizationFragment,
  useOrganizationPageQuery,
} from "@app/graphql";
import { Col, Empty, PageHeader, Row } from "antd";
import { NextPage } from "next";

const OrganizationPage: NextPage = () => {
  const slug = useOrganizationSlug();
  const query = useOrganizationPageQuery({ variables: { slug } });
  const organizationLoadingElement = useOrganizationLoading(query);
  const organization = query?.data?.organizationBySlug;

  return (
    <SharedLayout
      title={`${organization?.name ?? slug}`}
      titleHref={`/o/[slug]`}
      titleHrefAs={`/o/${slug}`}
      forbidWhen={AuthRestrict.LOGGED_OUT}
      query={query}
    >
      {organizationLoadingElement || (
        <OrganizationPageInner organization={organization!} />
      )}
    </SharedLayout>
  );
};

interface OrganizationPageInnerProps {
  organization: OrganizationPage_OrganizationFragment;
}

const OrganizationPageInner: React.FC<OrganizationPageInnerProps> = (props) => {
  const { organization } = props;

  return (
    <Row>
      <Col flex={1}>
        <div>
          <PageHeader
            title={"Dashboard"}
            extra={
              organization.currentUserIsOwner && [
                <ButtonLink
                  key="settings"
                  href={`/o/[slug]/settings`}
                  as={`/o/${organization.slug}/settings`}
                  type="primary"
                  data-cy="organizationpage-button-settings"
                >
                  Settings
                </ButtonLink>,
              ]
            }
          />
          <Empty
            description={
              <span>
                Customize this page in
                <br />
                <code>@app/client/src/pages/o/[slug]/index.tsx</code>
              </span>
            }
          />
        </div>
      </Col>
    </Row>
  );
};

export default OrganizationPage;
