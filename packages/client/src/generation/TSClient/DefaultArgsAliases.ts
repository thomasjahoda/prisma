import { GeneratorConfig } from '@prisma/generator-helper'

import * as ts from '../ts-builders'
import { extArgsParam } from '../utils'
import { isTypingSupportForHeavyFeaturesEnabled } from './GenerateContext'

type AliasDefinition = {
  newName: string
  legacyName: string
}

export class DefaultArgsAliases {
  private existingArgTypes = new Set<string>()
  private possibleAliases: AliasDefinition[] = []

  constructor(private generatorConfig: GeneratorConfig) {}

  addPossibleAlias(newName: string, legacyName: string) {
    this.possibleAliases.push({ newName, legacyName })
  }

  registerArgName(name: string) {
    this.existingArgTypes.add(name)
  }

  generateAliases() {
    const aliases: string[] = []
    for (const { newName, legacyName } of this.possibleAliases) {
      if (this.existingArgTypes.has(legacyName)) {
        // alias to and old name is not created if there
        // is already existing arg type with the same name
        continue
      }

      const type = ts.namedType(newName)
      if (isTypingSupportForHeavyFeaturesEnabled(this.generatorConfig)) {
        type.addGenericArgument(extArgsParam.toArgument())
      }

      const typeDeclaration = ts.typeDeclaration(legacyName, type)
      if (isTypingSupportForHeavyFeaturesEnabled(this.generatorConfig)) {
        typeDeclaration.addGenericParameter(extArgsParam)
      }

      aliases.push(
        ts.stringify(
          ts.moduleExport(typeDeclaration).setDocComment(ts.docComment(`@deprecated Use ${newName} instead`)),
          { indentLevel: 1 },
        ),
      )
    }

    return aliases.join('\n')
  }
}
