import { ActiveConnectorType, GeneratorConfig } from '@prisma/generator'

import { DMMFHelper } from '../dmmf'
import { GenericArgsInfo } from '../GenericsArgsInfo'
import { DefaultArgsAliases } from './DefaultArgsAliases'

export interface GenerateContextOptions {
  dmmf: DMMFHelper
  genericArgsInfo: GenericArgsInfo
  generator?: GeneratorConfig
  provider: ActiveConnectorType
  defaultArgsAliases: DefaultArgsAliases
}

export class GenerateContext implements GenerateContextOptions {
  dmmf: DMMFHelper
  genericArgsInfo: GenericArgsInfo
  generator?: GeneratorConfig
  provider: ActiveConnectorType
  defaultArgsAliases: DefaultArgsAliases

  constructor({ dmmf, genericArgsInfo, generator, provider, defaultArgsAliases }: GenerateContextOptions) {
    this.dmmf = dmmf
    this.genericArgsInfo = genericArgsInfo
    this.generator = generator
    this.provider = provider
    this.defaultArgsAliases = defaultArgsAliases
  }

  isPreviewFeatureOn(previewFeature: string): boolean {
    return this.generator?.previewFeatures?.includes(previewFeature) ?? false
  }

  isSqlProvider(): boolean {
    return this.provider !== 'mongodb'
  }

  isTypingSupportForHeavyFeaturesEnabled(): boolean {
    return isTypingSupportForHeavyFeaturesEnabled(this.generator)
  }
}

export function isTypingSupportForHeavyFeaturesEnabled(generator: GeneratorConfig | undefined): boolean {
  return generator?.clientTypingSimplifications?.disableTypingSupportForHeavyFeatures !== true
}
