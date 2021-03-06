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
  OrganizationPage_OrganizationFragment,
  useOrganizationPageQuery,
  useUpdateOrganizationMutation,
} from "@app/graphql";
import { extractError, formItemLayout, tailFormItemLayout } from "@app/lib";
import * as Sentry from "@sentry/react";
import { Alert, Button, Form, Input, message, PageHeader } from "antd";
import { useForm } from "antd/lib/form/Form";
import { NextPage } from "next";
import Router, { useRouter } from "next/router";
import { Store } from "rc-field-form/lib/interface";

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
      {organizationLoadingElement || (
        <OrganizationSettingsPageInner organization={organization!} />
      )}
    </SharedLayout>
  );
};

interface OrganizationSettingsPageInnerProps {
  organization: OrganizationPage_OrganizationFragment;
}

const OrganizationSettingsPageInner: React.FC<OrganizationSettingsPageInnerProps> = (
  props
) => {
  const { organization } = props;
  const { name, slug } = organization;
  const router = useRouter();

  const [form] = useForm();
  const [updateOrganization] = useUpdateOrganizationMutation();
  const [error, setError] = useState<Error | null>(null);
  const handleSubmit = useCallback(
    async (values: Store) => {
      try {
        setError(null);
        const { data } = await updateOrganization({
          variables: {
            input: {
              id: organization.id,
              patch: { slug: values.slug, name: values.name },
            },
          },
        });
        message.success("Organization updated");
        const newSlug = data?.updateOrganization?.organization?.slug;
        if (newSlug && newSlug !== organization.slug) {
          Router.push(`/o/[slug]/settings`, `/o/${newSlug}/settings`);
        }
      } catch (e) {
        setError(e);
        Sentry.captureException(e);
      }
    },
    [organization.id, organization.slug, updateOrganization]
  );

  if (!organization.currentUserIsOwner) {
    return <Redirect as={`/o/${organization.slug}`} href="/o/[slug]" />;
  }

  return (
    <OrganizationSettingsLayout href={router.route} organization={organization}>
      <div>
        <PageHeader title="Profile" />
        <Form
          {...formItemLayout}
          form={form}
          initialValues={{
            slug,
            name,
          }}
          onFinish={handleSubmit}
        >
          <Form.Item
            label="Organization name"
            name="name"
            rules={[
              { required: true, message: "Organization name is required" },
              { min: 1, message: "Organization name must not be empty" },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Slug"
            name="slug"
            rules={[
              { required: true, message: "Slug is required" },
              { min: 2, message: "Slug must be at least 2 characters long" },
            ]}
          >
            <Input />
          </Form.Item>
          {error && (
            <Form.Item>
              <Alert
                description={<span>{extractError(error).message}</span>}
                message={`Updating organization`}
                type="error"
              />
            </Form.Item>
          )}
          <Form.Item {...tailFormItemLayout}>
            <Button htmlType="submit">Update organization</Button>
          </Form.Item>
        </Form>
      </div>
    </OrganizationSettingsLayout>
  );
};

export default OrganizationSettingsPage;
