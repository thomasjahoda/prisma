import { capitalize, NonModelOperation, Operation, uncapitalize } from '@prisma/client-common'
import type * as DMMF from '@prisma/dmmf'
import type { DataSource } from '@prisma/generator'
import { assertNever } from '@prisma/internals'
import * as ts from '@prisma/ts-builders'
import indent from 'indent-string'

import {
  addExtArgsArgumentIfNeeded,
  getAggregateName,
  getCountAggregateOutputName,
  getFieldRefsTypeName,
  getGroupByName,
  getModelArgName,
  getPayloadName,
} from '../utils'
import { runtimeImportedType } from '../utils/runtimeImport'
import { TAB_SIZE } from './constants'
import type { Generable } from './Generable'
import { GenerateContext } from './GenerateContext'
import { globalOmitConfig } from './globalOmit'
import { TSClientOptions } from './TSClient'
import { getModelActions } from './utils/getModelActions'
import * as tsx from './utils/type-builders'

function clientTypeMapModelsDefinition(context: GenerateContext) {
  const meta = ts.objectType()

  const modelNames = context.dmmf.datamodel.models.map((m) => m.name)

  // `modelNames` can be empty if `generate --allow-no-models` is used.
  if (modelNames.length === 0) {
    meta.add(ts.property('modelProps', ts.neverType))
  } else {
    meta.add(ts.property('modelProps', ts.unionType(modelNames.map((name) => ts.stringLiteral(uncapitalize(name))))))
  }

  const isolationLevel = context.dmmf.hasEnumInNamespace('TransactionIsolationLevel', 'prisma')
    ? ts.namedType('Prisma.TransactionIsolationLevel')
    : ts.neverType
  meta.add(ts.property('txIsolationLevel', isolationLevel))

  const model = ts.objectType()

  model.addMultiple(
    modelNames.map((modelName) => {
      const entry = ts.objectType()
      entry.add(ts.property('payload', addExtArgsArgumentIfNeeded(ts.namedType(getPayloadName(modelName)), context)))
      // TODO [simplification] can I remove the whole TypeMap thing?
      entry.add(ts.property('fields', ts.namedType(`Prisma.${getFieldRefsTypeName(modelName)}`)))
      const actions = getModelActions(context.dmmf, modelName)
      if (context.isTypingSupportForHeavyFeaturesEnabled()) {
        // only necessary for extensions. Otherwise the types will be inlined
        const operations = ts.objectType()
        operations.addMultiple(
          actions.map((action) => {
            const operationType = ts.objectType()
            const argsType = `Prisma.${getModelArgName(modelName, action)}`
            operationType.add(ts.property('args', addExtArgsArgumentIfNeeded(ts.namedType(argsType), context)))
            operationType.add(ts.property('result', clientTypeMapModelsResultDefinition(modelName, action)))
            return ts.property(action, operationType)
          }),
        )
        entry.add(ts.property('operations', operations))
      }
      return ts.property(modelName, entry)
    }),
  )

  return ts
    .objectType()
    .add(ts.property('globalOmitOptions', ts.objectType().add(ts.property('omit', ts.namedType('GlobalOmitOptions')))))
    .add(ts.property('meta', meta))
    .add(ts.property('model', model))
}

