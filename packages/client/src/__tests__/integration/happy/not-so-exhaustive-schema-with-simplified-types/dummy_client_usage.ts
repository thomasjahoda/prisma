/* eslint-disable */
// TODO [simplification] proper generic paths instead of hardcoded absolute hacky paths, lol
import * as runtime from '/Users/thomas/dev/external/prisma/packages/client/runtime/library.js'
import type * as clientTypes from '/Users/thomas/dev/external/prisma/packages/client/src/__tests__/integration/happy/not-so-exhaustive-schema-with-simplified-types/test-clients/library/node_modules/.prisma/client/index.d.ts'

// dummy file to test using the generated client
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.ExtensionsSimplified
import $Result = runtime.Types.ResultSimplified

const client: clientTypes.PrismaClient = 0 as any

async function main() {
  await client.$connect()

  const as1 = await client.user.update({
    data: {
      float: 2,
      bla: 'b',
    },
    where: {
      id: 1,
    },
  })
  const as1 = await client.user.findMany({
    include: {
      posts: true,
    },
  })

  const as1 = await client.user.findUnique({
    where: {
      id: 1,
    },
  })
  const bs1 = await client.b.findMany({
    select: {
      float: true,
      decFloat: true,
      dFloat: true,
      numFloat: true,
    },
  })
  const bs2 = await client.b.findMany()
  const result = await client.b.create({
    data: {
      float: 1.0,
      decFloat: 1.0,
      dFloat: 1.0,
      numFloat: 1.0,
    },
  })
}
