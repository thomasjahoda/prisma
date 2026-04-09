/* eslint-disable @typescript-eslint/no-floating-promises */

// @ts-ignore
import { PrismaClient } from './generated/client'

const client: PrismaClient<'info'> = undefined as any

client.model1.findMany({ where: { int: { gt: 5 } } })
// type-check-benchmark-instantiations: 172327
