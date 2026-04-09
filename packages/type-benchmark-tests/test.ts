import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { execa } from 'execa'

import { executeTypeCheckingBenchmarkForEntrypointFile } from './typeCheckingBenchmarkExecution.js'

// @ts-ignore
const parentDir = dirname(fileURLToPath(import.meta.url))

const directoryBlockList = ['node_modules']

async function main() {
  const directories = getTestDirectories()
  const updateSnapshots = shouldUpdateSnapshots()
  const { shouldOnlyGenerate, shouldSkipGenerate } = getGenerateOptions()
  const testFilter = getTestFilter()

  const results: {
    directory: string
    success: boolean
    skipped?: boolean
  }[] = []

  let hasAnyFailure = false
  let matchedBenchmarkCount = 0

  for (const dir of directories) {
    const cwd = join(parentDir, dir)
    const benchFiles = getMatchingBenchmarkFiles(dir, testFilter)

    if (benchFiles.length === 0) {
      continue
    }

    matchedBenchmarkCount += benchFiles.length
    console.log(`\nProcessing directory: ${dir}`)

    try {
      if (!shouldSkipGenerate) {
        await runGenerate(dir, cwd)
      }
      if (shouldOnlyGenerate) continue

      for (const benchFile of benchFiles) {
        const result = await runBenchmark({ benchFile, cwd, updateSnapshots, dir })
        if (!result.success) {
          hasAnyFailure = true
        }
        results.push(result)
      }
    } catch (error) {
      hasAnyFailure = true
      results.push({
        directory: `${dir}/*`,
        success: false,
      })
    }
  }

  if (testFilter && matchedBenchmarkCount === 0) {
    console.error(`No benchmark files matched filter: ${testFilter}`)
    process.exit(1)
  }

  printResults(results, updateSnapshots)

  process.exit(hasAnyFailure ? 1 : 0)
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})

function shouldUpdateSnapshots() {
  const args = process.argv.slice(2)
  const updateSnapshots = args.includes('--u') || args.includes('--updateSnapshots')

  if (updateSnapshots) {
    console.log('ℹ️ 🎥 Updating snapshots...')
  }
  return updateSnapshots
}

function getGenerateOptions() {
  const args = process.argv.slice(2)
  const shouldOnlyGenerate = args.includes('--onlyGenerate')
  const shouldSkipGenerate = args.includes('--skipGenerate')

  if (shouldOnlyGenerate && shouldSkipGenerate) {
    throw new Error('Cannot run generate and skip generate at the same time')
  }

  return {
    shouldOnlyGenerate,
    shouldSkipGenerate,
  }
}

function getTestFilter() {
  const args = process.argv.slice(2)
  const filterArg = args.find((arg) => !arg.startsWith('--'))
  return filterArg
}

function getTestDirectories() {
  return readdirSync(parentDir).filter((item) => {
    const fullPath = join(parentDir, item)
    return statSync(fullPath).isDirectory() && !item.startsWith('.') && !directoryBlockList.includes(item)
  })
}

function getBenchmarkFiles(dir: string) {
  return readdirSync(dir)
    .filter((item) => {
      return (
        statSync(join(dir, item)).isFile() && (item.endsWith('.bench.ts') || item.endsWith('.type-check-benchmark.ts'))
      )
    })
    .sort()
}

function getMatchingBenchmarkFiles(dir: string, testFilter?: string) {
  const benchFiles = getBenchmarkFiles(dir)

  if (!testFilter) {
    return benchFiles
  }

  return benchFiles.filter((benchFile) => matchesTestFilter(dir, benchFile, testFilter))
}

function matchesTestFilter(dir: string, benchFile: string, testFilter: string) {
  return `${dir}/${benchFile}`.includes(testFilter)
}

async function runGenerate(dir: string, cwd: string) {
  console.log(`Running generate command in ${dir}...`)
  const originalDisableHeavyTypingSupport =
    process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
  // tsx sometimes crashes with stack overflow with the default stack size when
  // using `pnpm dev` instead of `pnpm build` in the workspace, which skips type
  // bundling and re-exports the types in `.d.ts` files from the raw TypeScript sources.
  try {
    if (usesSimplifiedTypingSupport(dir)) {
      process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES = 'true'
    } else {
      delete process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
    }

    await execa('tsx', ['--stack-size=2048', '../../cli/src/bin.ts', 'generate', '--no-hints'], {
      cwd,
      stdio: 'inherit',
      env: process.env,
    })
  } finally {
    if (originalDisableHeavyTypingSupport === undefined) {
      delete process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
    } else {
      process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES = originalDisableHeavyTypingSupport
    }
  }
}

function usesSimplifiedTypingSupport(dir: string) {
  return dir.endsWith('-js-simplified') || dir.endsWith('-ts-simplified')
}

async function runBenchmark({
  benchFile,
  cwd,
  updateSnapshots,
  dir,
}: {
  benchFile: string
  cwd: string
  updateSnapshots: boolean
  dir: string
}) {
  console.log(`Running ${dir}/${benchFile}...`)
  try {
    if (benchFile.endsWith('.type-check-benchmark.ts')) {
      await executeTypeCheckingBenchmarkForEntrypointFile({
        cwd,
        entrypointFile: benchFile,
        updateSnapshots,
      })
    } else {
      await execa('tsx', [benchFile], {
        cwd,
        stdio: 'inherit',
        env: { ATTEST_updateSnapshots: updateSnapshots ? 'true' : 'false' },
      })
    }
    return {
      directory: `${dir}/${benchFile}`,
      success: true,
    }
  } catch (error) {
    console.error(error)
    return {
      directory: `${dir}/${benchFile}`,
      success: false,
    }
  }
}

function printResults(results: { directory: string; success: boolean; skipped?: boolean }[], updateSnapshots: boolean) {
  console.log('\nResults:')
  console.log('========================')
  results.forEach((result) => {
    const status = result.skipped ? '⏩ Skipped' : result.success ? '✅ Success' : '❌ Failed'
    console.log(`${status} - ${result.directory}`)
  })
  console.log('========================')
  if (updateSnapshots) console.log('✅ 🎥 Updated snapshots')
  console.log('========================')
}
