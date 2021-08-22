import { Redirect } from "@app/components"
import { NextPage } from "next"

const A: NextPage = () => <Redirect href={"/admin/event/list"} layout />

export default A
