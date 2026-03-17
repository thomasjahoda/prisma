import fs from 'node:fs'
import path from 'node:path'

import { getDMMF } from '@prisma/client-generator-js'

import { compileFile } from '../../../../utils/compileFile'
import { testGeneratedClient } from './common'

const isMacOrWindowsCI = Boolean(process.env.CI) && ['darwin', 'win32'].includes(process.platform)
if (isMacOrWindowsCI) {
  jest.setTimeout(80_000)
}

/**
 * Makes sure, that the actual dmmf value and types are in match
 */
test('dmmf-types', async () => {
  const originalDisableHeavyTypingSupport =
    process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
  try {
    process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES = 'true'
    await testGeneratedClient('dmmf-types')()
    const datamodel = fs.readFileSync(path.join(__dirname, 'schema.prisma'), 'utf-8')
    const dmmf = await getDMMF({
      datamodel,
    })
    const dmmfFile = path.join(__dirname, 'generated-dmmf.ts')

    fs.writeFileSync(
      dmmfFile,
      `import type * as DMMF from '@prisma/dmmf'

  const dmmf: DMMF.Document = ${JSON.stringify(dmmf, null, 2)}`,
    )

    await expect(compileFile(dmmfFile)).resolves.not.toThrow()
  } finally {
    if (originalDisableHeavyTypingSupport === undefined) {
      delete process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
    } else {
      process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES = originalDisableHeavyTypingSupport
    }
  }
})
