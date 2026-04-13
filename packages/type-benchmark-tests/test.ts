import { readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { execa } from 'execa'

import { executeTypeCheckingBenchmarkForEntrypointFile } from './typeCheckingBenchmarkExecution.js'

// @ts-ignore
const parentDir = dirname(fileURLToPath(import.meta.url))

const directoryBlockList = ['node_modules']
const benchmarkVariants = ['ts', 'ts-simplified', 'js', 'js-simplified'] as const
const typeCheckReferenceCommentPattern = /\/\/\s*type-check-benchmark-instantiations:\s*(\d+)\s*$/m
const benchInstantiationPattern =
  /bench\(\s*(['"`])(?<benchmarkName>(?:\\.|(?!\1)[\s\S])*)\1\s*,[\s\S]*?\)\s*\.types\(\s*\[\s*(?<instantiations>\d+)\s*,\s*['"]instantiations['"]\s*\]\s*\)/g

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
  printInstantiationComparisonTable(instantiationMeasurements)

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

  try {
    if (benchFile.endsWith('.type-check-benchmark.ts')) {
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
    }

    await execa('tsx', [benchFile], {
      cwd,
      stdio: 'inherit',
      env: { ATTEST_updateSnapshots: updateSnapshots ? 'true' : 'false' },
    })

    return {
      directory: benchmarkPath,
      success: true,
      instantiationMeasurements: await readBenchInstantiationMeasurementsFromFile({
        benchmarkFilePath: join(cwd, benchFile),
        benchFile,
        directoryInfo,
      }),
    }
  } catch (error) {
    console.error(error)
    return {
      directory: benchmarkPath,
      success: false,
      instantiationMeasurements: await readInstantiationMeasurementsFromSourceFallback({
        benchFile,
        cwd,
        directoryInfo,
      }),
    }
  }
}

async function readInstantiationMeasurementsFromSourceFallback({
  benchFile,
  cwd,
  directoryInfo,
}: {
  benchFile: string
  cwd: string
  directoryInfo: BenchmarkDirectoryInfo
}): Promise<InstantiationMeasurement[]> {
  try {
    if (benchFile.endsWith('.type-check-benchmark.ts')) {
      const source = await readFile(join(cwd, benchFile), 'utf8')
      const instantiations = readTypeCheckReferenceInstantiations(source)

      if (instantiations === undefined) {
        return []
      }

      return [
        {
          group: directoryInfo.group,
          variant: directoryInfo.variant,
          testCase: benchFile,
          instantiations,
        },
      ]
    }

    return await readBenchInstantiationMeasurementsFromFile({
      benchmarkFilePath: join(cwd, benchFile),
      benchFile,
      directoryInfo,
    })
  } catch {
    return []
  }
}

async function readBenchInstantiationMeasurementsFromFile({
  benchmarkFilePath,
  benchFile,
  directoryInfo,
}: {
  benchmarkFilePath: string
  benchFile: string
  directoryInfo: BenchmarkDirectoryInfo
}): Promise<InstantiationMeasurement[]> {
  const source = await readFile(benchmarkFilePath, 'utf8')
  return parseBenchInstantiationMeasurementsFromSource(source, benchFile, directoryInfo)
}

function parseBenchInstantiationMeasurementsFromSource(
  source: string,
  benchFile: string,
  directoryInfo: BenchmarkDirectoryInfo,
): InstantiationMeasurement[] {
  const measurements: InstantiationMeasurement[] = []

  for (const match of source.matchAll(benchInstantiationPattern)) {
    const benchmarkName = match.groups?.benchmarkName
    const instantiationsRaw = match.groups?.instantiations

    if (!benchmarkName || !instantiationsRaw) {
      continue
    }

    const instantiations = Number(instantiationsRaw)
    if (!Number.isFinite(instantiations)) {
      continue
    }

    measurements.push({
      group: directoryInfo.group,
      variant: directoryInfo.variant,
      testCase: `${benchFile} "${benchmarkName}"`,
      instantiations,
    })
  }

  return measurements
}

function readTypeCheckReferenceInstantiations(source: string) {
  const match = source.match(typeCheckReferenceCommentPattern)
  return match ? Number(match[1]) : undefined
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

function printInstantiationComparisonTable(measurements: InstantiationMeasurement[]) {
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

    return a.testCase.localeCompare(b.testCase)
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
  console.log(lines.join('\n'))
  console.log('========================')
}

function formatInstantiationCount(instantiations: number | undefined) {
  if (instantiations === undefined) {
    return '-'
  }

  return instantiations.toLocaleString('en-US')
}
