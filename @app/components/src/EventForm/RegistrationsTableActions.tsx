import { useCallback, useState } from "react"
import {
  EventPage_QuestionFragment,
  Registration,
  RegistrationPaymentStatus,
  RegistrationStatus,
  useAdminDeleteRegistrationMutation,
  useAdminMarkRegistrationPaidMutation,
  useAdminUnmarkRegistrationPaidMutation,
  useAdminUpdateRegistrationMutation,
} from "@app/graphql"
import { formatEuro } from "@app/lib"
import {
  Alert,
  Button,
  Checkbox,
  Col,
  Dropdown,
  message,
  Modal,
  Popconfirm,
  Row,
  Typography,
} from "antd"

import { ErrorAlert, useTranslation } from ".."

import { RegistrationUpdateModal } from "./RegistrationUpdateModal"

import type { MenuProps } from "antd"

const { Paragraph, Text } = Typography

interface RegistrationsTableActionsProps {
  registration: Registration
  questions: EventPage_QuestionFragment[] | undefined
  // Show the payment actions: the "⋯" menu and the refund-aware delete dialog
  showPayments?: boolean
  // Called after a payment changed, so the payment summary can be refetched
  onPaymentChange?: () => void
}

export const RegistrationsTableActions: React.FC<
  RegistrationsTableActionsProps
