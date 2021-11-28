import { useCallback, useState } from "react"
import {
  EventPage_QuestionFragment,
  Registration,
  useAdminDeleteRegistrationMutation,
  useAdminUpdateRegistrationMutation,
} from "@app/graphql"
import { Button, Col, message, Popconfirm, Row } from "antd"

import { ErrorAlert, useTranslation } from ".."

import { RegistrationUpdateModal } from "./RegistrationUpdateModal"

interface RegistrationsTableActionsProps {
  registration: Registration
  questions: EventPage_QuestionFragment[] | undefined
}

export const RegistrationsTableActions: React.FC<
  RegistrationsTableActionsProps
> = (props) => {
  const { registration } = props
  const { t } = useTranslation("admin")
  const [showModal, setShowModal] = useState(false)
  const [updateToken, setUpdateToken] = useState<string | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)
  const [, updateRegistration] = useAdminUpdateRegistrationMutation()
  const [, deleteRegistration] = useAdminDeleteRegistrationMutation()

  const doDelete = useCallback(async () => {
    try {
      const { data, error } = await deleteRegistration({
        input: { id: registration.id },
      })
      if (error) throw error
      if (!data?.adminDeleteRegistration?.success) {
        throw new Error(t("register_event:deleteRegistrationFailed"))
      }
      message.info(t("notifications.deleteSuccess"))
    } catch (e) {
      setError(e)
    }
  }, [registration, deleteRegistration, t])

  const doUpdate = useCallback(async () => {
    try {
      const { data, error } = await updateRegistration({
        input: { id: registration.id },
      })
      if (error) throw error
      setUpdateToken(data?.adminUpdateRegistration?.updateToken!)
      setShowModal(true)
    } catch (e) {
      setError(e)
    }
  }, [registration, updateRegistration])

  return (
    <>
      <Row gutter={[8, 8]} wrap>
        <Col flex="1 1 50%">
          <Button
            data-cy="admin-table-update-button"
            size="small"
            style={{ width: "65px" }}
            type="primary"
            onClick={doUpdate}
          >
            {t("common:update")}
          </Button>
        </Col>
        <Col flex="1 1 50%">
          <Popconfirm
            cancelText={t("common:no")}
            okText={t("common:yes")}
            placement="top"
            title={t("registrations.delete.confirmText")}
            onConfirm={doDelete}
          >
            <Button
              data-cy="admin-table-delete-button"
              size="small"
              style={{ minWidth: "65px" }}
              danger
            >
              {t("common:delete")}
            </Button>
          </Popconfirm>
        </Col>
      </Row>
      {error ? (
        <ErrorAlert
          error={error}
          message={t("registrations.delete.deleteFailed")}
          setError={setError}
          banner
        />
      ) : null}
      {showModal ? (
        <RegistrationUpdateModal
          setShowModal={setShowModal}
          updateToken={updateToken!}
          visible={showModal}
          {...props}
        />
      ) : null}
    </>
  )
}
