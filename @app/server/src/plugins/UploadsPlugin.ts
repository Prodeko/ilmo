import { makeWrapResolversPlugin } from "postgraphile"

import { resolveUpload } from "../utils/fileUpload"

const handleFileUpload = () => {
  // @ts-ignore
  return async (resolve, source, args, context, resolveInfo) => {
    const image = args?.input?.event?.headerImageFile

    if (image instanceof Promise) {
      const upload = await image
      if (upload) {
        const url = await resolveUpload(upload)
        args.input.event.headerImageFile = url
      }
    }

    return resolve(source, args, context, resolveInfo)
  }
}

/**
 * This plugin handles headerImageFile uploads because
 * postgraphile-plugin-upload-field doesn't work with
 * custom mutations (https://www.graphile.org/postgraphile/custom-mutations/).
 *
 * We use a custom mutation to create an event as well as
 * any related quotas and questions with a single mutation.
 */
export default makeWrapResolversPlugin({
  Mutation: {
    createEvent: handleFileUpload(),
    updateEvent: handleFileUpload(),
  },
})
