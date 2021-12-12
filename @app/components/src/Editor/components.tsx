import {
  forwardRef,
  PropsWithChildren,
  Ref,
  useCallback,
  useState,
} from "react"
import { ReactCountryFlag } from "react-country-flag"
import { SupportedLanguages, useTranslateTextMutation } from "@app/graphql"
import { SlateSupportedTypes } from "@app/lib"
import { css, cx } from "@emotion/css"
import { message } from "antd"
import { useSlate } from "slate-react"

import { LocaleMenu, useTranslation } from ".."

import {
  deserialize,
  isBlockActive,
  isMarkActive,
  toggleBlock,
  toggleMark,
} from "./utils"

import type { OrNull } from "@app/lib"
import type { MenuInfo } from "rc-menu/es/interface"

interface BaseProps {
  className: string
  [key: string]: unknown
}

export const Element = ({ attributes, children, element }) => {
  switch (element.type) {
    case SlateSupportedTypes.Paragraph:
      return <p {...attributes}>{children}</p>
    case SlateSupportedTypes.BlockQuote:
      return <blockquote {...attributes}>{children}</blockquote>
    case SlateSupportedTypes.HeadingOne:
      return <h1 {...attributes}>{children}</h1>
    case SlateSupportedTypes.HeadingTwo:
      return <h2 {...attributes}>{children}</h2>
    case SlateSupportedTypes.BulletedList:
      return <ul {...attributes}>{children}</ul>
    case SlateSupportedTypes.ListItem:
      return <li {...attributes}>{children}</li>
    case SlateSupportedTypes.NumberedList:
      return <ol {...attributes}>{children}</ol>
    default:
      return <p {...attributes}>{children}</p>
  }
}

/* eslint-disable no-param-reassign */
export const Leaf = ({ attributes, children, leaf }) => {
  if (leaf.bold) {
    children = <strong>{children}</strong>
  }

  if (leaf.code) {
    children = <code>{children}</code>
  }

  if (leaf.italic) {
    children = <em>{children}</em>
  }

  if (leaf.underline) {
    children = <u>{children}</u>
  }

  return <span {...attributes}>{children}</span>
}
/* eslint-enable no-param-reassign */

export const Button = forwardRef(
  (
    {
      className,
      active,
      reversed,
      disabled,
      ...props
    }: PropsWithChildren<
      {
        active: boolean
        reversed: boolean
      } & BaseProps
    >,
    ref: Ref<OrNull<HTMLSpanElement>>
  ) => (
    <span
      {...props}
      // @ts-ignore
      ref={ref}
      className={cx(
        className,
        css`
          cursor: ${disabled ? "not-allowed" : "cursor"};
          color: ${reversed
            ? active
              ? "white"
              : "#aaa"
            : active
            ? "black"
            : "#707070"};
        `
      )}
    />
  )
)
export const Menu = forwardRef(
  (
    { className, ...props }: PropsWithChildren<BaseProps>,
    ref: Ref<OrNull<HTMLDivElement>>
  ) => (
    <div
      {...props}
      // @ts-ignore
      ref={ref}
      className={cx(
        className,
        css`
          & > * {
            display: inline-block;
          }
          & > * + * {
            margin-left: 15px;
          }
        `
      )}
    />
  )
)

export const EditorLanguage = ({ editorLanguage }) => {
  const { t } = useTranslation("admin")
  return (
    <>
      <span>{t("editor.currentLanguage")}:</span>
      <ReactCountryFlag
        aria-label={`${editorLanguage} flag`}
        countryCode={
          ["EN", "en"].includes(editorLanguage) ? "GB" : editorLanguage
        }
        style={{
          fontSize: "1.5rem",
          lineHeight: "1.5rem",
        }}
      />
    </>
  )
}

