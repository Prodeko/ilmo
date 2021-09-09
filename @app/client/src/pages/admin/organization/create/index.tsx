import { useCallback, useEffect, useMemo, useState } from "react"
import { AdminLayout, Loading, Redirect } from "@app/components"
import {
  useCreateOrganizationMutation,
  useOrganizationBySlugQuery,
  useSharedQuery,
} from "@app/graphql"
import {
  extractError,
  formItemLayout,
  getCodeFromError,
  tailFormItemLayout,
} from "@app/lib"
import { Alert, Button, Col, Form, Input, PageHeader, Row } from "antd"
import { useForm } from "antd/lib/form/Form"
import Text from "antd/lib/typography/Text"
import { debounce } from "lodash"
import { NextPage } from "next"
import useTranslation from "next-translate/useTranslation"
import { Store } from "rc-field-form/lib/interface"
import slugify from "slugify"

const Admin_CreateOrganization: NextPage = () => {
  const [query] = useSharedQuery()
  const { t } = useTranslation("admin")
  const [form] = useForm()
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

  const [{ data, error }, createOrganization] = useCreateOrganizationMutation()
  const organization = data?.createOrganization?.organization || null
  const code = getCodeFromError(error)

  const handleSubmit = useCallback(
    async (values: Store) => {
      const { name } = values
      const slug = slugify(name || "", {
        lower: true,
      })
      await createOrganization({
        name,
        slug,
      })
    },
    [createOrganization]
  )

  const handleValuesChange = useCallback((values: Store) => {
    if ("name" in values) {
      setSlug(
        slugify(values.name, {
          lower: true,
        })
      )
    }
  }, [])

  if (organization) {
    return (
      <Redirect
        as={`/admin/organization/${organization.slug}`}
        href={`/admin/organization/[slug]`}
        layout
      />
    )
  }

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
                  message: "Please choose a name for the organization",
                },
              ]}
            >
              <div>
                <Input data-cy="createorganization-input-name" />
                <p>
                  {t("admin:organizations.create.urlWillBe")}{" "}
                  <span data-cy="createorganization-slug-value">{`${process.env.ROOT_URL}/admin/organization/${slug}`}</span>
                </p>
                {!slug ? null : fetchingSlug ? (
                  <div>
                    <Loading /> {t("admin:organizations.create.checkingName")}
                  </div>
                ) : existingOrganizationData?.organizationBySlug ? (
                  <Text
                    data-cy="createorganization-hint-nameinuse"
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
            {error && (
              <Form.Item {...tailFormItemLayout}>
                <Alert
                  description={
                    <span>
                      {code === "NUNIQ" ? (
                        <span data-cy="createorganization-alert-nuniq">
                          {t("admin:organizations.create.errorNameInUse")}{" "}
                        </span>
                      ) : (
                        extractError(error).message
                      )}
                      {code && (
                        <span>
                          (Error code: <code>ERR_{code}</code>)
                        </span>
                      )}
                    </span>
                  }
                  message="Creating organization failed"
                  type="error"
                />
              </Form.Item>
            )}
            <Form.Item {...tailFormItemLayout}>
              <Button
                data-cy="createorganization-button-create"
                htmlType="submit"
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