export function clientTypeMapModelsResultDefinition(
  modelName: string,
  action: Exclude<Operation, `$${string}`>,
): ts.TypeBuilder {
  if (action === 'count')
    return ts.unionType([tsx.optional(ts.namedType(getCountAggregateOutputName(modelName))), ts.numberType])
  if (action === 'groupBy') return ts.array(tsx.optional(ts.namedType(getGroupByName(modelName))))
  if (action === 'aggregate') return tsx.optional(ts.namedType(getAggregateName(modelName)))
  if (action === 'findRaw') return ts.namedType('JsonObject')
  if (action === 'aggregateRaw') return ts.namedType('JsonObject')
  if (action === 'deleteMany') return ts.namedType('BatchPayload')
  if (action === 'createMany') return ts.namedType('BatchPayload')
  if (action === 'createManyAndReturn') return ts.array(payloadToResult(modelName))
  if (action === 'updateMany') return ts.namedType('BatchPayload')
  if (action === 'updateManyAndReturn') return ts.array(payloadToResult(modelName))
  if (action === 'findMany') return ts.array(payloadToResult(modelName))
  if (action === 'findFirst') return ts.unionType([payloadToResult(modelName), ts.nullType])
  if (action === 'findUnique') return ts.unionType([payloadToResult(modelName), ts.nullType])
  if (action === 'findFirstOrThrow') return payloadToResult(modelName)
  if (action === 'findUniqueOrThrow') return payloadToResult(modelName)
  if (action === 'create') return payloadToResult(modelName)
  if (action === 'update') return payloadToResult(modelName)
  if (action === 'upsert') return payloadToResult(modelName)
  if (action === 'delete') return payloadToResult(modelName)

  assertNever(action, `Unknown action: ${action}`)
}

function payloadToResult(modelName: string) {
  return ts.namedType('$Utils.PayloadToResult').addGenericArgument(ts.namedType(getPayloadName(modelName)))
}

function clientTypeMapOthersDefinition(context: GenerateContext) {
  const otherOperationsNames = context.dmmf.getOtherOperationNames().flatMap((name) => {
    const results = [`$${name}`]
    if (name === 'executeRaw' || name === 'queryRaw') {
      results.push(`$${name}Unsafe`)
    }

    if (name === 'queryRaw' && context.isPreviewFeatureOn('typedSql')) {
      results.push(`$queryRawTyped`)
    }

    return results
  })

  const argsResultMap = {
    $executeRaw: { args: '[query: TemplateStringsArray | Prisma.Sql, ...values: any[]]', result: 'any' },
    $queryRaw: { args: '[query: TemplateStringsArray | Prisma.Sql, ...values: any[]]', result: 'any' },
    $executeRawUnsafe: { args: '[query: string, ...values: any[]]', result: 'any' },
    $queryRawUnsafe: { args: '[query: string, ...values: any[]]', result: 'any' },
    $runCommandRaw: { args: 'Prisma.InputJsonObject', result: 'Prisma.JsonObject' },
    $queryRawTyped: { args: 'runtime.UnknownTypedSql', result: 'Prisma.JsonObject' },
  } satisfies Record<NonModelOperation, { args: string; result: string }>

  return `{
  other: {
    payload: any
    operations: {${otherOperationsNames.reduce((acc, action) => {
      return `${acc}
      ${action}: {
        args: ${argsResultMap[action].args},
        result: ${argsResultMap[action].result}
      }`
    }, '')}
    }
  }
}`
}

function clientTypeMapContent(context: GenerateContext) {
  return `${ts.stringify(clientTypeMapModelsDefinition(context))} & ${clientTypeMapOthersDefinition(context)}`
}

function clientTypeMapDefinition(context: GenerateContext) {
  const typeMap = clientTypeMapContent(context)

  return `
interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
  returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
}

export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = ${typeMap}`
}

function clientExtensionsDefinitions(context: GenerateContext) {
  if (!context.isTypingSupportForHeavyFeaturesEnabled()) {
    const typeMapContent = clientTypeMapContent(context)
    // TODO [simplification] remove TypeMap completely? maybe add flag to disable it, because e.g. I don't need it. However, now it won't be this big anymore anyways.
    return `
// Removed model operations from TypeMap due to disableTypingSupportForHeavyFeatures. Note that this type is currently unused by the client itself.
export type TypeMap = ${typeMapContent};

// disabled typing for extensions due to disableTypingSupportForHeavyFeatures
// type TypeMapCb = never;
export const defineExtension: unknown = undefined as unknown;
`
  }

  const typeMapDefinition = clientTypeMapDefinition(context)
  const define = ts.moduleExport(
    ts.constDeclaration(
      'defineExtension',
      ts
        .namedType('$Extensions.ExtendsHook')
        .addGenericArgument(ts.stringLiteral('define'))
        .addGenericArgument(ts.namedType('Prisma.TypeMapCb'))
        .addGenericArgument(ts.namedType('$Extensions.DefaultArgs')),
    ),
  )

  return [typeMapDefinition, ts.stringify(define)].join('\n')
}

