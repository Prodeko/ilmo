import { createContext, useContext } from "react"

interface IlmoContext {
  resetUrqlClient?: () => void
}
export const IlmoContext = createContext<IlmoContext>({})

export function useIlmoContext() {
  return useContext(IlmoContext)
}
