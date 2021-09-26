import { useCallback, useEffect, useMemo, useState } from "react"
import {
  OrganizationPage_OrganizationFragment,
  useDeleteOrganizationMutation,
  useUpdateOrganizationMutation,
} from "@app/graphql"
import { extractError, formItemLayout, tailFormItemLayout } from "@app/lib"
import { Alert, Button, Form, Input, message, Popconfirm } from "antd"
import Router, { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"

import { Redirect } from "./index"

interface UpdateOrganizationFormProps {
  organization: OrganizationPage_OrganizationFragment
}

export const UpdateOrganizationForm: React.FC<UpdateOrganizationFormProps> = ({
  organization,
}) => {
  const { id: organizationId, name, slug } = organization
  const initialValues = useMemo(
    () => ({
      slug,
      name,
    }),
    [name, slug]
  )

  const { t } = useTranslation("admin")
  const [form] = Form.useForm()
  const router = useRouter()
  const [error, setError] = useState<Error | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [, updateOrganization] = useUpdateOrganizationMutation()
  const [, deleteOrganization] = useDeleteOrganizationMutation()

  useEffect(() => {
    // Set form initialValues if they have changed after the initial rendering
    form.setFieldsValue(initialValues)
  }, [form, initialValues])

  const handleDelete = useCallback(async () => {
    try {
      setDeleting(true)
      await deleteOrganization({
        organizationId,
      })
      message.info(`Organization '${name}' successfully deleted`)
      router.push("/")
    } catch (e) {
      setError(e)
    }
    setDeleting(false)
  }, [deleteOrganization, organizationId, name, router])

  const handleSubmit = useCallback(
    async (values) => {
      try {
        setError(null)
        const { data } = await updateOrganization({
          input: {
            id: organizationId,
            patch: { slug: values.slug, name: values.name },
          },
        })
        message.success("Organization updated")
        const newSlug = data?.updateOrganization?.organization?.slug
        if (newSlug && newSlug !== slug) {
          Router.push(
            "/admin/organization/[slug]",
            `/admin/organization/${newSlug}`
          )
        }
      } catch (e) {
        setError(e)
      }
    },
    [organizationId, slug, updateOrganization]
  )

  if (!organization.currentUserIsOwner) {
    return (
      <Redirect
        as={`/admin/organization/${slug}`}
        href="/admin/organization/[slug]"
      />
    )
  }

  return (
    <Form
      {...formItemLayout}
      form={form}
      initialValues={initialValues}
      onFinish={handleSubmit}
    >
      <Form.Item
        label={t("organizations.forms.labels.name")}
        name="name"
        rules={[
          { required: true, message: "Organization name is required" },
          { min: 1, message: "Organization name must not be empty" },
        ]}
      >
        <Input />
      </Form.Item>
      <Form.Item
        label={t("organizations.forms.labels.slug")}
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
        <Button htmlType="submit">
          {t("organizations.updateOrganization")}
        </Button>
        <Popconfirm
          cancelText={t("common:no")}
          okText={t("common:yes")}
          title={t("organizations.deleteOrganizationConfirmText")}
          onConfirm={handleDelete}
        >
          <Button loading={deleting} style={{ marginLeft: 5 }} danger>
            {t("organizations.deleteOrganization")}
          </Button>
        </Popconfirm>
      </Form.Item>
    </Form>
  )
}
