import fs from 'fs'
import path from 'path'
import { runTest } from './types-test-logic'

describe('valid types', () => {
  describe('normal', () => {
    const subDirs = getSubDirs(__dirname)
    const subDirNames = subDirs.map((dir) => path.basename(dir))
    test.concurrent.each(subDirNames)(`%s`, async (testName) => {
      await runTest(testName, 'normal')
    })
  })

  describe('simplified', () => {
    const testsExpectingStrictArgValidation = new Set(['select-and-include-mutual-exclusion'])
    const subDirs = getSubDirs(__dirname)
    const subDirNames = subDirs
      .map((dir) => path.basename(dir))
      // Simplified mode intentionally drops SelectSubset-based strict arg validation.
      .filter((testName) => !testsExpectingStrictArgValidation.has(testName))
    test.concurrent.each(subDirNames)(`%s`, async (testName) => {
      await runTest(testName, 'simplified')
    })
  })
})

function getSubDirs(dir: string): string[] {
  const files = fs.readdirSync(dir)
  return files
    .map((file) => path.join(dir, file))
    .filter((file) => fs.lstatSync(file).isDirectory())
    .filter((file) => fs.existsSync(path.join(file, 'test.ts')) || fs.existsSync(path.join(file, 'index.test-d.ts')))
}
