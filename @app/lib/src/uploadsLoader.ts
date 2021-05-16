import { ImageLoader } from "next/image"

/**
 * next/image doesn't make it particularly easy to handle file uploads
 * with a custom server setup such as ours. This function is used to
 * load uploaded files (such as event header images) when using the
 * Image component from next/image.
 */
export const uploadsLoader: ImageLoader = ({ src }) => {
  return src.startsWith("/") ? `${process.env.ROOT_URL}${src}` : src
}
