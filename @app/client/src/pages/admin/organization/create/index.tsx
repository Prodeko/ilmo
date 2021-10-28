import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AdminLayout,
  ColorPicker,
  ErrorAlert,
  Loading,
  useTranslation,
} from "@app/components"
import {
  useCreateOrganizationMutation,
  useOrganizationBySlugQuery,
  useSharedQuery,
} from "@app/graphql"
import {
  formItemLayout,
  getCodeFromError,
  primaryColor,
  tailFormItemLayout,
} from "@app/lib"
import { Button, Col, Form, Input, PageHeader, Row, Typography } from "antd"
import debounce from "lodash/debounce"
import { useRouter } from "next/router"
import slugify from "slugify"

import type { NextPage } from "next"

const { Text } = Typography

const Admin_CreateOrganization: NextPage = () => {
  const router = useRouter()
  const [query] = useSharedQuery()
  const { t } = useTranslation("admin")
  const [form] = Form.useForm()
  const [slug, setSlug] = useState("")
  const [pauseQuery, setPauseQuery] = useState(true)
  const [
    {
      data: existingOrganizationData,
      fetching: fetchingSlug,
      error: slugError,
    },
  ] = useOrganizationBySlugQuery({ pause: pauseQuery, variables: { slug } })

  const checkSlug = useMemo(
    () =>
      debounce((slug: string) => {
        if (slug) {
          setSlug(slug)
          setPauseQuery(false)
        }
      }, 500),
    []
  )

  useEffect(() => {
    checkSlug(slug)
    setPauseQuery(true)
  }, [checkSlug, slug])

  const [, createOrganization] = useCreateOrganizationMutation()
  const [error, setError] = useState<Error | null>(null)
  const code = getCodeFromError(error)

  const handleSubmit = useCallback(
    async (values) => {
      const { name, color } = values
      const slug = slugify(name || "", {
        lower: true,
      })
      const { data, error } = await createOrganization({
        name,
        slug,
        color,
      })
      const organization = data?.createOrganization?.organization || null
      if (error) {
        setError(error)
      } else {
        router.push(
          "/admin/organization/[slug]",
          `/admin/organization/${organization.slug}`
        )
      }
    },
    [createOrganization, router]
  )

  const handleValuesChange = useCallback((values) => {
    if ("name" in values) {
      setSlug(
        slugify(values.name, {
          lower: true,
        })
      )
    }
  }, [])

  return (
    <AdminLayout href="/admin/organization/create" query={query}>
      <Row>
        <Col flex={1}>
          <PageHeader title={t("pageTitle.createOrganization")} />
          <Form
            {...formItemLayout}
            form={form}
            onFinish={handleSubmit}
            onValuesChange={handleValuesChange}
          >
            <Form.Item
              label={t("common:name")}
              name="name"
              rules={[
                {
                  required: true,
                  message: t("organizations.forms.messages.nameNotEmpty"),
                },
              ]}
            >
              <div>
                <Input data-cy="createorganization-input-name" />
                <Text>
                  {t("admin:organizations.create.urlWillBe")}{" "}
                  <span data-cy="createorganization-slug-value">{`${process.env.ROOT_URL}/admin/organization/${slug}`}</span>
                </Text>
                {!slug ? null : fetchingSlug ? (
                  <div>
                    <Loading /> {t("admin:organizations.create.checkingName")}
                  </div>
                ) : existingOrganizationData?.organizationBySlug ? (
                  <Text
                    data-cy="createorganization-hint-nameinuse"
                    style={{ display: "block" }}
                    type="danger"
                  >
                    {t("admin:organizations.create.nameInUse")}
                  </Text>
                ) : slugError ? (
                  <Text type="warning">
                    {t("admin:organizations.create.errorOccurred")} (error code:
                    ERR_{getCodeFromError(slugError)})
                  </Text>
                ) : null}
              </div>
            </Form.Item>
            <Form.Item
              initialValue={primaryColor}
              label={t("common:color")}
              name="color"
            >
              <ColorPicker data-cy="createorganization-color" />
            </Form.Item>
            {error && (
              <Form.Item {...tailFormItemLayout}>
                <ErrorAlert
                  data-cy="createorganization-alert-nuniq"
                  error={error}
                  message={
                    code === "NUNIQ"
                      ? t("organizations.create.errorNameInUse")
                      : t("organizations.errors.organizationCreateFailed")
                  }
                />
              </Form.Item>
            )}
            <Form.Item {...tailFormItemLayout}>
              <Button
                data-cy="createorganization-button-create"
                htmlType="submit"
                style={{ marginTop: 12 }}
              >
                {t("common:create")}
              </Button>
            </Form.Item>
          </Form>
        </Col>
      </Row>
    </AdminLayout>
  )
}

export default Admin_CreateOrganization