function extendsPropertyDefinition(context: GenerateContext) {
  if (!context.isTypingSupportForHeavyFeaturesEnabled()) {
    return `
  /** disabled typing for extensions due to disableTypingSupportForHeavyFeatures */
  $extends: unknown;`
  }
  const extendsDefinition = ts
    .namedType('$Extensions.ExtendsHook')
    .addGenericArgument(ts.stringLiteral('extends'))
    .addGenericArgument(ts.namedType('Prisma.TypeMapCb').addGenericArgument(ts.namedType('ClientOptions')))
    .addGenericArgument(ts.namedType('ExtArgs'))
  if (context.isPreviewFeatureOn('omitApi') && context.isTypingSupportForHeavyFeaturesEnabled()) {
    extendsDefinition
      .addGenericArgument(
        ts
          .namedType('$Utils.Call')
          .addGenericArgument(ts.namedType('Prisma.TypeMapCb'))
          .addGenericArgument(ts.objectType().add(ts.property('extArgs', ts.namedType('ExtArgs')))),
      )
      .addGenericArgument(ts.namedType('ClientOptions'))
  }
  return ts.stringify(ts.property('$extends', extendsDefinition), { indentLevel: 1 })
}

function batchingTransactionDefinition(context: GenerateContext) {
  const method = ts
    .method('$transaction')
    .setDocComment(
      ts.docComment`
        Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
        @example
        \`\`\`
        const [george, bob, alice] = await prisma.$transaction([
          prisma.user.create({ data: { name: 'George' } }),
          prisma.user.create({ data: { name: 'Bob' } }),
          prisma.user.create({ data: { name: 'Alice' } }),
        ])
        \`\`\`

        Read more in our [docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
      `,
    )
    .addGenericParameter(ts.genericParameter('P').extends(ts.array(tsx.prismaPromise(ts.anyType))))
    .addParameter(ts.parameter('arg', ts.arraySpread(ts.namedType('P'))))
    .setReturnType(tsx.promise(ts.namedType('runtime.Types.Utils.UnwrapTuple').addGenericArgument(ts.namedType('P'))))

  if (context.dmmf.hasEnumInNamespace('TransactionIsolationLevel', 'prisma')) {
    const options = ts
      .objectType()
      .formatInline()
      .add(ts.property('isolationLevel', ts.namedType('Prisma.TransactionIsolationLevel')).optional())
    method.addParameter(ts.parameter('options', options).optional())
  }

  return ts.stringify(method, { indentLevel: 1, newLine: 'leading' })
}

function interactiveTransactionDefinition(context: GenerateContext) {
  const options = ts
    .objectType()
    .formatInline()
    .add(ts.property('maxWait', ts.numberType).optional())
    .add(ts.property('timeout', ts.numberType).optional())

  if (context.dmmf.hasEnumInNamespace('TransactionIsolationLevel', 'prisma')) {
    const isolationLevel = ts.property('isolationLevel', ts.namedType('Prisma.TransactionIsolationLevel')).optional()
    options.add(isolationLevel)
  }

  const returnType = tsx.promise(ts.namedType('R'))

  const callbackType = ts
    .functionType()
    .addParameter(ts.parameter('prisma', ts.omit(ts.namedType('PrismaClient'), itxTransactionClientDenyList(context))))
    .setReturnType(returnType)

  const method = ts
    .method('$transaction')
    .addGenericParameter(ts.genericParameter('R'))
    .addParameter(ts.parameter('fn', callbackType))
    .addParameter(ts.parameter('options', options).optional())
    .setReturnType(returnType)

  return ts.stringify(method, { indentLevel: 1, newLine: 'leading' })
}

function itxTransactionClientDenyList(context: GenerateContext) {
  if (context.provider === 'mongodb') {
    return ts.unionType([ts.namedType('runtime.ITXClientDenyList'), ts.stringLiteral('$transaction')])
  }

  return ts.namedType('runtime.ITXClientDenyList')
}

