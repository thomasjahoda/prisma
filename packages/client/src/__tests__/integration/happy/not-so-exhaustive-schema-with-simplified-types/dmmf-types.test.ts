import { ClientEngineType } from '@prisma/internals'
import fs from 'fs'
import path from 'path'

import { getDMMF } from '../../../../generation/getDMMF'
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
  // TODO [simplification] wip hack to be removed
  process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES = 'true'
  try {
    await testGeneratedClient(ClientEngineType.Binary)()
    const datamodel = fs.readFileSync(path.join(__dirname, 'schema.prisma'), 'utf-8')
    const dmmf = await getDMMF({
      datamodel,
    })
    const dmmfFile = path.join(__dirname, 'generated-dmmf.ts')

    fs.writeFileSync(
      dmmfFile,
      `import { DMMF } from '@prisma/generator-helper'

  const dmmf: DMMF.Document = ${JSON.stringify(dmmf, null, 2)}`,
    )

    await expect(compileFile(dmmfFile)).resolves.not.toThrow()
  } finally {
    delete process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
  }
})
