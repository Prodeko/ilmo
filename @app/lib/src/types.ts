import type { RegistrationStatus, SupportedLanguages } from "@app/graphql"

export type Languages = Lowercase<`${SupportedLanguages}`>

export type ValueOf<T> = T[keyof T]

export type Session = { uuid: string }

export type OrNull<T> = T | null

export type RegistrationSecret = {
  id: string
  registration_token: string
  update_token: string
  confirmation_email_sent: boolean
  registration_id: string
  event_id: string
  quota_id: string
  created_at: string
  updated_at: string
}

export type RegistrationStatusAndPosition = {
  id: string
  status: RegistrationStatus
  position: number
  event_id: string
  quota_id: string
}

export type CsvRow = {
  fullName: string
  email: string
  status: RegistrationStatus
  position: number
}

/**
 * Slate.js editor custom types. Also used on server side
 */

export enum SlateFormatOptions {
  Bold = "bold",
  Italic = "italic",
  Underline = "underline",
  Code = "code",
}

export enum SlateSupportedTypes {
  Paragraph = "paragraph",
  HeadingOne = "heading-one",
  HeadingTwo = "heading-two",
  BlockQuote = "block-quote",
  BulletedList = "bulleted-list",
  ListItem = "list-item",
  NumberedList = "numbered-list",
}

export type SlateCustomText = {
  text: string
  code?: boolean
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

export type SlateCustomElement = {
  type: SlateSupportedTypes
  children: SlateCustomText[]
}