function queryRawDefinition(context: GenerateContext) {
  // we do not generate `$queryRaw...` definitions if not supported
  if (!context.dmmf.mappings.otherOperations.write.includes('queryRaw')) {
    return '' // https://github.com/prisma/prisma/issues/8189
  }

  return `
  /**
   * Performs a prepared raw query and returns the \`SELECT\` data.
   * @example
   * \`\`\`
   * const result = await prisma.$queryRaw\`SELECT * FROM User WHERE id = \${1} OR email = \${'user@email.com'};\`
   * \`\`\`
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the \`SELECT\` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * \`\`\`
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * \`\`\`
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;`
}

function executeRawDefinition(context: GenerateContext) {
  // we do not generate `$executeRaw...` definitions if not supported
  if (!context.dmmf.mappings.otherOperations.write.includes('executeRaw')) {
    return '' // https://github.com/prisma/prisma/issues/8189
  }

  return `
  /**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * \`\`\`
   * const result = await prisma.$executeRaw\`UPDATE User SET cool = \${true} WHERE email = \${'user@email.com'};\`
   * \`\`\`
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * \`\`\`
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * \`\`\`
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;`
}

function queryRawTypedDefinition(context: GenerateContext) {
  if (!context.isPreviewFeatureOn('typedSql')) {
    return ''
  }
  if (!context.dmmf.mappings.otherOperations.write.includes('queryRaw')) {
    return ''
  }

  const param = ts.genericParameter('T')
  const method = ts
    .method('$queryRawTyped')
    .setDocComment(
      ts.docComment`
        Executes a typed SQL query and returns a typed result
        @example
        \`\`\`
        import { myQuery } from '@prisma/client/sql'

        const result = await prisma.$queryRawTyped(myQuery())
        \`\`\`
      `,
    )
    .addGenericParameter(param)
    .addParameter(
      ts.parameter(
        'typedSql',
        runtimeImportedType('TypedSql')
          .addGenericArgument(ts.array(ts.unknownType))
          .addGenericArgument(param.toArgument()),
      ),
    )
    .setReturnType(tsx.prismaPromise(ts.array(param.toArgument())))

  return ts.stringify(method, { indentLevel: 1, newLine: 'leading' })
}

function runCommandRawDefinition(context: GenerateContext) {
  // we do not generate `$runCommandRaw` definitions if not supported
  if (!context.dmmf.mappings.otherOperations.write.includes('runCommandRaw')) {
    return '' // https://github.com/prisma/prisma/issues/8189
  }

  const method = ts
    .method('$runCommandRaw')
    .addParameter(ts.parameter('command', ts.namedType('Prisma.InputJsonObject')))
    .setReturnType(tsx.prismaPromise(ts.namedType('Prisma.JsonObject'))).setDocComment(ts.docComment`
      Executes a raw MongoDB command and returns the result of it.
      @example
      \`\`\`
      const user = await prisma.$runCommandRaw({
        aggregate: 'User',
        pipeline: [{ $match: { name: 'Bob' } }, { $project: { email: true, _id: false } }],
        explain: false,
      })
      \`\`\`

      Read more in our [docs](https://pris.ly/d/raw-queries).
    `)

  return ts.stringify(method, { indentLevel: 1, newLine: 'leading' })
}

