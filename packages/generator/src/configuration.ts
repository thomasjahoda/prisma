import type * as DMMF from '@prisma/dmmf'

import { SqlQueryOutput } from './typedSql'

export type ConstrainedByModelConfig = {
  whitelist?: string[]
  // blacklist?: string[]
}

export type ClientTypingSimplifications = {
  /**
   * Removes typing support for the following features:
   * - extensions
   * - composite types (available in MongoDB only)
   * - omitApi: local (via Args) and global omit (via ClientOptions)
   * - SelectSubset in delegate args (replaced with TypeFestExact workaround by default in simplified mode)
   *   Set PRISMA_HACK_GENERATOR_CONFIG_DISABLE_WORKAROUND_FOR_INTELLIJ_NON_SERVICE_POWERED_ENGINE=true
   *   to keep the original SelectSubset behavior for those delegate args.
   *
   * Removes a lot of generics, conditional types and complexity from the generated client typings.
   * Uses runtime 'exported-simplified' types over 'exported' types whenever available.
   */
  // disableExtensionsAndCompositesAndOmit: boolean // TODO [simplification] naming
  disableTypingSupportForHeavyFeatures: boolean
  featureConstraints?: {
    groupBy?: ConstrainedByModelConfig
    distinct?: ConstrainedByModelConfig
    // TODO [simplification] add possibility to disable more features? or just reducing complexity of type-system enough?
  }
}

export interface GeneratorConfig {
  name: string
  output: EnvValue | null
  isCustomOutput?: boolean
  provider: EnvValue
  config: {
    /** `output` is a reserved name and will only be available directly at `generator.output` */
    output?: never
    /** `provider` is a reserved name and will only be available directly at `generator.provider` */
    provider?: never
    /** `binaryTargets` is a reserved name and will only be available directly at `generator.binaryTargets` */
    binaryTargets?: never
    /** `previewFeatures` is a reserved name and will only be available directly at `generator.previewFeatures` */
    previewFeatures?: never
    /** `clientTypingSimplifications` is a reserved name and will only be available directly at `generator.clientTypingSimplifications` */
    clientTypingSimplifications?: never
  } & {
    [key: string]: string | string[] | undefined
  }
  binaryTargets: BinaryTargetsEnvValue[]
  // TODO why is this not optional?
  previewFeatures: string[]
  /**
   * Optional settings to simplify the generated client typings.
   */
  clientTypingSimplifications?: ClientTypingSimplifications
  envPaths?: EnvPaths
  sourceFilePath: string
}

export interface EnvValue {
  fromEnvVar: null | string
  value: null | string
}

export interface BinaryTargetsEnvValue {
  fromEnvVar: string | null
  value: string
  native?: boolean
}

export type ConnectorType =
  | 'mysql'
  | 'mongodb'
  | 'sqlite'
  | 'postgresql'
  | 'postgres' // TODO: we could normalize postgres to postgresql this in engines to reduce the complexity?
  | 'prisma+postgres' // Note: used for Prisma Postgres, managed by PDP
  | 'sqlserver'
  | 'cockroachdb'

export type ActiveConnectorType = Exclude<ConnectorType, 'postgres' | 'prisma+postgres'>

export interface DataSource {
  name: string
  provider: ConnectorType
  // In Rust, this comes from `Connector::provider_name()`
  activeProvider: ActiveConnectorType
  url: EnvValue
  directUrl?: EnvValue
  schemas: string[] | []
  sourceFilePath: string
}

export type BinaryPaths = {
  schemaEngine?: { [binaryTarget: string]: string } // key: target, value: path
  queryEngine?: { [binaryTarget: string]: string }
  libqueryEngine?: { [binaryTarget: string]: string }
}

export type EnvPaths = {
  rootEnvPath: string | null
  schemaEnvPath: string | undefined
}

/** The options passed to the generator implementations */
export type GeneratorOptions = {
  generator: GeneratorConfig
  // TODO: what is otherGenerators for?
  otherGenerators: GeneratorConfig[]
  schemaPath: string
  dmmf: DMMF.Document
  datasources: DataSource[]
  // TODO deprecate datamodel & rename to schema?
  datamodel: string
  // TODO is it really always version hash? Feature is unclear.
  version: string // version hash
  binaryPaths?: BinaryPaths
  postinstall?: boolean
  noEngine?: boolean
  noHints?: boolean
  allowNoModels?: boolean
  envPaths?: EnvPaths
  typedSql?: SqlQueryOutput[]
}

export type EngineType = 'queryEngine' | 'libqueryEngine' | 'schemaEngine'

export type GeneratorManifest = {
  prettyName?: string
  defaultOutput?: string
  denylists?: {
    models?: string[]
    fields?: string[]
  }
  requiresGenerators?: string[]
  requiresEngines?: EngineType[]
  version?: string
  requiresEngineVersion?: string
}
