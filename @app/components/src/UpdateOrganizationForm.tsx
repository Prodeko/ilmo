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
      message.info(t("organizations.messages.deleteSuccess", { name }))
      router.push("/")
    } catch (e) {
      setError(e)
    }
    setDeleting(false)
  }, [deleteOrganization, organizationId, name, router, t])

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
        message.success(t("organizations.messages.updated"))
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
    [organizationId, slug, updateOrganization, t]
  )

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
          {
            required: true,
            message: t("organizations.forms.messages.nameRequired"),
          },
          { min: 1, message: t("organizations.forms.messages.nameNotEmpty") },
        ]}
      >
        <Input />
      </Form.Item>
      <Form.Item
        label={t("organizations.forms.labels.slug")}
        name="slug"
        rules={[
          {
            required: true,
            message: t("organizations.forms.messages.slugRequired"),
          },
          { min: 2, message: t("organizations.forms.messages.slugLength") },
        ]}
      >
        <Input />
      </Form.Item>
      {error && (
        <Form.Item>
          <Alert
            description={<span>{extractError(error).message}</span>}
            message={t("organizations.updatingOrganization")}
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
