import { PrismaClient } from '@prisma/client'
import { Record } from '.prisma/client'

async function main() {
  const prisma = new PrismaClient()

  const data: Record | null = await prisma.record.findFirst()

  console.log(data)
  console.log(data?.name)
  await prisma.$disconnect()
}

main()
