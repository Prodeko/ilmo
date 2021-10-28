import type { RegistrationStatus } from "@app/graphql"

export type ValueOf<T> = T[keyof T]

export type Session = { uuid: string }

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
