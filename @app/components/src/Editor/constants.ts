import { SlateFormatOptions, SlateSupportedTypes } from "@app/lib"
import { Descendant } from "slate"

export const HOTKEYS = {
  "mod+b": SlateFormatOptions.Bold,
  "mod+i": SlateFormatOptions.Italic,
  "mod+u": SlateFormatOptions.Underline,
  "mod+`": SlateFormatOptions.Code,
} as const

export const emptyNode = [
  {
    type: SlateSupportedTypes.Paragraph,
    children: [{ text: "" }],
  },
] as Descendant[]

export const LIST_TYPES = [
  SlateSupportedTypes.NumberedList,
  SlateSupportedTypes.BulletedList,
]

// Icon size in editor toolbar
export const ICON_SIZE = 16 as const