export class PrismaClientClass implements Generable {
  constructor(
    protected readonly context: GenerateContext,
    protected readonly internalDatasources: DataSource[],
    protected readonly outputDir: string,
    protected readonly runtimeName: TSClientOptions['runtimeName'],
    protected readonly browser?: boolean,
  ) {}
  private get jsDoc(): string {
    const { dmmf } = this.context

    let example: DMMF.ModelMapping

    if (dmmf.mappings.modelOperations.length) {
      example = dmmf.mappings.modelOperations[0]
    } else {
      // because generator models is empty we need to create a fake example
      example = {
        model: 'User',
        plural: 'users',
      }
    }

    return `/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * \`\`\`
 * const prisma = new PrismaClient({
 *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
 * })
 * // Fetch zero or more ${capitalize(example.plural)}
 * const ${uncapitalize(example.plural)} = await prisma.${uncapitalize(example.model)}.findMany()
 * \`\`\`
 *
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */`
  }
  public toTSWithoutNamespace(): string {
    const { dmmf } = this.context

    return `${this.jsDoc}
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never${
    this.context.isTypingSupportForHeavyFeaturesEnabled()
      ? ',\n  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs'
      : '\n  // Omitting ExtArgs generic parameter due to disableTypingSupportForHeavyFeatures'
  }
> {
${
  // TODO [simplification] what is 'other'? Directly generate the properties here instead of simply removing them?
  this.context.isTypingSupportForHeavyFeaturesEnabled()
    ? indent(`[K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }`, TAB_SIZE)
    : '' +
      indent(
        "// removed `[K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }` due to disableTypingSupportForHeavyFeatures",
        TAB_SIZE,
      )
}

  ${indent(this.jsDoc, TAB_SIZE)}

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

${[
  executeRawDefinition(this.context),
  queryRawDefinition(this.context),
  queryRawTypedDefinition(this.context),
  batchingTransactionDefinition(this.context),
  interactiveTransactionDefinition(this.context),
  runCommandRawDefinition(this.context),
  extendsPropertyDefinition(this.context),
]
  .filter((d) => d !== null)
  .join('\n')
  .trim()}

    ${indent(
      dmmf.mappings.modelOperations
        .filter((m) => m.findMany)
        .map((m) => {
          let methodName = uncapitalize(m.model)
          if (methodName === 'constructor') {
            methodName = '["constructor"]'
          }
          const generics = this.context.isTypingSupportForHeavyFeaturesEnabled() ? ['ExtArgs'] : []
          if (this.context.isPreviewFeatureOn('omitApi') && this.context.isTypingSupportForHeavyFeaturesEnabled()) {
            generics.push('ClientOptions')
          }
          const genericsString = generics.length !== 0 ? `<${generics.join(', ')}>` : ''
          return `\
/**
 * \`prisma.${methodName}\`: Exposes CRUD operations for the **${m.model}** model.
  * Example usage:
  * \`\`\`ts
  * // Fetch zero or more ${capitalize(m.plural)}
  * const ${uncapitalize(m.plural)} = await prisma.${methodName}.findMany()
  * \`\`\`
  */
get ${methodName}(): Prisma.${m.model}Delegate${genericsString};`
        })
        .join('\n\n'),
      2,
    )}
}`
  }
  public toTS(): string {
    // TODO [simplification] [unimportant] make PrismaClient extend TransactionClient instead of TransactionClient omitting some properties of PrismaClient.
    //  That way, maybe TS has less to check. Just a wild guess though because of previous experience.
    //  Would have to write test using ts-morph that actually uses the language-service for some queries and then checking what is going on.
    const clientOptions = this.buildClientOptions()
    const transactionClientDenyList =
      this.context.provider === 'mongodb' ? "runtime.ITXClientDenyList | '$transaction'" : 'runtime.ITXClientDenyList'

    return `${clientExtensionsDefinitions(this.context)}
export type DefaultPrismaClient = PrismaClient
export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
${ts.stringify(ts.moduleExport(clientOptions))}
${ts.stringify(globalOmitConfig(this.context.dmmf))}

/* Types for Logging */
export type LogLevel = 'info' | 'query' | 'warn' | 'error'
export type LogDefinition = {
  level: LogLevel
  emit: 'stdout' | 'event'
}

export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

export type GetLogType<T> = CheckIsLogLevel<
  T extends LogDefinition ? T['level'] : T
>;

export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
  ? GetLogType<T[number]>
  : never;

export type QueryEvent = {
  timestamp: Date
  query: string
  params: string
  duration: number
  target: string
}

export type LogEvent = {
  timestamp: Date
  message: string
  target: string
}
/* End Types for Logging */


export type PrismaAction =
  | 'findUnique'
  | 'findUniqueOrThrow'
  | 'findMany'
  | 'findFirst'
  | 'findFirstOrThrow'
  | 'create'
  | 'createMany'
  | 'createManyAndReturn'
  | 'update'
  | 'updateMany'
  | 'updateManyAndReturn'
  | 'upsert'
  | 'delete'
  | 'deleteMany'
  | 'executeRaw'
  | 'queryRaw'
  | 'aggregate'
  | 'count'
  | 'runCommandRaw'
  | 'findRaw'
  | 'groupBy'

// tested in getLogLevel.test.ts
export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

/**
 * \`PrismaClient\` proxy available in interactive transactions.
 */
export type TransactionClient = Omit<Prisma.DefaultPrismaClient, ${transactionClientDenyList}>
`
  }

