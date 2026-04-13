/* eslint-disable @typescript-eslint/no-floating-promises */

// @ts-ignore
import { PrismaClient } from './generated/client'

const client: PrismaClient<'info'> = undefined as any

client.model1.findUnique({ where: { id: 1 } })
// type-check-benchmark-instantiations: 171832