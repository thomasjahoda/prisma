import * as ts from '@prisma/ts-builders'

import { ModuleFormat } from '../../module-format'
import { GenerateContext } from '../GenerateContext'
import { modelExports } from '../ModelExports'
import { getPrismaClientClassDocComment } from '../PrismaClient'
import { TSClientOptions } from '../TSClient'

const jsDocHeader = `/*
 * This file should be your main import to use Prisma. Through it you get access to all the models, enums, and input types.
 * If you're looking for something you can import in the client-side of your application, please refer to the \`browser.ts\` file instead.
 *
 * 🟢 You can import this file directly.
 */
`

export function createClientFile(context: GenerateContext, options: TSClientOptions): string {
  const imports = [
    ts.moduleImport(context.runtimeImport).asNamespace('runtime'),
    ts.moduleImport(context.importFileName('./enums')).asNamespace('$Enums'),
    ts.moduleImport(context.importFileName('./internal/class')).asNamespace('$Class'),
    ts.moduleImport(context.importFileName('./internal/prismaNamespace')).asNamespace('Prisma'),
  ].map((i) => ts.stringify(i))

  const exports = [
    ts.moduleExportFrom(context.importFileName('./enums')).asNamespace('$Enums'),
    ts.moduleExportFrom(context.importFileName('./enums')),
    ts
      .moduleExport(ts.constDeclaration('PrismaClient').setValue(ts.functionCall('$Class.getPrismaClientClass', [])))
      .setDocComment(getPrismaClientClassDocComment(context)),
    ts.moduleExport(
      (() => {
        const prismaClient = ts.typeDeclaration('PrismaClient', ts.namedType('$Class.PrismaClient'))
        prismaClient.type.addGenericArgument(ts.namedType('LogOpts'))
        prismaClient.addGenericParameter(
          ts.genericParameter('LogOpts').extends(ts.namedType('Prisma.LogLevel')).default(ts.neverType),
        )

        if (context.isTypingSupportForHeavyFeaturesEnabled()) {
          prismaClient.type.addGenericArgument(ts.namedType('OmitOpts'))
          prismaClient.type.addGenericArgument(ts.namedType('ExtArgs'))
          prismaClient.addGenericParameter(
            ts
              .genericParameter('OmitOpts')
              .extends(ts.namedType('Prisma.PrismaClientOptions').subKey('omit'))
              .default(ts.namedType('Prisma.PrismaClientOptions').subKey('omit')),
          )
          prismaClient.addGenericParameter(
            ts
              .genericParameter('ExtArgs')
              .extends(ts.namedType('runtime.Types.Extensions.InternalArgs'))
              .default(ts.namedType('runtime.Types.Extensions.DefaultArgs')),
          )
        }

        return prismaClient
      })(),
    ),
  ].map((e) => ts.stringify(e))

  return `${jsDocHeader}
${buildPreamble(options.edge, options.moduleFormat)}
${imports.join('\n')}

${exports.join('\n')}
export { Prisma }

${modelExports(context).join('\n')}
`
}

function buildPreamble(edge: boolean, moduleFormat: ModuleFormat): string {
  if (edge) {
    return `\
globalThis['__dirname'] = '/'
`
  }

  let preamble = `\
import * as process from 'node:process'
import * as path from 'node:path'
`

  if (moduleFormat === 'esm') {
    preamble += `\
import { fileURLToPath } from 'node:url'
globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))
`
  }

  return preamble
}
