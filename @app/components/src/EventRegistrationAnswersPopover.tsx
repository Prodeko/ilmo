import {
  EventPage_QuestionFragment,
  QuestionType,
  Registration,
} from "@app/graphql"
import { Col, Popover, Row, Typography } from "antd"
import useTranslation from "next-translate/useTranslation"

import { useIsMobile } from "./hooks"

const { Text, Link } = Typography

interface EventRegistrationAnswersPopoverProps {
  registration: Registration
  questions: EventPage_QuestionFragment[] | undefined
}

export const EventRegistrationAnswersPopover: React.FC<EventRegistrationAnswersPopoverProps> =
  ({ registration, questions }) => {
    const { answers } = registration
    const { t, lang } = useTranslation("admin")
    const isMobile = useIsMobile()

    function renderQuestions(
      questions: EventPage_QuestionFragment[] | undefined
    ) {
      const answerRows = questions?.map(({ id, type, label }) => {
        let answerJsx
        const answer = answers?.[id]
        if (answer) {
          if (type === QuestionType.Text) {
            answerJsx = <Text>{answers[id]}</Text>
          } else if (type === QuestionType.Radio) {
            answerJsx = answers[id]
          } else if (type === QuestionType.Checkbox) {
            answerJsx = answers[id]?.join(", ")
          }
        }

        return (
          <Row key={id} gutter={[16, 16]}>
            <Col span="8" style={{ textAlign: "right" }}>
              <Text type="secondary">{label[lang]}:</Text>
            </Col>
            <Col span="16">{answerJsx}</Col>
          </Row>
        )
      })

      return (
        <div style={{ minWidth: isMobile ? "90vw" : "40vw" }}>{answerRows}</div>
      )
    }

    return (
      <Popover content={renderQuestions(questions)} title={t("common:answers")}>
        <Link>{t("events.update.showAnswers")}</Link>
      </Popover>
    )
  }
