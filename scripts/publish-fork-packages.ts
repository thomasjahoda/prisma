import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { execa } from 'execa'
import semver from 'semver'

type PackageSpec = {
  sourceName: string
  targetName: string
  packageDir: string
}

type PublishContext = {
  baseVersion: string
  dryRun: boolean
  keepStaging: boolean
  otp?: string
  registry?: string
  stageRoot: string
  tag: string
  targetVersion: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    version: {
      type: 'string',
    },
    'base-version': {
      type: 'string',
    },
    tag: {
      type: 'string',
      default: 'latest',
    },
    scope: {
      type: 'string',
      default: 'thomasjahoda-forks',
    },
    'dry-run': {
      type: 'boolean',
      default: false,
    },
    'skip-build': {
      type: 'boolean',
      default: false,
    },
    'keep-staging': {
      type: 'boolean',
      default: false,
    },
    otp: {
      type: 'string',
    },
    registry: {
      type: 'string',
    },
    'stage-dir': {
      type: 'string',
    },
  },
})

const scope = normalizeScope(values.scope)
const baseVersion = values['base-version']
const targetVersion = values.version ?? createDefaultVersion(baseVersion)
const stageRoot =
  values['stage-dir'] === undefined
    ? path.join(os.tmpdir(), `prisma-fork-publish-${targetVersion.replace(/[^a-zA-Z0-9.-]+/g, '-')}`)
    : path.resolve(repoRoot, values['stage-dir'])

const nameMap = new Map<string, string>([
  ['@prisma/client', `${scope}/prisma-client`],
  ['@prisma/generator', `${scope}/prisma-generator`],
  ['@prisma/internals', `${scope}/prisma-internals`],
  ['prisma', `${scope}/prisma`],
])

const packageSpecs: PackageSpec[] = [
  {
    sourceName: '@prisma/internals',
    targetName: nameMap.get('@prisma/internals')!,
    packageDir: path.join(repoRoot, 'packages', 'internals'),
  },
  {
    sourceName: '@prisma/client',
    targetName: nameMap.get('@prisma/client')!,
    packageDir: path.join(repoRoot, 'packages', 'client'),
  },
  {
    sourceName: '@prisma/generator',
    targetName: nameMap.get('@prisma/generator')!,
    packageDir: path.join(repoRoot, 'packages', 'generator'),
  },
  {
    sourceName: 'prisma',
    targetName: nameMap.get('prisma')!,
    packageDir: path.join(repoRoot, 'packages', 'cli'),
  },
]

async function main() {
  if (baseVersion === undefined) {
    throw new Error('Missing required option --base-version, for example --base-version 7.6.0-dev.6')
  }

  if (!semver.valid(targetVersion)) {
    throw new Error(`Version ${JSON.stringify(targetVersion)} is not valid semver`)
  }

  if (!semver.valid(baseVersion)) {
    throw new Error(`Base version ${JSON.stringify(baseVersion)} is not valid semver`)
  }

  const context: PublishContext = {
    baseVersion,
    dryRun: values['dry-run'],
    keepStaging: values['keep-staging'] || values['dry-run'],
    otp: values.otp,
    registry: values.registry,
    stageRoot,
    tag: values.tag,
    targetVersion,
  }

  console.log(`Publishing Prisma fork packages under ${scope}`)
  console.log(`Version: ${context.targetVersion}`)
  console.log(`Base version: ${context.baseVersion}`)
  console.log(`Tag: ${context.tag}`)
  console.log(`Stage root: ${context.stageRoot}`)
  if (context.dryRun) {
    console.log('Dry run: npm publish will not write anything to the registry')
  }

  await prepareStageRoot(context.stageRoot)

  try {
    if (!values['skip-build']) {
      console.log('\nBuilding workspace...')
      await runCommand('pnpm', ['build'], { cwd: repoRoot })
    }

    const stagedPackages: Array<{ spec: PackageSpec; stagedDir: string }> = []
    for (const spec of packageSpecs) {
      const stagedDir = await stagePackage(spec, context)
      stagedPackages.push({ spec, stagedDir })
    }

    console.log('\nStaged packages:')
    for (const { spec, stagedDir } of stagedPackages) {
      console.log(`- ${spec.sourceName} -> ${spec.targetName} (${stagedDir})`)
    }

    for (const { spec, stagedDir } of stagedPackages) {
      await publishPackage(spec, stagedDir, context)
    }
  } finally {
    if (context.keepStaging) {
      console.log(`\nKept staged packages at ${context.stageRoot}`)
    } else {
      await rm(context.stageRoot, { force: true, recursive: true })
    }
  }
}

