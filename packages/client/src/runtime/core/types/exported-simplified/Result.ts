import { Operation } from '@prisma/client-common'

import { JsonObject } from '../exported/Json'
import * as original$Result from '../exported/Result'
import { Skip } from '../exported/Skip'
import { OperationPayload } from './Payload'
import { Equals } from './Utils'

// prettier-ignore
export type GetFindResult<P extends OperationPayload, A> =
  Equals<A, any> extends 1 ? DefaultSelection<P> :
  A extends
  | { select: infer S extends object } & Record<string, unknown>
  | { include: infer I extends object } & Record<string, unknown>
  ? {
      [K in keyof S | keyof I as (S & I)[K] extends false | undefined | Skip | null ? never : K]:
        (S & I)[K] extends object
        ? P extends SelectablePayloadFields<K, (infer O)[]>
          ? O extends OperationPayload ? GetFindResult<O, (S & I)[K]>[] : never
          : P extends SelectablePayloadFields<K, infer O | null>
            ? O extends OperationPayload ? GetFindResult<O, (S & I)[K]> | SelectField<P, K> & null : never
            : K extends '_count'
              ? original$Result.Count<GetFindResult<P, (S & I)[K]>>
              : never
        : P extends SelectablePayloadFields<K, (infer O)[]>
          ? O extends OperationPayload ? DefaultSelection<O>[] : never
          : P extends SelectablePayloadFields<K, infer O | null>
            ? O extends OperationPayload ? DefaultSelection<O> | SelectField<P, K> & null : never
            : P extends { scalars: { [k in K]: infer O } }
              ? O
              : K extends '_count'
                ? original$Result.Count<P['objects']>
                : never
    } & (A extends { include: any } & Record<string, unknown> ? DefaultSelection<P> : unknown)
  : DefaultSelection<P>

// prettier-ignore
export type SelectablePayloadFields<K extends PropertyKey, O> = { objects: { [k in K]: O } }

// prettier-ignore
export type SelectField<P extends SelectablePayloadFields<any, any>, K extends PropertyKey> =
  P extends { objects: Record<K, any> }
  ? P['objects'][K]
    : never

// prettier-ignore
export type DefaultSelection<Payload extends OperationPayload> =
  Payload['scalars']

// prettier-ignore
/**
 * @deprecated do not use with simplified types
 */
export type UnwrapPayload<P> = {} extends P ? unknown : {
  [K in keyof P]:
    P[K] extends { scalars: infer S }[]
    ? Array<S>
    : never
};

export type GetCountResult<A> = A extends { select: infer S }
  ? S extends true
    ? number
    : original$Result.Count<S>
  : number

export type Aggregate = '_count' | '_max' | '_min' | '_avg' | '_sum'

// prettier-ignore
export type GetAggregateResult<P extends OperationPayload, A> = {
  [K in keyof A as K extends Aggregate ? K : never]:
    K extends '_count'
    ? A[K] extends true ? number : original$Result.Count<A[K]>
    : { [J in keyof A[K] & string]: P['scalars'][J] | null }
}

export type GetBatchResult = { count: number }

// prettier-ignore
export type GetGroupByResult<P extends OperationPayload, A> =
  A extends { by: string[] }
  ? Array<GetAggregateResult<P, A> & { [K in A['by'][number]]: P['scalars'][K] }>
  : A extends { by: string } 
    ? Array<GetAggregateResult<P, A> & { [K in A['by']]: P['scalars'][K]}>
    : {}[]

// prettier-ignore
export type GetResult<Payload extends OperationPayload, Args, OperationName extends Operation = 'findUniqueOrThrow'> = {
  findUnique: GetFindResult<Payload, Args> | null,
  findUniqueOrThrow: GetFindResult<Payload, Args>,
  findFirst: GetFindResult<Payload, Args> | null,
  findFirstOrThrow: GetFindResult<Payload, Args>,
  findMany: GetFindResult<Payload, Args>[],
  create: GetFindResult<Payload, Args>,
  createMany: GetBatchResult,
  createManyAndReturn: GetFindResult<Payload, Args>[],
  update: GetFindResult<Payload, Args>,
  updateMany: GetBatchResult,
  updateManyAndReturn: GetFindResult<Payload, Args>[],
  upsert: GetFindResult<Payload, Args>,
  delete: GetFindResult<Payload, Args>,
  deleteMany: GetBatchResult,
  aggregate: GetAggregateResult<Payload, Args>,
  count: GetCountResult<Args>,
  groupBy: GetGroupByResult<Payload, Args>,
  $queryRaw: unknown,
  $queryRawTyped: unknown,
  $executeRaw: number,
  $queryRawUnsafe: unknown,
  $executeRawUnsafe: number,
  $runCommandRaw: JsonObject,
  findRaw: JsonObject,
  aggregateRaw: JsonObject,
}[OperationName]
