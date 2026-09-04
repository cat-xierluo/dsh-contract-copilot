/** Remove only this package's generated lib directory before a full build. */

import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const outputDirectory = fileURLToPath(new URL('../lib', import.meta.url))
rmSync(outputDirectory, { recursive: true, force: true })