async function prepareStageRoot(stageDir: string) {
  try {
    const entries = await readdir(stageDir)
    if (entries.length > 0) {
      throw new Error(`Stage directory ${stageDir} already exists and is not empty`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  await rm(stageDir, { force: true, recursive: true })
  await runCommand('mkdir', ['-p', stageDir], { cwd: repoRoot })
}

async function stagePackage(spec: PackageSpec, context: PublishContext): Promise<string> {
  console.log(`\nPacking ${spec.sourceName}...`)

  const tarballDir = path.join(context.stageRoot, 'tarballs', safeDirName(spec.targetName))
  const extractRoot = path.join(context.stageRoot, 'packages', safeDirName(spec.targetName))
  await runCommand('mkdir', ['-p', tarballDir], { cwd: repoRoot })
  await runCommand('mkdir', ['-p', extractRoot], { cwd: repoRoot })

  await runCommand('pnpm', ['pack', '--pack-destination', tarballDir], { cwd: spec.packageDir })

  const tarballs = (await readdir(tarballDir)).filter((entry) => entry.endsWith('.tgz'))
  if (tarballs.length !== 1) {
    throw new Error(`Expected exactly one tarball for ${spec.sourceName}, found ${tarballs.length}`)
  }

  const tarballPath = path.join(tarballDir, tarballs[0])
  await runCommand('tar', ['-xzf', tarballPath, '-C', extractRoot], { cwd: repoRoot })

  const stagedDir = path.join(extractRoot, 'package')
  await rewriteManifest(stagedDir, spec, context)

  return stagedDir
}

async function rewriteManifest(stagedDir: string, spec: PackageSpec, context: PublishContext) {
  const packageJsonPath = path.join(stagedDir, 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))

  packageJson.name = spec.targetName
  packageJson.version = context.targetVersion
  packageJson.dependencies = rewriteDependencyVersions(packageJson.dependencies, context.baseVersion)
  packageJson.devDependencies = rewriteDependencyVersions(packageJson.devDependencies, context.baseVersion)
  packageJson.optionalDependencies = rewriteDependencyVersions(packageJson.optionalDependencies, context.baseVersion)
  packageJson.peerDependencies = rewriteDependencyVersions(packageJson.peerDependencies, context.baseVersion)
  packageJson.peerDependenciesMeta = rewriteDependencyVersions(packageJson.peerDependenciesMeta, context.baseVersion)
  packageJson.publishConfig = {
    ...packageJson.publishConfig,
    access: 'public',
  }

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

function rewriteDependencyVersions<T extends Record<string, unknown> | undefined>(section: T, baseVersion: string): T {
  if (section === undefined) {
    return section
  }

  const rewritten = Object.entries(section).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[key] = rewriteDependencyValue(value, baseVersion)
    return acc
  }, {})

  return rewritten as T
}

function rewriteDependencyValue(value: unknown, baseVersion: string): unknown {
  if (value === '0.0.0') {
    return baseVersion
  }

  return value
}

async function publishPackage(spec: PackageSpec, stagedDir: string, context: PublishContext) {
  console.log(`\nPublishing ${spec.targetName}@${context.targetVersion}...`)

  const args = [
    'publish',
    '--access',
    'public',
    '--tag',
    context.tag,
    '--ignore-scripts',
    ...(context.dryRun ? ['--dry-run'] : []),
    ...(context.otp ? ['--otp', context.otp] : []),
    ...(context.registry ? ['--registry', context.registry] : []),
  ]

  await runCommand('npm', args, { cwd: stagedDir })
}

async function runCommand(command: string, args: string[], options: { cwd: string }) {
  await execa(command, args, {
    cwd: options.cwd,
    stdio: 'inherit',
  })
}

function createDefaultVersion(baseVersion: string | undefined): string {
  if (baseVersion === undefined) {
    throw new Error('Cannot generate a default version without --base-version')
  }

  const normalizedBaseVersion = semver.parse(baseVersion)?.version
  if (normalizedBaseVersion === undefined) {
    throw new Error(`Base version ${JSON.stringify(baseVersion)} is not valid semver`)
  }

  const now = new Date()
  const parts = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ]

  return `${normalizedBaseVersion}-fork.${parts.join('')}`
}

function normalizeScope(input: string): string {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error('Scope cannot be empty')
  }

  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}

function safeDirName(packageName: string): string {
  return packageName.replace(/[\\/]/g, '__')
}

void main().catch(async (error) => {
  console.error(error)

  try {
    const stageInfo = await stat(stageRoot)
    if (stageInfo.isDirectory() && (values['keep-staging'] || values['dry-run'])) {
      console.error(`Staged files were kept at ${stageRoot}`)
    }
  } catch {}

  process.exitCode = 1
})
