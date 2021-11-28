import { SlateCustomElement, SlateSupportedTypes } from "@app/lib"
import escapeHtml from "escape-html"
import { Editor, Element as SlateElement, Node, Text, Transforms } from "slate"
import { jsx } from "slate-hyperscript"

import { LIST_TYPES } from "./constants"
import { CustomEditor } from "."

export const toggleBlock = (
  editor: CustomEditor,
  format: SlateSupportedTypes
) => {
  const isActive = isBlockActive(editor, format)
  const isList = LIST_TYPES.includes(format)

  Transforms.unwrapNodes(editor, {
    match: (n) =>
      !Editor.isEditor(n) &&
      SlateElement.isElement(n) &&
      LIST_TYPES.includes(n.type),
    split: true,
  })
  const newProperties = {
    type: isActive ? "paragraph" : isList ? "list-item" : format,
  } as Partial<SlateElement>
  Transforms.setNodes<SlateElement>(editor, newProperties)

  if (!isActive && isList) {
    const block: SlateCustomElement = { type: format, children: [] }
    Transforms.wrapNodes(editor, block)
  }
}

export const toggleMark = (
  editor: CustomEditor,
  format: SlateSupportedTypes
) => {
  const isActive = isMarkActive(editor, format)

  if (isActive) {
    Editor.removeMark(editor, format)
  } else {
    Editor.addMark(editor, format, true)
  }
}

export const isBlockActive = (
  editor: CustomEditor,
  format: SlateSupportedTypes
) => {
  const { selection } = editor
  if (!selection) return false

  const [match] = Editor.nodes(editor, {
    at: Editor.unhangRange(editor, selection),
    match: (n) =>
      !Editor.isEditor(n) && SlateElement.isElement(n) && n.type === format,
  })

  return !!match
}

export const isMarkActive = (
  editor: CustomEditor,
  format: SlateSupportedTypes
) => {
  const marks = Editor.marks(editor)
  return marks ? marks[format] === true : false
}

export const toHtml = (content) => {
  return Object.keys(content).reduce((acc, cur) => {
    const textValue = content[cur].map((val) => serialize(val)).join("")
    acc[cur] = textValue
    return acc
  }, [])
}

export const serialize = (node: Node) => {
  if (Text.isText(node)) {
    let string = escapeHtml(node.text)
    if (node.code) {
      string = `<code>${string}</code>`
    }
    if (node.bold) {
      string = `<strong>${string}</strong>`
    }
    if (node.italic) {
      string = `<i>${string}</i>`
    }
    if (node.underline) {
      string = `<u>${string}</u>`
    }
    return string
  }
  const children = node.children.map((n) => serialize(n)).join("")

  // @ts-ignore
  switch (node.type) {
    case SlateSupportedTypes.Paragraph:
      return `<p>${children}</p>`
    case SlateSupportedTypes.BlockQuote:
      return `<blockquote>${children}</blockquote>`
    case SlateSupportedTypes.BulletedList:
      return `<ul>${children}</ul>`
    case SlateSupportedTypes.HeadingOne:
      return `<h1>${children}</h1>`
    case SlateSupportedTypes.HeadingTwo:
      return `<h2>${children}</h2>`
    case SlateSupportedTypes.ListItem:
      return `<li>${children}</li>`
    case SlateSupportedTypes.NumberedList:
      return `<ol>${children}</ol>`
    default:
      return `<p>${children}</p>`
  }
}

export const deserialize = (el) => {
  if (el.nodeType === 3) {
    return el.textContent
  } else if (el.nodeType !== 1) {
    return null
  }

  let children = Array.from(el.childNodes).map(deserialize)

  if (children?.length === 0) {
    children = [{ text: "" }]
  }

  switch (el.nodeName) {
    case "BODY":
      return jsx("fragment", {}, children)
    case "BR":
      return "\n"
    case "BLOCKQUOTE":
      return jsx("element", { type: SlateSupportedTypes.BlockQuote }, children)
    case "H1":
      return jsx("element", { type: SlateSupportedTypes.HeadingOne }, children)
    case "H2":
      return jsx("element", { type: SlateSupportedTypes.HeadingTwo }, children)
    case "UL":
      return jsx(
        "element",
        { type: SlateSupportedTypes.BulletedList },
        children
      )
    case "LI":
      return jsx("element", { type: SlateSupportedTypes.ListItem }, children)
    case "OL":
      return jsx(
        "element",
        { type: SlateSupportedTypes.NumberedList },
        children
      )
    case "P":
      return jsx("element", { type: SlateSupportedTypes.Paragraph }, children)

    // TODO: Support nested leaf styles
    // See: https://stackoverflow.com/questions/66547489/deserializing-nested-html-in-slatejs-editor
    // Leafs:
    case "STRONG":
      return { text: el.textContent, bold: true }
    case "CODE":
      return { text: el.textContent, code: true }
    case "I":
      return { text: el.textContent, italic: true }
    case "U":
      return { text: el.textContent, underline: true }
    default:
      return el.textContent
  }
}
