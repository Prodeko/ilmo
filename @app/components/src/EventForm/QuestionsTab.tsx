import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import DragOutlined from "@ant-design/icons/DragOutlined"
import MinusCircleTwoTone from "@ant-design/icons/MinusCircleTwoTone"
import MinusOutlined from "@ant-design/icons/MinusOutlined"
import PlusCircleTwoTone from "@ant-design/icons/PlusCircleTwoTone"
import PlusOutlined from "@ant-design/icons/PlusOutlined"
import { QuestionType } from "@app/graphql"
import {
  Button,
  Checkbox,
  Col,
  Form,
  FormInstance,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Tooltip,
} from "antd"
import { SelectValue } from "antd/lib/select"
import useTranslation from "next-translate/useTranslation"

import { DisableDraggable, Draggable } from "../Draggable"
import { useIsMobile } from "../hooks"
import { H5 } from "../Text"

const { Option } = Select

type QuestionData = {
  id?: string
  position: number
  type: QuestionType
  label: string
  isRequired: boolean
  data: string[]
}

interface QuestionsTabProps {
  form: FormInstance
  selectedLanguages: string[]
}

const colSpan = { md: { span: 6 }, sm: { span: 12 }, xs: { span: 24 } }

export const QuestionsTab: React.FC<QuestionsTabProps> = ({
  form,
  selectedLanguages,
}) => {
  /**
   * This component is a bit of a mess... Nested dynamic form fields don't pair
   * particularly well with antd's form model.
   */

  const { t } = useTranslation("events")
  const isMobile = useIsMobile()
  const { getFieldValue, setFieldsValue } = form
  const questions = getFieldValue("questions") as QuestionData[]

  function handleTypeChange(val: SelectValue, index: number) {
    if (val === "TEXT") {
      // If the type was changed to TEXT, reset question data
      let questions = getFieldValue("questions")
      questions[index].data = null
      setFieldsValue({
        questions,
      })
    } else if (val === "RADIO" || val === "CHECKBOX") {
      // If the type was changed to RADIO or CHECKBOX, set initial data
      let questions = getFieldValue("questions")
      const hasData = !!questions[index].data

      if (!hasData) {
        questions[index].data = [""]
        setFieldsValue({
          questions,
        })
      }
    }
  }

  function removeItemAtIndex(array: any[], index: number) {
    return array.filter((_, i) => i !== index)
  }

  function handleRemoveOption(questionIndex: number, optionIndex: number) {
    let questions = getFieldValue("questions")
    const fieldData = questions[questionIndex]?.data
    questions[questionIndex].data = removeItemAtIndex(fieldData, optionIndex)
    setFieldsValue({
      questions,
    })
  }

  function handleAddOption(questionIndex: number) {
    let questions = getFieldValue("questions")
    const fieldData = questions[questionIndex]?.data
    questions[questionIndex].data = fieldData ? [...fieldData, ""] : [""]
    setFieldsValue({
      questions,
    })
  }

  function renderQuestionLabel(index: number) {
    return selectedLanguages.map((l) => {
      const inputPlaceholder =
        t("forms.placeholders.quota.title") + " " + t(`common:lang.${l}`)
      return (
        <Form.Item
          key={l}
          fieldKey={[index, "label", l]}
          name={[index, "label", l]}
          rules={[
            {
              required: true,
              message: t("forms.rules.questions.provideQuestionLabel"),
            },
          ]}
          noStyle
        >
          <Input
            data-cy={`eventform-input-questions-${index}-${l}-label`}
            placeholder={inputPlaceholder}
            // Align input with with TEXT and CHECKBOX data inputs
            style={isMobile ? { transform: "translateX(24px)" } : {}}
            {...DisableDraggable}
          />
        </Form.Item>
      )
    })
  }

  function renderQuestionDataField(index: number, i: number) {
    const addDataOption = (
      <Tooltip title={t("addOption")}>
        <PlusCircleTwoTone
          data-cy={`eventform-questions-${index}-add-option`}
          {...DisableDraggable}
          twoToneColor="lightgreen"
          onClick={() => handleAddOption(index)}
        />
      </Tooltip>
    )

    const removeDataOption = (index: number, i: number) => (
      <Tooltip title={t("removeOption")}>
        <MinusOutlined
          data-cy={`eventform-questions-${index}-remove-option`}
          {...DisableDraggable}
          twoToneColor="yellow"
          onClick={() => handleRemoveOption(index, i)}
        />
      </Tooltip>
    )

    const firstLanguage = selectedLanguages?.[0]

    return selectedLanguages.map((l) => {
      return (
        <Form.Item
          key={l}
          fieldKey={[index, "data", i, l]}
          name={[index, "data", i, l]}
          rules={[
            {
              required: true,
              message: t("forms.rules.questions.provideQuestionData"),
            },
          ]}
          noStyle
        >
          <Input
            data-cy={`eventform-input-questions-${index}-data-${i}-${l}`}
            placeholder={`${t("common:option")} ${i} ${t(`common:lang.${l}`)}`}
            suffix={
              <>
                {i === 0 && l === firstLanguage && addDataOption}
                {i > 0 && l === firstLanguage && removeDataOption(index, i)}
              </>
            }
            {...DisableDraggable}
          />
        </Form.Item>
      )
    })
  }

  function renderTextQuestion(index: number) {
    const questionLabel = renderQuestionLabel(index)
    return (
      <>
        <Col {...colSpan}>{questionLabel}</Col>
        <Col {...colSpan}>
          {/* TEXT questions don't have any data data with them.
              This Col is included for layout. */}
        </Col>
      </>
    )
  }

  function renderRadioQuestion(index: number) {
    const questionLabel = renderQuestionLabel(index)
    const { data } = questions[index] || {}

    return (
      <>
        <Col {...colSpan}>{questionLabel}</Col>
        <Col {...colSpan}>
          <Radio.Group>
            <Space direction="vertical">
              {data?.map((_, i) => {
                return (
                  <Radio key={i} value={i} disabled>
                    {renderQuestionDataField(index, i)}
                  </Radio>
                )
              })}
            </Space>
          </Radio.Group>
        </Col>
      </>
    )
  }

  function renderCheckboxQuestion(index: number) {
    const questionLabel = renderQuestionLabel(index)
    const { data } = questions[index] || {}

    return (
      <>
        <Col {...colSpan}>{questionLabel}</Col>
        <Col {...colSpan}>
          <Row justify="start">
            <Col flex="50">
              <Checkbox.Group>
                <Row justify="start">
                  {data?.map((_, i) => (
                    <Col key={i} span={24}>
                      <Checkbox key={i} disabled>
                        {renderQuestionDataField(index, i)}
                      </Checkbox>
                    </Col>
                  ))}
                </Row>
              </Checkbox.Group>
            </Col>
          </Row>
        </Col>
      </>
    )
  }

  function renderQuestions(index: number) {
    if (!questions) return null

    const { type } = questions[index] || {}
    const upper = type?.toUpperCase() as QuestionType

    if (upper === QuestionType.Text) {
      return renderTextQuestion(index)
    } else if (upper === QuestionType.Radio) {
      return renderRadioQuestion(index)
    } else if (upper === QuestionType.Checkbox) {
      return renderCheckboxQuestion(index)
    } else {
      // When no question type is selected, include these Col's for layout
      return (
        <>
          <Col {...colSpan} />
          <Col {...colSpan} />
        </>
      )
    }
  }

  return (
    <>
      <DndProvider backend={HTML5Backend}>
        <Form.List name="questions">
          {(fields, { add, remove, move }) => (
            <>
              <Row gutter={[8, 8]} justify="start">
                <Col {...colSpan}>
                  <H5>{t("common:type")}</H5>
                </Col>
                <Col {...colSpan}>
                  <H5>{t("common:label")}</H5>
                </Col>
                <Col {...colSpan}>
                  <H5>{t("common:data")}</H5>
                </Col>
                <Col span="1" />
              </Row>
              {fields.map((field, index) => {
                const { name, fieldKey } = field
                return (
                  <Draggable
                    {...field}
                    key={fieldKey}
                    id={fieldKey}
                    index={index}
                    move={move}
                  >
                    <Row gutter={[8, 8]} style={{ marginBottom: "12px" }}>
                      <Form.Item
                        fieldKey={[fieldKey, "id"]}
                        name={[name, "id"]}
                        required={false}
                        noStyle
                      >
                        <Input type="hidden" />
                      </Form.Item>
                      <Form.Item
                        fieldKey={[fieldKey, "position"]}
                        name={[name, "position"]}
                        required={true}
                        noStyle
                      >
                        <Input type="hidden" />
                      </Form.Item>
                      <Col md={{ span: 4 }} sm={{ span: 12 }} xs={{ span: 24 }}>
                        <DragOutlined style={{ marginRight: "8px" }} />
                        <Form.Item
                          fieldKey={[fieldKey, "type"]}
                          name={[name, "type"]}
                          rules={[
                            {
                              required: true,
                              message: t(
                                "forms.rules.questions.provideQuestionType"
                              ),
                            },
                          ]}
                          noStyle
                        >
                          <Select
                            data-cy={`eventform-select-questions-type-${index}`}
                            style={{ width: 120 }}
                            onChange={(val) => handleTypeChange(val, index)}
                          >
                            {Object.keys(QuestionType).map((type, i) => (
                              <Option
                                key={type}
                                data-cy={`eventform-select-questions-type-${index}-option-${i}`}
                                value={type.toUpperCase()}
                              >
                                {type}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      {renderQuestions(index)}
                      <Col {...colSpan}>
                        <Form.Item
                          fieldKey={[index, "isRequired"]}
                          label={t("common:required")}
                          labelAlign="left"
                          labelCol={{ flex: 0 }}
                          name={[index, "isRequired"]}
                          valuePropName="checked"
                          wrapperCol={{ flex: 1 }}
                        >
                          <Checkbox
                            data-cy={`eventform-input-questions-${index}-is-required`}
                            defaultChecked={
                              getFieldValue("questions")?.[index]?.isRequired
                            }
                          />
                        </Form.Item>
                      </Col>
                      <Col span="1">
                        <Tooltip title={t("removeQuestion")}>
                          <MinusCircleTwoTone
                            data-cy="eventform-questions-remove-question"
                            {...DisableDraggable}
                            twoToneColor="red"
                            onClick={() => remove(name)}
                          />
                        </Tooltip>
                      </Col>
                    </Row>
                  </Draggable>
                )
              })}
              <Form.Item>
                <Button
                  data-cy="eventform-questions-add-question"
                  icon={<PlusOutlined />}
                  type="dashed"
                  block
                  onClick={() => add()}
                >
                  {t("addQuestion")}
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>
      </DndProvider>
    </>
  )
}
