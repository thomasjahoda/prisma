/* eslint-disable @typescript-eslint/no-floating-promises */

// @ts-ignore
import { PrismaClient } from './generated'

const client: PrismaClient = undefined as any

client.model0.findUnique({ where: { id: 1 } })
// type-check-benchmark-instantiations: 1169