/* eslint-disable @typescript-eslint/no-floating-promises */

// @ts-ignore
import { PrismaClient } from './generated'

const client: PrismaClient = undefined as any

client.model1.findMany({ where: { int: { gt: 5 } } })
// type-check-benchmark-instantiations: 321
