import { useCallback, useEffect, useRef, useState } from "react"
import { UserOutlined } from "@ant-design/icons"
import { AuthRestrict, ErrorAlert, SharedLayout } from "@app/components"
import { useForgotPasswordMutation, useSharedQuery } from "@app/graphql"
import { Alert, Button, Col, Form, Input, Row } from "antd"
import { NextPage } from "next"
import Link from "next/link"

const ForgotPassword: NextPage = () => {
  const [query] = useSharedQuery()

  const [form] = Form.useForm()
  const [{ error }, forgotPassword] = useForgotPasswordMutation()
  const [successfulEmail, setSuccessfulEmail] = useState<string | null>(null)

  const handleSubmit = useCallback(
    (values): void => {
      ;(async () => {
        try {
          const email = values.email
          const { error } = await forgotPassword({
            email,
          })
          if (error) throw error
          setSuccessfulEmail(email)
        } catch (e) {
          console.error(e)
        }
      })()
    },
    [forgotPassword]
  )

  const focusElement = useRef<Input>(null)
  useEffect(
    () => void (focusElement.current && focusElement.current!.focus()),
    [focusElement]
  )

  if (successfulEmail != null) {
    return (
      <SharedLayout query={query} title="Forgot Password">
        <Alert
          description={`We've sent an email reset link to '${successfulEmail}'; click the link and follow the instructions. If you don't receive the link, please ensure you entered the email address correctly, and check in your spam folder just in case.`}
          message="You've got mail"
          type="success"
        />
      </SharedLayout>
    )
  }

  return (
    <SharedLayout
      forbidWhen={AuthRestrict.LOGGED_IN}
      query={query}
      title="Forgot Password"
    >
      <Row justify="center" style={{ marginTop: 32 }}>
        <Col sm={12} xs={24}>
          <Form
            form={form}
            layout="vertical"
            style={{ width: "100%" }}
            onFinish={handleSubmit}
          >
            <Form.Item
              name="email"
              rules={[
                {
                  type: "email",
                  message: "The input is not valid E-mail",
                },
                { required: true, message: "Please input your email" },
              ]}
            >
              <Input
                ref={focusElement}
                placeholder="Email"
                prefix={<UserOutlined style={{ color: "rgba(0,0,0,.25)" }} />}
              />
            </Form.Item>

            {error && (
              <Form.Item>
                <ErrorAlert error={error} message="Something went wrong" />
              </Form.Item>
            )}
            <Form.Item>
              <Button htmlType="submit" type="primary">
                Reset password
              </Button>
            </Form.Item>
            <Form.Item>
              <p>
                <Link href="/login">
                  <a>Remembered your password? Log in.</a>
                </Link>
              </p>
            </Form.Item>
          </Form>
        </Col>
      </Row>
    </SharedLayout>
  )
}

export default ForgotPassword
