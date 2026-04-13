/* eslint-disable @typescript-eslint/no-floating-promises */

// @ts-ignore
import { PrismaClient } from './generated'

const client: PrismaClient = undefined as any

client.link.findUnique({
  where: { id: 'some_link_id' },
})

client.link.findFirst({
  where: { url: { contains: 'example.com' } },
})

client.link.findMany({
  take: 10,
})

client.user.findUnique({
  where: { email: 'some_email@example.com' },
  select: {
    id: true,
    email: true,
    name: true,
  },
})

client.link.findMany({
  where: { userId: 'some_user_id' },
  select: {
    url: true,
    shortUrl: true,
  },
})

client.user.findUnique({
  where: { id: 'some_user_id' },
  include: {
    links: true,
  },
})

client.link.findUnique({
  where: { id: 'some_link_id' },
  include: {
    user: true,
  },
})

client.user.findUnique({
  where: { id: 'some_user_id' },
  include: {
    links: {
      select: {
        url: true,
        createdAt: true,
      },
      where: { url: { startsWith: 'https://' } },
    },
  },
})

client.user.findUnique({
  where: { id: 'some_user_id' },
  select: {
    email: true,
    links: {
      select: {
        shortUrl: true,
      },
    },
  },
})

client.user.create({
  data: {
    email: 'new_user@example.com',
    name: 'New User',
  },
})
// type-check-benchmark-instantiations: 4842