export const LanguageMenu = ({ includedLocales, setEditorLanguage }) => {
  const { t } = useTranslation("admin")

  const changeEditorLanguage = useCallback(
    async (info: MenuInfo) => {
      setEditorLanguage(info.key)
    },
    [setEditorLanguage]
  )

  return (
    <LocaleMenu
      dataCyDropdown="editor-languageselect-dropdown"
      dataCyMenuItem="editor-languageselect"
      includedLocales={includedLocales}
      menuTitle={t("editor.changeLanguage")}
      onClickHandler={changeEditorLanguage}
    />
  )
}

export const TranslateMenu = ({
  includedLocales,
  translateFrom,
  textValue,
  formValue,
  formOnChange,
}) => {
  const { t } = useTranslation("admin")
  const [translating, setTranslating] = useState(false)
  const [_, executeTranslate] = useTranslateTextMutation()

  const callTranslateApi = useCallback(
    async (info: MenuInfo) => {
      const from = translateFrom.toUpperCase() as SupportedLanguages
      const to = info.key.toUpperCase() as SupportedLanguages
      if (textValue) {
        try {
          setTranslating(true)
          // Call the translate mutation
          const { data, error } = await executeTranslate({
            from,
            to,
            text: textValue,
          })

          // If errors, rethrow
          if (error) {
            throw error
          }

          // Construct DOM from string
          const document = new DOMParser().parseFromString(
            data?.translateText?.translatedText as string,
            "text/html"
          )
          // Deserialize into slate compatible format
          const deserializedContent = deserialize(document.body)

          // Sets antd form internal value
          formOnChange!({ ...formValue, [info.key]: deserializedContent })

          // Success message
          message.success(
            t("admin:editor.translateSucceeded", {
              from: t(`common:lang.${from}`),
              to: t(`common:lang.${to}`),
            })
          )
        } catch (e) {
          message.error(`Error calling translate API: ${e.message}`)
        } finally {
          setTranslating(false)
        }
      }
    },
    [textValue, translateFrom, formOnChange, formValue, t, executeTranslate]
  )

  return (
    <LocaleMenu
      dataCyDropdown="editor-translate-dropdown"
      dataCyMenuItem="editor-translate"
      includedLocales={includedLocales}
      loading={translating}
      menuTitle={t("editor.translate")}
      onClickHandler={callTranslateApi}
    />
  )
}

export const BlockButton = ({
  format,
  icon,
  disabled = false,
  reversed = false,
}) => {
  const editor = useSlate()
  return (
    <Button
      active={isBlockActive(editor, format)}
      disabled={disabled}
      reversed={reversed}
      onMouseDown={(event) => {
        event.preventDefault()
        if (!disabled) {
          toggleBlock(editor, format)
        }
      }}
    >
      {icon}
    </Button>
  )
}

export const MarkButton = ({
  format,
  icon,
  disabled = false,
  reversed = false,
}) => {
  const editor = useSlate()
  return (
    <Button
      active={isMarkActive(editor, format)}
      disabled={disabled}
      reversed={reversed}
      onMouseDown={(event) => {
        event.preventDefault()
        if (!disabled) {
          toggleMark(editor, format)
        }
      }}
    >
      {icon}
    </Button>
  )
}

interface ToolbarProps {
  borderPosition: "top" | "bottom"
}

export const Toolbar = forwardRef(
  (
    {
      className,
      readOnly,
      borderPosition,
      ...props
    }: PropsWithChildren<BaseProps & ToolbarProps>,
    ref: Ref<OrNull<HTMLDivElement>>
  ) => (
    <Menu
      {...props}
      // @ts-ignore
      ref={ref}
      className={cx(
        className,
        css`
          display: flex;
          align-items: center;
          padding: 10px 12px;
          ${borderPosition === "bottom"
            ? "border-bottom: 1px solid #d9d9d9;"
            : "border-top: 1px solid #d9d9d9;;"}
          ${readOnly ? "background-color: #f5f5f5;" : null}
        `
      )}
    />
  )
)
