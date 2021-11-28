import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ErrorBoundary } from "react-error-boundary"
import {
  SlateCustomElement,
  SlateCustomText,
  SlateFormatOptions,
  SlateSupportedTypes,
} from "@app/lib"
import { css } from "@emotion/css"
import {
  RiBold,
  RiCodeFill,
  RiDoubleQuotesL,
  RiH1,
  RiH2,
  RiItalic,
  RiListOrdered,
  RiListUnordered,
  RiParagraph,
  RiUnderline,
} from "@hacknug/react-icons/ri"
import { Button } from "antd"
import isHotkey from "is-hotkey"
import { useRouter } from "next/router"
import { BaseEditor, createEditor } from "slate"
import { HistoryEditor, withHistory } from "slate-history"
import { Editable, ReactEditor, Slate, withReact } from "slate-react"

import { ErrorAlert, useTranslation } from ".."

import {
  BlockButton,
  EditorLanguage,
  Element,
  LanguageMenu,
  Leaf,
  MarkButton,
  Toolbar,
  TranslateMenu,
} from "./components"
import { emptyNode, HOTKEYS, ICON_SIZE } from "./constants"
import { serialize, toggleMark } from "./utils"

export type CustomEditor = BaseEditor & ReactEditor & HistoryEditor

declare module "slate" {
  interface CustomTypes {
    Editor: CustomEditor
    Element: SlateCustomElement
    Text: SlateCustomText
  }
}

interface EditorProps {
  value?: any
  onChange?: (e) => void
  selectedLanguages: string[]
}

export const Editor: React.FC<EditorProps> = ({
  value: formValue,
  onChange,
  selectedLanguages,
}) => {
  const { t } = useTranslation("admin")
  const editorRef = useRef<CustomEditor | null>()
  if (!editorRef.current)
    editorRef.current = withHistory(withReact(createEditor()))
  const editor = editorRef.current

  const router = useRouter()
  const [editorLanguage, setEditorLanguage] = useState(
    router.locale || router.defaultLocale!
  )
  const newValue = useMemo(
    () => formValue?.[editorLanguage] || emptyNode,
    [formValue, editorLanguage]
  )
  const [textValue, setTextValue] = useState<string | null>(null)
  const renderElement = useCallback((props) => <Element {...props} />, [])
  const renderLeaf = useCallback((props) => <Leaf {...props} />, [])

  const isReadOnly = selectedLanguages?.length === 0
  const includedLocales = [
    ...selectedLanguages.filter((lang) => lang !== editorLanguage),
  ]

  // See https://github.com/ianstormtaylor/slate/pull/4540#issuecomment-951380551
  editor.children = newValue

  useEffect(() => {
    const textValue = newValue.map((val) => serialize(val)).join("")
    setTextValue(textValue)
  }, [newValue])

  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div role="alert">
          <ErrorAlert error={error} message={t("common:unknownError")} />
          <Button
            onClick={() => {
              editor.children = emptyNode
              resetErrorBoundary()
            }}
          >
            {t("error:tryAgain")}
          </Button>
        </div>
      )}
    >
      <div
        className={css`
          border: 1px solid #d9d9d9;
          // Dirty fix for styling h1 and h2 inside slate.
          // Copied font-sizes from antd.
          * h1 {
            font-size: 38px;
          }

          * h2 {
            font-size: 30px;
          }

          &:focus-within {
            // Copied focus style from antd.
            border-color: #16448a;
            box-shadow: 0 0 0 2px rgba(0, 46, 125, 0.2);
            border-right-width: 1px !important;
            outline: 0;
          }
        `}
      >
        <Slate
          editor={editor}
          value={emptyNode}
          onChange={(value) => {
            onChange!({ ...formValue, [editorLanguage]: value })
          }}
        >
          <Toolbar borderPosition="bottom" readOnly={isReadOnly}>
            <BlockButton
              disabled={isReadOnly}
              format={SlateSupportedTypes.Paragraph}
              icon={<RiParagraph size={ICON_SIZE} />}
            />
            <BlockButton
              disabled={isReadOnly}
              format={SlateSupportedTypes.HeadingOne}
              icon={<RiH1 size={ICON_SIZE} />}
            />
            <BlockButton
              disabled={isReadOnly}
              format={SlateSupportedTypes.HeadingTwo}
              icon={<RiH2 size={ICON_SIZE} />}
            />
            <MarkButton
              disabled={isReadOnly}
              format={SlateFormatOptions.Bold}
              icon={<RiBold size={ICON_SIZE} />}
            />
            <MarkButton
              disabled={isReadOnly}
              format={SlateFormatOptions.Italic}
              icon={<RiItalic size={ICON_SIZE} />}
            />
            <MarkButton
              disabled={isReadOnly}
              format={SlateFormatOptions.Underline}
              icon={<RiUnderline size={ICON_SIZE} />}
            />
            <MarkButton
              disabled={isReadOnly}
              format={SlateFormatOptions.Code}
              icon={<RiCodeFill size={ICON_SIZE} />}
            />
            <BlockButton
              disabled={isReadOnly}
              format={SlateSupportedTypes.BlockQuote}
              icon={<RiDoubleQuotesL size={ICON_SIZE} />}
            />
            <BlockButton
              disabled={isReadOnly}
              format={SlateSupportedTypes.NumberedList}
              icon={<RiListUnordered size={ICON_SIZE} />}
            />
            <BlockButton
              disabled={isReadOnly}
              format={SlateSupportedTypes.BulletedList}
              icon={<RiListOrdered size={ICON_SIZE} />}
            />
          </Toolbar>
          <Editable
            className={css`
              padding: 12px;
              ${isReadOnly
                ? `
                background-color: #f5f5f5;
                cursor: not-allowed;`
                : null}
            `}
            placeholder={t("admin:editor.placeholder")}
            readOnly={isReadOnly}
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            autoFocus
            spellCheck
            onKeyDown={(event) => {
              for (const hotkey in HOTKEYS) {
                if (isHotkey(hotkey, event as any)) {
                  event.preventDefault()
                  const mark = HOTKEYS[hotkey]
                  toggleMark(editor, mark)
                }
              }
            }}
          />
          {includedLocales.length > 0 && (
            <Toolbar borderPosition="top" readOnly={isReadOnly}>
              <EditorLanguage editorLanguage={editorLanguage} />
              <LanguageMenu
                includedLocales={includedLocales}
                setEditorLanguage={setEditorLanguage}
              />
              <TranslateMenu
                formOnChange={onChange}
                formValue={formValue}
                includedLocales={includedLocales}
                textValue={textValue}
                translateFrom={editorLanguage}
              />
            </Toolbar>
          )}
        </Slate>
      </div>
    </ErrorBoundary>
  )
}
