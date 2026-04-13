import { readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { execa } from 'execa'

const referenceCommentPattern = /\/\/\s*type-check-benchmark-instantiations:\s*(\d+)\s*$/m

export type TypeCheckingBenchmarkExecutionResult = {
  instantiations: number
  durationSeconds: number
  referencedInstantiations?: number
}

export async function executeTypeCheckingBenchmarkForEntrypointFile({
  cwd,
  entrypointFile,
  updateSnapshots,
}: {
  cwd: string
  entrypointFile: string
  updateSnapshots: boolean
}): Promise<TypeCheckingBenchmarkExecutionResult> {
  const entrypointPath = join(cwd, entrypointFile)
  const source = await readFile(entrypointPath, 'utf8')
  const referencedInstantiations = readReferencedInstantiations(source)
  const temporaryTsconfigFile = `.tmp.${basename(entrypointFile, '.ts')}.tsconfig.json`
  const temporaryTsconfigPath = join(cwd, temporaryTsconfigFile)

  await writeFile(
    temporaryTsconfigPath,
    `${JSON.stringify(
      {
        extends: './tsconfig.json',
        include: [entrypointFile],
      },
      null,
      2,
    )}\n`,
  )

  try {
    const { exitCode, stderr, stdout } = await execa(
      'pnpm',
      ['exec', 'tsc', '-p', temporaryTsconfigPath, '--noEmit', '--extendedDiagnostics', '--pretty', 'false'],
      {
        cwd,
        reject: false,
      },
    )
    const diagnosticsOutput = [stdout, stderr].filter(Boolean).join('\n')

    if (exitCode !== 0) {
      throw new Error(`Type checking failed for ${entrypointFile}\n${diagnosticsOutput}`)
    }

    const instantiations = parseInstantiations(diagnosticsOutput)
    const duration = parseDurationSeconds(diagnosticsOutput)
    console.log(`⛳ Result: ${instantiations} instantiations`)
    console.log(`⏱️ Duration: ${duration.toFixed(2)}s`)

    if (referencedInstantiations === undefined) {
      await writeReferenceComment(entrypointPath, source, instantiations)
      console.log(`📝 Recorded reference instantiations for ${entrypointFile}`)
      return {
        instantiations,
        durationSeconds: duration,
      }
    }

    console.log(`🎯 Reference: ${referencedInstantiations} instantiations`)

    if (instantiations === referencedInstantiations) {
      console.log('📊 Delta: 0.00%')
      return {
        instantiations,
        durationSeconds: duration,
        referencedInstantiations,
      }
    }

    const deltaPercentage = (((instantiations - referencedInstantiations) / referencedInstantiations) * 100).toFixed(2)

    if (updateSnapshots) {
      await writeReferenceComment(entrypointPath, source, instantiations)
      console.log(`📝 Updated reference instantiations from ${referencedInstantiations} to ${instantiations}`)
      console.log(`📊 Delta: ${deltaPercentage}%`)
      return {
        instantiations,
        durationSeconds: duration,
        referencedInstantiations,
      }
    }

    throw new Error(
      `Type-check benchmark mismatch for ${entrypointFile}: got ${instantiations}, expected ${referencedInstantiations} (${deltaPercentage}%).`,
    )
  } finally {
    await rm(temporaryTsconfigPath, { force: true })
  }
}

function parseInstantiations(diagnosticsOutput: string) {
  const match = diagnosticsOutput.match(/Instantiations:\s+(\d+)/)

  if (!match) {
    throw new Error(`Could not parse instantiations from tsc output:\n${diagnosticsOutput}`)
  }

  return Number(match[1])
}

function parseDurationSeconds(diagnosticsOutput: string) {
  const match = diagnosticsOutput.match(/Total time:\s+([\d.]+)s/)

  if (!match) {
    throw new Error(`Could not parse total time from tsc output:\n${diagnosticsOutput}`)
  }

  return Number(match[1])
}

function readReferencedInstantiations(source: string) {
  const match = source.match(referenceCommentPattern)
  return match ? Number(match[1]) : undefined
}

async function writeReferenceComment(entrypointPath: string, source: string, instantiations: number) {
  const referenceComment = `// type-check-benchmark-instantiations: ${instantiations}`

  if (referenceCommentPattern.test(source)) {
    await writeFile(entrypointPath, source.replace(referenceCommentPattern, referenceComment))
    return
  }

  const separator = source.endsWith('\n') ? '' : '\n'
  await writeFile(entrypointPath, `${source}${separator}${referenceComment}\n`)
}
