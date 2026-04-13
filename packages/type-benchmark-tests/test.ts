import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { execa } from 'execa'
import { format as formatWithPrettier } from 'prettier'

import {
  TypeCheckingBenchmarkExecutionError,
  executeTypeCheckingBenchmarkForEntrypointFile,
} from './typeCheckingBenchmarkExecution.js'

// @ts-ignore
const parentDir = dirname(fileURLToPath(import.meta.url))

const directoryBlockList = ['node_modules']
const benchmarkVariants = ['ts', 'ts-simplified', 'js', 'js-simplified'] as const
const benchStartLinePattern = /^🏌️\s+(.+)$/u
const resultLinePattern = /^⛳ Result:\s+([\d,]+)\s+instantiations$/u

type BenchmarkVariant = (typeof benchmarkVariants)[number]

type BenchmarkDirectoryInfo = {
  directory: string
  group: string
  variant: BenchmarkVariant
}

type InstantiationMeasurement = {
  group: string
  variant: BenchmarkVariant
  testCase: string
  instantiations: number
}

type BenchmarkRunResult = {
  directory: string
  success: boolean
  skipped?: boolean
  instantiationMeasurements: InstantiationMeasurement[]
}

async function main() {
  const directories = getTestDirectories()
  const updateSnapshots = shouldUpdateSnapshots()
  const { shouldOnlyGenerate, shouldSkipGenerate } = getGenerateOptions()
  const testFilter = getTestFilter()

  const results: BenchmarkRunResult[] = []
  const instantiationMeasurements: InstantiationMeasurement[] = []

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

      const directoryInfo = parseBenchmarkDirectoryInfo(dir)

      for (const benchFile of benchFiles) {
        const result = await runBenchmark({
          benchFile,
          cwd,
          updateSnapshots,
          directoryInfo,
        })

        if (!result.success) {
          hasAnyFailure = true
        }

        instantiationMeasurements.push(...result.instantiationMeasurements)
        results.push(result)
      }
    } catch (error) {
      hasAnyFailure = true
      results.push({
        directory: `${dir}/*`,
        success: false,
        instantiationMeasurements: [],
      })
    }
  }

  if (testFilter && matchedBenchmarkCount === 0) {
    console.error(`No benchmark files matched filter: ${testFilter}`)
    process.exit(1)
  }

  printResults(results, updateSnapshots)
  await printInstantiationComparisonTable(instantiationMeasurements)

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
    .sort((a, b) => {
      const aIsTypeCheckBenchmark = a.endsWith('.type-check-benchmark.ts')
      const bIsTypeCheckBenchmark = b.endsWith('.type-check-benchmark.ts')

      if (aIsTypeCheckBenchmark !== bIsTypeCheckBenchmark) {
        return aIsTypeCheckBenchmark ? -1 : 1
      }

      return a.localeCompare(b)
    })
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

function parseBenchmarkDirectoryInfo(directory: string): BenchmarkDirectoryInfo {
  if (directory.endsWith('-ts-simplified')) {
    return {
      directory,
      group: directory.slice(0, -'-ts-simplified'.length),
      variant: 'ts-simplified',
    }
  }

  if (directory.endsWith('-js-simplified')) {
    return {
      directory,
      group: directory.slice(0, -'-js-simplified'.length),
      variant: 'js-simplified',
    }
  }

  if (directory.endsWith('-js')) {
    return {
      directory,
      group: directory.slice(0, -'-js'.length),
      variant: 'js',
    }
  }

  return {
    directory,
    group: directory,
    variant: 'ts',
  }
}

async function runBenchmark({
  benchFile,
  cwd,
  updateSnapshots,
  directoryInfo,
}: {
  benchFile: string
  cwd: string
  updateSnapshots: boolean
  directoryInfo: BenchmarkDirectoryInfo
}): Promise<BenchmarkRunResult> {
  const benchmarkPath = `${directoryInfo.directory}/${benchFile}`
  console.log(`Running ${benchmarkPath}...`)

  if (benchFile.endsWith('.type-check-benchmark.ts')) {
    try {
      const executionResult = await executeTypeCheckingBenchmarkForEntrypointFile({
        cwd,
        entrypointFile: benchFile,
        updateSnapshots,
      })

      return {
        directory: benchmarkPath,
        success: true,
        instantiationMeasurements: [
          {
            group: directoryInfo.group,
            variant: directoryInfo.variant,
            testCase: benchFile,
            instantiations: executionResult.instantiations,
          },
        ],
      }
    } catch (error) {
      console.error(error)

      if (error instanceof TypeCheckingBenchmarkExecutionError && error.kind === 'instantiation-mismatch') {
        const instantiations = error.metadata.instantiations
        return {
          directory: benchmarkPath,
          success: false,
          instantiationMeasurements:
            instantiations === undefined
              ? []
              : [
                  {
                    group: directoryInfo.group,
                    variant: directoryInfo.variant,
                    testCase: benchFile,
                    instantiations,
                  },
                ],
        }
      }

      // For actual type-checking failures, do not report instantiation counts.
      return {
        directory: benchmarkPath,
        success: false,
        instantiationMeasurements: [],
      }
    }
  }

  const benchRun = execa('tsx', [benchFile], {
    cwd,
    env: { ATTEST_updateSnapshots: updateSnapshots ? 'true' : 'false' },
    reject: false,
    all: true,
  })

  const streamedOutputChunks: string[] = []
  benchRun.all?.on('data', (chunk) => {
    const text = chunk.toString()
    streamedOutputChunks.push(text)
    process.stdout.write(text)
  })

  const { exitCode, stdout, stderr } = await benchRun
  const outputText = getCombinedCommandOutput({
    streamedOutputChunks,
    stdout,
    stderr,
  })

  return {
    directory: benchmarkPath,
    success: exitCode === 0,
    instantiationMeasurements: parseBenchInstantiationMeasurementsFromOutput({
      outputText,
      benchFile,
      directoryInfo,
    }),
  }
}

