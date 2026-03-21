/* eslint-disable @typescript-eslint/no-floating-promises */

// @ts-ignore
import { PrismaClient } from './generated'

const client: PrismaClient = undefined as any

client.model0.findMany({ select: { model1: true } })
// type-check-benchmark-instantiations: 350
