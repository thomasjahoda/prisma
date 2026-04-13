/* eslint-disable @typescript-eslint/no-floating-promises */

// @ts-ignore
import { PrismaClient } from './generated/client'

const client: PrismaClient = undefined as any

client.user.findUnique({
  where: { id: 'some_user_id' },
})
// type-check-benchmark-instantiations: 172323
