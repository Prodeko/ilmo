#!/usr/bin/env node
import { unlinkSync } from "fs"
import { dirname } from "./_setup_utils.mjs"

const __dirname = dirname(import.meta)

try {
  unlinkSync(`${__dirname}/../.env`)
} catch (e) {
  /* NOOP */
}
