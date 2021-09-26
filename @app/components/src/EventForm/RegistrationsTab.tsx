import { useCallback, useState } from "react"
import {
  EventPage_QuestionFragment,
  ListEventRegistrationsDocument,
  Registration,
  useAdminDeleteRegistrationMutation,
  useAdminUpdateRegistrationMutation,
} from "@app/graphql"
import { filterObjectByKeys, Sorter } from "@app/lib"
import { Button, Col, message, Popconfirm, Row, Typography } from "antd"
import Modal, { ModalProps } from "antd/lib/modal"
import dayjs from "dayjs"
import useTranslation from "next-translate/useTranslation"

import {
  ErrorAlert,
  EventRegistrationAnswersPopover,
  EventRegistrationForm,
  ServerPaginatedTable,
  useIsMobile,
} from "../."

const { Text } = Typography

interface UpdateRegistrationModalProps extends ModalProps {
  registration: Registration
  questions: EventPage_QuestionFragment[] | undefined
  updateToken: string
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>
}

function constructInitialValues(values: any) {
  return filterObjectByKeys(values, ["firstName", "lastName", "answers"])
}

const UpdateRegistrationModal: React.FC<UpdateRegistrationModalProps> = ({
  registration,
  questions,
  updateToken,
  setShowModal,
  ...rest
}) => {
  return (
    <Modal
      destroyOnClose
      {...rest}
      footer={null}
      width={800}
      onCancel={() => setShowModal(false)}
    >
      <EventRegistrationForm
        initialValues={constructInitialValues(registration)}
        questions={questions!}
        submitAction={() => setShowModal(false)}
        type="update"
        updateToken={updateToken}
        isAdmin
      />
    </Modal>
  )
}

interface RegistrationsTableActionsProps {
  registration: Registration
  questions: EventPage_QuestionFragment[] | undefined
}

export const RegistrationsTableActions: React.FC<RegistrationsTableActionsProps> =
  (props) => {
    const { registration } = props
    const { t } = useTranslation("admin")
    const [showModal, setShowModal] = useState(false)
    const [updateToken, setUpdateToken] = useState<string | undefined>(
      undefined
    )
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
          throw new Error(t("register:deleteRegistrationFailed"))
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
        <Row gutter={[8, 8]}>
          <Col flex="1 1 50%">
            <Button
              data-cy="admin-table-update-button"
              style={{ minWidth: "85px" }}
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
                style={{ minWidth: "85px" }}
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
          <UpdateRegistrationModal
            setShowModal={setShowModal}
            visible={showModal}
            {...props}
            updateToken={updateToken!}
          />
        ) : null}
      </>
    )
  }

interface RegistrationsTabProps {
  eventId: string
  questions: EventPage_QuestionFragment[] | undefined
}

export const RegistrationsTab: React.FC<RegistrationsTabProps> = ({
  eventId,
  questions,
}) => {
  const { t } = useTranslation("events")
  const isMobile = useIsMobile()

  const commonColumns = [
    {
      title: "",
      key: "actions",
      ellipsis: true,
      render: (_value: string, row: Registration) => (
        <RegistrationsTableActions questions={questions} registration={row} />
      ),
    },
    {
      title: t("common:name"),
      dataIndex: ["fullName"],
      key: "fullName",
      ellipsis: true,
      sorter: {
        compare: Sorter.TEXT,
      },
    },
  ]

  const columns = !isMobile
    ? [
        ...commonColumns,
        {
          title: t("events:queued"),
          dataIndex: ["status"],
          key: "status",
          ellipsis: true,
          render: (value: string) => {
            return value ? (
              <Text type="danger">{t("common:yes")}</Text>
            ) : (
              <Text type="success">{t("common:no")}</Text>
            )
          },
        },
        {
          title: t("common:answers"),
          dataIndex: ["answers"],
          key: "answers",
          ellipsis: true,
          render: (_value: string, row: Registration) => (
            <EventRegistrationAnswersPopover
              questions={questions}
              registration={row}
            />
          ),
        },
        {
          title: t("common:createdAt"),
          dataIndex: ["createdAt"],
          key: "createdAt",
          ellipsis: true,
          render: (value: string) => dayjs(value).format("l LT ss.SSS"),
        },
        {
          title: t("common:updatedAt"),
          dataIndex: ["updatedAt"],
          key: "updatedAt",
          ellipsis: true,
          render: (value: string, row: Registration) =>
            value !== row.createdAt
              ? dayjs(value).format("l LT ss.SSS")
              : t("common:no"),
        },
      ]
    : commonColumns

  if (!eventId) return null

  return (
    <ServerPaginatedTable
      columns={columns}
      data-cy="eventform-tab-registrations-table"
      dataField="registrations"
      queryDocument={ListEventRegistrationsDocument}
      showPagination={true}
      variables={{ eventId }}
    />
  )
}
