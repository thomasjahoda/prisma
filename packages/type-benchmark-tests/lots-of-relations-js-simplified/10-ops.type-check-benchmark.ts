/* eslint-disable @typescript-eslint/no-floating-promises */

// @ts-ignore
import { PrismaClient } from './generated'

const client: PrismaClient = undefined as any

client.model0.findMany({ take: 5, select: { model1: true } })
client.model1.findUnique({ where: { id: 1 }, select: { model2: true } })
client.model2.count({ where: { model3Id: { gt: 0 } } })
client.model3.findFirst({
  where: { id: 3 },
  select: { model4: true },
})
client.model4.findMany({
  where: { model5Id: 4 },
  select: { model5: true },
})
client.model5.findUniqueOrThrow({ where: { id: 5 }, select: { model6: true } })
client.model6.count()
client.model7.findMany({
  take: 20,
  orderBy: { id: 'desc' },
  select: { model8: true },
})
client.model8.findFirst({ select: { model9: true } })
client.model0.findMany({
  where: {
    OR: [{ model1Id: 1 }, { model2Id: 2 }],
  },
  select: { model1: true },
})
// type-check-benchmark-instantiations: 2677
