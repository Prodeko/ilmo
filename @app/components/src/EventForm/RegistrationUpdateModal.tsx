import React from "react"
import { filterObjectByKeys } from "@app/lib"
import { Modal } from "antd"

import { EventRegistrationForm } from "../."

import type { EventPage_QuestionFragment, Registration } from "@app/graphql"
import type { ModalProps } from "antd/lib/modal"

interface RegistrationUpdateModalProps extends ModalProps {
  registration: Registration
  questions: EventPage_QuestionFragment[] | undefined
  updateToken: string
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>
}

function constructInitialValues(values: any) {
  return filterObjectByKeys(values, ["firstName", "lastName", "answers"])
}
export const RegistrationUpdateModal: React.FC<
  RegistrationUpdateModalProps
> = ({ registration, questions, updateToken, setShowModal, ...rest }) => {
  return (
    <Modal
      footer={null}
      width={800}
      destroyOnClose
      onCancel={() => setShowModal(false)}
      {...rest}
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
