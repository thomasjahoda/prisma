import { ClientEngineType } from '@prisma/internals'

import { testGeneratedClient } from './common'

test('not-so-exhaustive-schema-with-simplified-types (binary)', async () => {
  process.env.PRISMA_HACK_GENERATOR_CONFIG_disableTypingSupportForHeavyFeatures = 'true'
  // TODO [simplification] wip hack to be removed
  try {
    await testGeneratedClient(ClientEngineType.Binary)()
  } finally {
    delete process.env.PRISMA_HACK_GENERATOR_CONFIG_disableTypingSupportForHeavyFeatures
  }
})
