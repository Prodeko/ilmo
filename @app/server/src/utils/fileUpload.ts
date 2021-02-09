import { createWriteStream, ReadStream, unlinkSync } from "fs";
import { join } from "path";

import { FileUpload } from "graphql-upload";

declare module "fs" {
  interface ReadStream {
    /**
     * True if the request is a multipart request
     */
    truncated?: boolean;
  }
}

interface SaveLocalArgs {
  stream: ReadStream;
  filename: string;
}

interface SaveLocalReturnValue {
  id: string;
  filepath: string;
}

export function saveLocal({
  stream,
  filename,
}: SaveLocalArgs): Promise<SaveLocalReturnValue> {
  const timestamp = new Date().toISOString().replace(/\D/g, "");
  const id = `${timestamp}_${filename}`;
  const filepath = join("/uploads", id);
  const fsPath = join(process.cwd(), filepath);
  return new Promise((resolve, reject) =>
    stream
      .on("error", (error: Error) => {
        if (stream.truncated)
          // Delete the truncated file
          unlinkSync(fsPath);
        reject(error);
      })
      .on("end", () => resolve({ id, filepath }))
      .pipe(createWriteStream(fsPath))
  );
}

export async function resolveUpload(upload: FileUpload) {
  const { filename, createReadStream } = upload;
  const stream = createReadStream();

  // Save file to the local filesystem
  const { filepath } = await saveLocal({ stream, filename });
  // Return metadata to save it to Postgres
  return filepath;
}
