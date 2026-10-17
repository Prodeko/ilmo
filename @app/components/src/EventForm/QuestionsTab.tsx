import { memo, useReducer } from "react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import {
  DragOutlined,
  MinusCircleTwoTone,
  MinusOutlined,
  PlusCircleTwoTone,
  PlusOutlined,
} from "@ant-design/icons"
import { QuestionType } from "@app/graphql"
import { arePropsEqual } from "@app/lib"
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
  Typography,
} from "antd"
import Trans from "next-translate/Trans"

import { useTranslation } from "../."
import { Draggable } from "../Draggable"
import { useIsMobile } from "../hooks"
import { H5 } from "../Text"

import {
  buildPresetQuestions,
  buildTemplateQuestions,
  questionPresets,
  questionTemplates,
} from "./eventTemplates"
import { TemplateSelector } from "./TemplateSelector"

import type { SelectValue } from "antd/lib/select"

const { Option } = Select

type QuestionData = {
  id?: string
  position: number
  type: QuestionType
  label: string
  isRequired: boolean
  data: string[]
  // Set on questions created from a preset checkbox or an event template
  presetKey?: string
  templateKey?: string
}

interface QuestionsTabProps {
  form: FormInstance
  selectedLanguages: string[]
}

const colSpan = { md: { span: 6 }, sm: { span: 12 }, xs: { span: 24 } }

export const QuestionsTab: React.FC<QuestionsTabProps> = memo(
  ({ form, selectedLanguages }) => {
    /**
     * This component is a bit of a mess... Nested dynamic form fields don't pair
     * particularly well with antd's form model.
     */

    const { t, lang } = useTranslation("events")
    const isMobile = useIsMobile()
    const [, forceUpdate] = useReducer((x) => x + 1, 0)
    const { getFieldValue, setFieldsValue } = form
    const questions = getFieldValue("questions") as QuestionData[]

    function presetKeysOf(questions: QuestionData[] = []) {
      // A preset can add several questions, so dedupe the keys
      const keys = questions.map((q) => q?.presetKey).filter(Boolean)
      return [...new Set(keys)] as string[]
    }

    // Presets that were ticked by hand, so a template doesn't add them twice
    function buildTemplateWithoutTickedPresets(templateKey: string) {
      const current = (getFieldValue("questions") as QuestionData[]) ?? []
      const ticked = presetKeysOf(current.filter((q) => !q?.templateKey))
      return buildTemplateQuestions(templateKey, selectedLanguages).filter(
        (q) => !ticked.includes(q.presetKey)
      )
    }

    function handlePresetsChange(checked: string[]) {
      const current = (getFieldValue("questions") as QuestionData[]) ?? []
      const present = presetKeysOf(current)
      const kept = current.filter(
        (q) => !q?.presetKey || checked.includes(q.presetKey)
      )
      const added = checked
        .filter((key) => !present.includes(key))
        .flatMap((key) => buildPresetQuestions(key, selectedLanguages))
      form.setFieldValue("questions", [...kept, ...added])
      forceUpdate()
    }

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
      forceUpdate()
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
      forceUpdate()
    }

    function handleAddOption(questionIndex: number) {
      let questions = getFieldValue("questions")
      const fieldData = questions[questionIndex]?.data
      questions[questionIndex].data = fieldData ? [...fieldData, ""] : [""]
      setFieldsValue({
        questions,
      })
      forceUpdate()
    }

    function renderQuestionLabel(index: number) {
      return selectedLanguages.map((l) => {
        const inputPlaceholder =
          t("forms.placeholders.quota.title") + " " + t(`common:lang.in.${l}`)
        return (
          <Form.Item
            key={l}
            name={[index, "label", l.toLowerCase()]}
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
            twoToneColor="lightgreen"
            onClick={() => handleAddOption(index)}
          />
        </Tooltip>
      )

      const removeDataOption = (index: number, i: number) => (
        <Tooltip title={t("removeOption")}>
          <MinusOutlined
            data-cy={`eventform-questions-${index}-remove-option`}
            twoToneColor="yellow"
            onClick={() => handleRemoveOption(index, i)}
          />
        </Tooltip>
      )

      const firstLanguage = selectedLanguages?.[0]

      return selectedLanguages.map((l) => {
        const icon =
          l !== firstLanguage
            ? null
            : i === 0
              ? addDataOption
              : removeDataOption(index, i)
        return (
          <div
            key={l}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Form.Item
              name={[index, "data", i, l.toLowerCase()]}
              rules={[
                {
                  required: true,
                  message: t("forms.rules.questions.provideQuestionData"),
                },
              ]}
              noStyle
            >
              <Input.TextArea
                data-cy={`eventform-input-questions-${index}-data-${i}-${l}`}
                placeholder={`${t("common:option")} ${i} ${t(
                  `common:lang.in.${l}`
                )}`}
                style={{ flex: 1 }}
                // Grow taller instead of cutting off long option texts
                autoSize
                // An option is a single line of text, so Enter adds no newline
                onPressEnter={(e) => e.preventDefault()}
              />
            </Form.Item>
            {/* Reserve the icon's width on every row so the fields line up */}
            <span style={{ flex: "none", width: 14 }}>{icon}</span>
          </div>
        )
      })
    }

    function renderTextQuestion(index: number) {
      const questionLabel = renderQuestionLabel(index)
      return (
        <>
          <Col {...colSpan}>{questionLabel}</Col>
          <Col {...colSpan}>
            {/* TEXT questions don't have any data associated with them.
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
        <TemplateSelector
          build={buildTemplateWithoutTickedPresets}
          listName="questions"
          templateKeys={questionTemplates.map((template) => template.key)}
          onApplied={forceUpdate}
        />
        <Form.Item
          label={t("templates.questions.presets")}
          labelCol={{ flex: "none" }}
          wrapperCol={{ flex: "auto" }}
        >
          <Checkbox.Group
            data-cy="eventform-questions-presets"
            options={Object.entries(questionPresets).map(([key, preset]) => ({
              value: key,
              label: preset[0].label[lang as "fi" | "en"] ?? preset[0].label.en,
            }))}
            value={presetKeysOf(questions)}
            onChange={(checked) => handlePresetsChange(checked as string[])}
          />
        </Form.Item>
        <Typography.Paragraph>
          <Trans
            components={{ b: <strong /> }}
            i18nKey="events:questionsAutomaticallyCollected"
          />
        </Typography.Paragraph>
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
                  const { name, key } = field
                  return (
                    <Draggable
                      {...field}
                      key={key}
                      id={key}
                      index={index}
                      move={move}
                    >
                      <Row gutter={[8, 8]} style={{ marginBottom: "12px" }}>
                        <Form.Item name={[name, "id"]} required={false} noStyle>
                          <Input type="hidden" />
                        </Form.Item>
                        <Form.Item name={[name, "position"]} noStyle required>
                          <Input type="hidden" />
                        </Form.Item>
                        <Col
                          md={{ span: 4 }}
                          sm={{ span: 12 }}
                          xs={{ span: 24 }}
                        >
                          <DragOutlined style={{ marginRight: "8px" }} />
                          <Form.Item
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
                            label={t("common:required")}
                            labelAlign="left"
                            labelCol={{ flex: 1 }}
                            name={[index, "isRequired"]}
                            valuePropName="checked"
                            wrapperCol={{ flex: 20 }}
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
  },
  arePropsEqual
)
