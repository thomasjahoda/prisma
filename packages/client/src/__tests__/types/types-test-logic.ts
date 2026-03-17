import fs from 'node:fs'
import path from 'node:path'

import { getPackedPackage } from '@prisma/internals'
import tsd, { formatter } from 'tsd'

import { compileFile } from '../../utils/compileFile'
import { generateInFolder } from '../../utils/generateInFolder'

jest.setTimeout(300_000)

let packageSource: string
beforeAll(async () => {
  packageSource = (await getPackedPackage('@prisma/client')) as string
})

export async function runTest(testName: string, type: 'normal' | 'simplified') {
  const dir = path.join(__dirname, testName)
  const nodeModules = path.join(dir, 'node_modules')
  if (fs.existsSync(nodeModules)) {
    await fs.promises.rm(nodeModules, { force: true, recursive: true })
  }
  const originalDisableHeavyTypingSupport =
    process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES

  try {
    if (type === 'simplified') {
      process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES = 'true'
    } else {
      delete process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
    }

    await generateInFolder({
      projectDir: dir,
      packageSource,
    })
  } finally {
    if (originalDisableHeavyTypingSupport === undefined) {
      delete process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
    } else {
      process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES = originalDisableHeavyTypingSupport
    }
  }

  const indexPath = path.join(dir, 'test.ts')
  const tsdTestPath = path.join(dir, 'index.test-d.ts')
  const engineSpecificTestPath = path.join(dir, 'test.client.ts')

  if (fs.existsSync(tsdTestPath)) {
    await runTsd(dir)
  }

  if (testName.startsWith('unhappy')) {
    await expect(compileFile(indexPath)).rejects.toThrow()
  } else {
    await expect(compileFile(indexPath)).resolves.not.toThrow()
  }

  if (fs.existsSync(engineSpecificTestPath)) {
    if (testName.startsWith('unhappy')) {
      await expect(compileFile(engineSpecificTestPath)).rejects.toThrow()
    } else {
      await expect(compileFile(engineSpecificTestPath)).resolves.not.toThrow()
    }
  }
}

async function runTsd(dir: string) {
  const diagnostics = await tsd({
    cwd: dir,
    typingsFile: 'index.d.ts',
  })
  if (diagnostics && diagnostics.length > 0) {
    throw new Error(formatter(diagnostics))
  }
}
