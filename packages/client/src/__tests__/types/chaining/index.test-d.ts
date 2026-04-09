import { PrismaClient, User } from '.'
import { expectError } from 'tsd'

const prisma = new PrismaClient()

;(async () => {
  expectError(
    await prisma.user.findFirst().posts({
      extraField: {},
    }),
  )

  // Can't use select and include at the same time
  expectError(async () => {
    // TODO [bug] the test doesn't test what "Can't use select and include at the same time" says. It tested whether chaining kept nullability. Using both select and include does not lead to a type error, even though it probably should.
    let author: User = await prisma.post.findFirst().author({
      select: {
        name: true,
      },
      include: {
        posts: true,
      },
    })
  })
})()
