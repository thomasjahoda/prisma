/* eslint-disable @typescript-eslint/no-floating-promises */

// @ts-ignore
import { PrismaClient } from './generated/client'

const client: PrismaClient<'info'> = undefined as any

client.$connect()
// type-check-benchmark-instantiations: 171752
