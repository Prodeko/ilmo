import React from "react";
import {
  AuthRestrict,
  ButtonLink,
  SharedLayout,
  useOrganizationLoading,
  useQuerySlug,
} from "@app/components";
import {
  OrganizationPage_OrganizationFragment,
  useOrganizationPageQuery,
} from "@app/graphql";
import { Col, Empty, PageHeader, Row } from "antd";
import { NextPage } from "next";

const OrganizationPage: NextPage = () => {
  const slug = useQuerySlug();
  const query = useOrganizationPageQuery({ variables: { slug } });
  const organizationLoadingElement = useOrganizationLoading(query);
  const organization = query?.data?.organizationBySlug;

  return (
    <SharedLayout
      forbidWhen={AuthRestrict.LOGGED_OUT}
      query={query}
      title={`${organization?.name ?? slug}`}
      titleHref={`/o/[slug]`}
      titleHrefAs={`/o/${slug}`}
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
            extra={
              organization.currentUserIsOwner && [
                <ButtonLink
                  key="settings"
                  as={`/o/${organization.slug}/settings`}
                  data-cy="organizationpage-button-settings"
                  href={`/o/[slug]/settings`}
                  type="primary"
                >
                  Settings
                </ButtonLink>,
              ]
            }
            title={"Dashboard"}
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
