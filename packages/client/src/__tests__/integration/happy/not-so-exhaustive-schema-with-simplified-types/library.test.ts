import { ClientEngineType } from '@prisma/internals'
import fs from 'fs/promises'

import { testGeneratedClient } from './common'

test('not-so-exhaustive-schema-with-simplified-types (library)', async () => {
  process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES = 'true'
  // TODO [simplification] wip hack to be removed
  try {
    await testGeneratedClient(ClientEngineType.Library)()

    // TODO [simplification] wip hack to be removed for making typings testable
    const file = `${__dirname}/test-clients/library/node_modules/.prisma/client/index.d.ts`
    const originalContent = await fs.readFile(file, 'utf-8')
    const oldImport = "import * as runtime from '@prisma/client/runtime/library.js';"
    const newImport = "import * as runtime from '/Users/thomas/dev/external/prisma/packages/client/runtime/library.js'"
    const adaptedContent = originalContent.replace(oldImport, newImport)
    await fs.writeFile(file, adaptedContent, 'utf-8')
  } finally {
    delete process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
  }
})