function getCombinedCommandOutput({
  streamedOutputChunks,
  stdout,
  stderr,
}: {
  streamedOutputChunks: string[]
  stdout: string
  stderr: string
}) {
  if (streamedOutputChunks.length > 0) {
    return streamedOutputChunks.join('')
  }

  // Fallback for environments where `all` stream is unavailable.
  return [stdout, stderr].filter(Boolean).join('\n')
}

function parseBenchInstantiationMeasurementsFromOutput({
  outputText,
  benchFile,
  directoryInfo,
}: {
  outputText: string
  benchFile: string
  directoryInfo: BenchmarkDirectoryInfo
}): InstantiationMeasurement[] {
  const measurements: InstantiationMeasurement[] = []
  const lines = outputText.split(/\r?\n/)
  let currentBenchmarkName: string | null = null

  for (const rawLine of lines) {
    const line = stripAnsi(rawLine).trim()

    const benchStartMatch = line.match(benchStartLinePattern)
    if (benchStartMatch) {
      currentBenchmarkName = benchStartMatch[1]
      continue
    }

    const resultMatch = line.match(resultLinePattern)
    if (!resultMatch || !currentBenchmarkName) {
      continue
    }

    const instantiations = Number(resultMatch[1].replaceAll(',', ''))
    if (!Number.isFinite(instantiations)) {
      continue
    }

    measurements.push({
      group: directoryInfo.group,
      variant: directoryInfo.variant,
      testCase: `${benchFile} "${currentBenchmarkName}"`,
      instantiations,
    })
  }

  return measurements
}

function stripAnsi(text: string) {
  return text.replace(/\u001B\[[0-9;]*m/g, '')
}

function printResults(results: BenchmarkRunResult[], updateSnapshots: boolean) {
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

async function printInstantiationComparisonTable(measurements: InstantiationMeasurement[]) {
  if (measurements.length === 0) {
    return
  }

  const rowsByKey = new Map<string, { group: string; testCase: string } & Partial<Record<BenchmarkVariant, number>>>()

  for (const measurement of measurements) {
    const key = `${measurement.group}\u0000${measurement.testCase}`
    const row = rowsByKey.get(key) ?? {
      group: measurement.group,
      testCase: measurement.testCase,
    }

    row[measurement.variant] = measurement.instantiations
    rowsByKey.set(key, row)
  }

  const sortedRows = Array.from(rowsByKey.values()).sort((a, b) => {
    const groupOrder = a.group.localeCompare(b.group)
    if (groupOrder !== 0) {
      return groupOrder
    }

    return compareTestCases(a.testCase, b.testCase)
  })

  const lines = [
    '| group | test-case | ts | ts-simplified | js | js-simplified |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...sortedRows
      .map((row) => {
        return [
          row.group,
          row.testCase,
          formatInstantiationCount(row.ts),
          formatInstantiationCount(row['ts-simplified']),
          formatInstantiationCount(row.js),
          formatInstantiationCount(row['js-simplified']),
        ].join(' | ')
      })
      .map((line) => `| ${line} |`),
  ]

  console.log('\nInstantiation Count Comparison:')
  console.log('========================')
  console.log('')
  const markdownTable = lines.join('\n')
  const formattedMarkdownTable = await formatWithPrettier(markdownTable, {
    parser: 'markdown',
  })

  console.log(formattedMarkdownTable.trimEnd())
  console.log('')
  console.log('========================')
}

function formatInstantiationCount(instantiations: number | undefined) {
  if (instantiations === undefined) {
    return '-'
  }

  return instantiations.toLocaleString('en-US')
}

function compareTestCases(a: string, b: string) {
  const parsedA = parseTestCase(a)
  const parsedB = parseTestCase(b)

  if (parsedA.isTypeCheck !== parsedB.isTypeCheck) {
    return parsedA.isTypeCheck ? -1 : 1
  }

  const fileOrder = parsedA.fileName.localeCompare(parsedB.fileName)
  if (fileOrder !== 0) {
    return fileOrder
  }

  const benchmarkNameOrder = (parsedA.benchmarkName ?? '').localeCompare(parsedB.benchmarkName ?? '')
  if (benchmarkNameOrder !== 0) {
    return benchmarkNameOrder
  }

  return a.localeCompare(b)
}

function parseTestCase(testCase: string) {
  const match = testCase.match(/^(?<fileName>.+?)\s+"(?<benchmarkName>[\s\S]*)"$/)
  const fileName = match?.groups?.fileName ?? testCase
  const benchmarkName = match?.groups?.benchmarkName

  return {
    fileName,
    benchmarkName,
    isTypeCheck: fileName.endsWith('.type-check-benchmark.ts'),
  }
}
