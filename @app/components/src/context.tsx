import { createContext, useContext } from "react"

interface IlmoContext {
  resetUrqlClient: () => void
}
const initialContext = { resetUrqlClient: () => undefined }

export const IlmoContext = createContext<IlmoContext>(initialContext)

export function useIlmoContext() {
  return useContext(IlmoContext)
}
