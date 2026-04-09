import fs from 'fs'
import path from 'path'
import { runTest } from './types-test-logic'

describe('valid types', () => {
  const subDirs = getSubDirs(__dirname)
  const subDirNames = subDirs.map((dir) => path.basename(dir))
  test.concurrent.each(subDirNames)(`%s`, async (testName) => {
    await runTest(testName, 'normal')
  })
})

function getSubDirs(dir: string): string[] {
  const files = fs.readdirSync(dir)
  return files
    .map((file) => path.join(dir, file))
    .filter((file) => fs.lstatSync(file).isDirectory())
    .filter((file) => fs.existsSync(path.join(file, 'test.ts')) || fs.existsSync(path.join(file, 'index.test-d.ts')))
}