  private buildClientOptions() {
    const clientOptions = ts
      .interfaceDeclaration('PrismaClientOptions')
      .add(
        ts
          .property('errorFormat', ts.namedType('ErrorFormat'))
          .optional()
          .setDocComment(ts.docComment('@default "colorless"')),
      )
      .add(
        ts.property('log', ts.array(ts.unionType([ts.namedType('LogLevel'), ts.namedType('LogDefinition')]))).optional()
          .setDocComment(ts.docComment`
             @example
             \`\`\`
             // Shorthand for \`emit: 'stdout'\`
             log: ['query', 'info', 'warn', 'error']

             // Emit as events only
             log: [
               { emit: 'event', level: 'query' },
               { emit: 'event', level: 'info' },
               { emit: 'event', level: 'warn' }
               { emit: 'event', level: 'error' }
             ]

            // Emit as events and log to stdout
            log: [
              { emit: 'stdout', level: 'query' },
              { emit: 'stdout', level: 'info' },
              { emit: 'stdout', level: 'warn' }
              { emit: 'stdout', level: 'error' }
            ]
             \`\`\`
             Read more in our [docs](https://pris.ly/d/logging).
          `),
      )

    const transactionOptions = ts
      .objectType()
      .add(ts.property('maxWait', ts.numberType).optional())
      .add(ts.property('timeout', ts.numberType).optional())

    if (this.context.dmmf.hasEnumInNamespace('TransactionIsolationLevel', 'prisma')) {
      transactionOptions.add(ts.property('isolationLevel', ts.namedType('Prisma.TransactionIsolationLevel')).optional())
    }

    clientOptions.add(
      ts.property('transactionOptions', transactionOptions).optional().setDocComment(ts.docComment`
             The default values for transactionOptions
             maxWait ?= 2000
             timeout ?= 5000
          `),
    )

    if (
      // We don't support a custom adapter with MongoDB for now.
      this.internalDatasources.some((d) => d.provider !== 'mongodb')
    ) {
      clientOptions.add(
        ts
          .property('adapter', ts.namedType('runtime.SqlDriverAdapterFactory'))
          .optional()
          .setDocComment(
            ts.docComment('Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`'),
          ),
      )
    }

    clientOptions.add(
      ts
        .property('accelerateUrl', ts.stringType)
        .optional()
        .setDocComment(
          ts.docComment(
            'Prisma Accelerate URL allowing the client to connect through Accelerate instead of a direct database.',
          ),
        ),
    )

    if (this.context.isPreviewFeatureOn('omitApi') && this.context.isTypingSupportForHeavyFeaturesEnabled()) {
      clientOptions.add(
        ts.property('omit', ts.namedType('Prisma.GlobalOmitConfig')).optional().setDocComment(ts.docComment`
          Global configuration for omitting model fields by default.

          @example
          \`\`\`
          const prisma = new PrismaClient({
            omit: {
              user: {
                password: true
              }
            }
          })
          \`\`\`
        `),
      )
    }

    if (this.context.isSqlProvider()) {
      clientOptions.add(
        ts.property('comments', ts.array(ts.namedType('runtime.SqlCommenterPlugin'))).optional()
          .setDocComment(ts.docComment`
            SQL commenter plugins that add metadata to SQL queries as comments.
            Comments follow the sqlcommenter format: https://google.github.io/sqlcommenter/

            @example
            \`\`\`
            const prisma = new PrismaClient({
              adapter,
              comments: [
                traceContext(),
                queryInsights(),
              ],
            })
            \`\`\`
          `),
      )
    }

    return clientOptions
  }
}