> = (props) => {
  const { registration, showPayments = false, onPaymentChange } = props
  const { t } = useTranslation("admin")
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [refund, setRefund] = useState(true)
  const [updateToken, setUpdateToken] = useState<string | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [, updateRegistration] = useAdminUpdateRegistrationMutation()
  const [{ fetching: deleting }, deleteRegistration] =
    useAdminDeleteRegistrationMutation()
  const [{ fetching: markingPaid }, markPaid] =
    useAdminMarkRegistrationPaidMutation()
  const [{ fetching: unmarkingPaid }, unmarkPaid] =
    useAdminUnmarkRegistrationPaidMutation()
  const [confirmUndo, setConfirmUndo] = useState(false)
  const paymentRequestRunning = markingPaid || unmarkingPaid

  const { paymentStatus, priceCents } = registration
  // Paid rows always get the delete dialog, even before the payment summary
  // has loaded, so a card refund is never queued without the organizer
  // seeing the refund choice.
  const isPaidByCard = paymentStatus === RegistrationPaymentStatus.Paid
  const isPaidManually =
    paymentStatus === RegistrationPaymentStatus.PaidManually
  const price = formatEuro(priceCents ?? 0)

  const doDelete = useCallback(
    async (refund?: boolean) => {
      try {
        const { data, error } = await deleteRegistration({
          input: {
            id: registration.id,
            ...(refund !== undefined ? { refund } : {}),
          },
        })
        if (error) throw error
        if (!data?.adminDeleteRegistration?.success) {
          throw new Error(t("register_event:deleteRegistrationFailed"))
        }
        message.info(t("notifications.deleteSuccess"))
        setShowDeleteModal(false)
        if (showPayments) onPaymentChange?.()
      } catch (e) {
        setErrorMessage(null)
        setError(e)
      }
    },
    [registration, deleteRegistration, t, showPayments, onPaymentChange]
  )

  const doUpdate = useCallback(async () => {
    try {
      const { data, error } = await updateRegistration({
        input: { id: registration.id },
      })
      if (error) throw error
      setUpdateToken(data?.adminUpdateRegistration?.updateToken!)
      setShowModal(true)
    } catch (e) {
      setErrorMessage(null)
      setError(e)
    }
  }, [registration, updateRegistration])

  const doMarkPaid = useCallback(async () => {
    try {
      const { error } = await markPaid({
        input: { registrationId: registration.id },
      })
      if (error) throw error
      message.success(t("payments.actions.markPaidSuccess"))
      onPaymentChange?.()
    } catch (e) {
      setErrorMessage(t("payments.actions.failed"))
      setError(e)
    }
  }, [registration, markPaid, t, onPaymentChange])

  const doUnmarkPaid = useCallback(async () => {
    try {
      const { error } = await unmarkPaid({
        input: { registrationId: registration.id },
      })
      if (error) throw error
      message.success(t("payments.actions.undoManualSuccess"))
      onPaymentChange?.()
    } catch (e) {
      setErrorMessage(t("payments.actions.failed"))
      setError(e)
    }
  }, [registration, unmarkPaid, t, onPaymentChange])

  const menuItems: MenuProps["items"] = [
    ...(paymentStatus === RegistrationPaymentStatus.Unpaid &&
    registration.status !== RegistrationStatus.InQueue
      ? [
          {
            key: "markPaid",
            label: (
              <span data-cy="admin-table-mark-paid">
                {t("payments.actions.markPaid")}
                <br />
                <Text style={{ fontSize: 12 }} type="secondary">
                  {t("payments.actions.markPaidHelp")}
                </Text>
              </span>
            ),
            disabled: paymentRequestRunning,
            onClick: doMarkPaid,
          },
        ]
      : []),
    ...(paymentStatus === RegistrationPaymentStatus.PaidManually
      ? [
          {
            key: "undoManual",
            label: (
              <span data-cy="admin-table-undo-manual-payment">
                {t("payments.actions.undoManual")}
              </span>
            ),
            onClick: () => setConfirmUndo(true),
          },
        ]
      : []),
  ]

  const deleteButton = (
    <Button
      data-cy="admin-table-delete-button"
      size="small"
      style={{ minWidth: "65px" }}
      danger
      onClick={
        isPaidByCard || isPaidManually
          ? () => {
              setRefund(true)
              setShowDeleteModal(true)
            }
          : undefined
      }
    >
      {t("common:delete")}
    </Button>
  )

  return (
    <>
      <Row gutter={[8, 8]} wrap>
        <Col flex={showPayments ? "none" : "1 1 50%"}>
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
        <Col flex={showPayments ? "none" : "1 1 50%"}>
          {isPaidByCard || isPaidManually ? (
            deleteButton
          ) : (
            <Popconfirm
              cancelText={t("common:no")}
              okText={t("common:yes")}
              placement="top"
              title={t("registrations.delete.confirmText")}
              onConfirm={() => doDelete()}
            >
              {deleteButton}
            </Popconfirm>
          )}
        </Col>
        {showPayments && (
          <Col flex="none">
            <Popconfirm
              cancelText={t("common:no")}
              okText={t("common:yes")}
              open={confirmUndo}
              placement="topRight"
              title={t("payments.actions.undoManualConfirm")}
              onCancel={() => setConfirmUndo(false)}
              onConfirm={async () => {
                setConfirmUndo(false)
                await doUnmarkPaid()
              }}
            >
              <Dropdown
                disabled={menuItems.length === 0 || paymentRequestRunning}
                menu={{ items: menuItems }}
                placement="bottomRight"
                trigger={["click"]}
              >
                <Button
                  aria-label={t("payments.actions.more")}
                  data-cy="admin-table-more-button"
                  loading={paymentRequestRunning}
                  size="small"
                >
                  ⋯
                </Button>
              </Dropdown>
            </Popconfirm>
          </Col>
        )}
      </Row>
      {error ? (
        <ErrorAlert
          error={error}
          message={errorMessage ?? t("registrations.delete.deleteFailed")}
          setError={setError}
          banner
        />
      ) : null}
      {showDeleteModal ? (
        <Modal
          cancelText={t("payments.cancel")}
          confirmLoading={deleting}
          data-cy="admin-table-delete-modal"
          okButtonProps={{ danger: true }}
          okText={
            isPaidByCard && refund
              ? t("payments.delete.confirmRefund")
              : t("payments.delete.confirm")
          }
          open={showDeleteModal}
          title={t("payments.delete.title", { name: registration.fullName })}
          destroyOnClose
          onCancel={() => setShowDeleteModal(false)}
          // Manual payments are never refunded by Ilmo, so refund is only
          // passed for card payments.
          onOk={() => doDelete(isPaidByCard ? refund : undefined)}
        >
          <Paragraph>{t("payments.delete.body")}</Paragraph>
          {isPaidByCard && (
            <Checkbox
              checked={refund}
              data-cy="admin-table-delete-refund-checkbox"
              onChange={(e) => setRefund(e.target.checked)}
            >
              <Text strong>{t("payments.delete.refund", { price })}</Text>
            </Checkbox>
          )}
          {isPaidManually && (
            <Alert
              message={t("payments.delete.manualWarning", { price })}
              type="warning"
            />
          )}
        </Modal>
      ) : null}
      {showModal ? (
        <RegistrationUpdateModal
          open={showModal}
          questions={props.questions}
          registration={registration}
          setShowModal={setShowModal}
          updateToken={updateToken!}
        />
      ) : null}
    </>
  )
}
