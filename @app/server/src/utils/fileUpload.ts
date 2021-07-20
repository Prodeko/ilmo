import { createWriteStream, ReadStream, unlinkSync } from "fs"
import { join } from "path"

import { BlobServiceClient } from "@azure/storage-blob"
import * as Sentry from "@sentry/node"
import { FileUpload } from "graphql-upload"

declare module "fs" {
  interface ReadStream {
    /**
     * True if the request is a multipart request
     */
    truncated?: boolean
  }
}

interface SaveLocalArgs {
  stream: ReadStream
  filename: string
}

interface SaveFileReturnValue {
  id: string
  filepath: string
}

const { AZURE_STORAGE_CONNECTION_STRING } = process.env

export async function saveAzure({
  stream,
  filename,
}: SaveLocalArgs): Promise<SaveFileReturnValue> {
  const timestamp = new Date().toISOString().replace(/\D/g, "")
  const id = `${timestamp}_${filename}`
  const filepath = join("ilmo/uploads", id)

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      AZURE_STORAGE_CONNECTION_STRING!
    )
    const containerClient = blobServiceClient.getContainerClient("media")
    await containerClient.getBlockBlobClient(filepath).uploadStream(stream)

    return { id, filepath: `https://static.prodeko.org/media/${filepath}` }
  } catch (e) {
    console.error(e)
    Sentry.captureException(e)
    throw e
  }
}

export function saveLocal({
  stream,
  filename,
}: SaveLocalArgs): Promise<SaveFileReturnValue> {
  const timestamp = new Date().toISOString().replace(/\D/g, "")
  const id = `${timestamp}_${filename}`
  const filepath = join("/uploads", id)
  const fsPath = join(process.cwd(), filepath)
  return new Promise((resolve, reject) =>
    stream
      .on("error", (error: Error) => {
        if (stream.truncated)
          // Delete the truncated file
          unlinkSync(fsPath)
        reject(error)
      })
      .on("end", () => resolve({ id, filepath }))
      .pipe(createWriteStream(fsPath))
  )
}

export async function resolveUpload(upload: FileUpload) {
  const { filename, createReadStream } = upload
  const stream = createReadStream()

  if (AZURE_STORAGE_CONNECTION_STRING) {
    // Save file to Azure Blob Storage
    const { filepath } = await saveAzure({ stream, filename })
    return filepath
  } else {
    // Save file to the local filesystem
    const { filepath } = await saveLocal({ stream, filename })
    return filepath
  }
}
