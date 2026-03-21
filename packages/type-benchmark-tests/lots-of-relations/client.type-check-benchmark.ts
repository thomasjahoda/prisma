/* eslint-disable @typescript-eslint/no-floating-promises */

// @ts-ignore
import { PrismaClient } from './generated/client'

const client: PrismaClient<'info'> = undefined as any

client.model0.findMany({ select: { model1: true } })
// type-check-benchmark-instantiations: 171906
