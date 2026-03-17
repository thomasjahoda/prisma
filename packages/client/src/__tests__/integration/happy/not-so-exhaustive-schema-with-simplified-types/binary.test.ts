import { testGeneratedClient } from './common'

test('not-so-exhaustive-schema-with-simplified-types (binary)', async () => {
  const originalDisableHeavyTypingSupport =
    process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
  try {
    process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES = 'true'
    await testGeneratedClient('binary')()
  } finally {
    if (originalDisableHeavyTypingSupport === undefined) {
      delete process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES
    } else {
      process.env.PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES = originalDisableHeavyTypingSupport
    }
  }
})
