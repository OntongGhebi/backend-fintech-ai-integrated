import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

type CategoryType = NonNullable<
  NonNullable<
    NonNullable<Parameters<PrismaService['category']['findMany']>[0]>['where']
  >['type']
>;

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Parameters<PrismaService['category']['create']>[0]['data'],
  ) {
    return this.prisma.category.create({
      data,
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async findById(categoryId: string) {
    return this.prisma.category.findUnique({
      where: {
        id: categoryId,
      },
    });
  }

  async findByIdAndUserId(categoryId: string, userId: string) {
    return this.prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
        deletedAt: null,
      },
      // include: {
      //   parent: true,
      //   children: {
      //     where: {
      //       deletedAt: null,
      //     },
      //     orderBy: {
      //       name: 'asc',
      //     },
      //   },
      // },
    });
  }

  async findByNameAndUserId(
    name: string,
    userId: string,
    type: CategoryType,
    parentId: string | null,
  ) {
    return this.prisma.category.findFirst({
      where: {
        userId,
        type,
        parentId,
        name: {
          equals: name,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });
  }

  async findByNameAndUserIdExceptId(
    name: string,
    userId: string,
    categoryId: string,
    type: CategoryType,
    parentId: string | null,
  ) {
    return this.prisma.category.findFirst({
      where: {
        userId,
        id: {
          not: categoryId,
        },
        type,
        parentId,
        name: {
          equals: name,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });
  }

  async findActiveChildren(categoryId: string, userId: string) {
    return this.prisma.category.findMany({
      where: {
        parentId: categoryId,
        userId,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  async findManyByUserId(userId: string) {
    return this.prisma.category.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      include: {
        parent: true,
        children: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            name: 'asc',
          },
        },
      },
      orderBy: [
        {
          isSystem: 'desc',
        },
        {
          type: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  async findManyByUserIdAndType(userId: string, type: CategoryType) {
    return this.prisma.category.findMany({
      where: {
        userId,
        type,
        deletedAt: null,
      },
      include: {
        parent: true,
        children: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            name: 'asc',
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async update(
    categoryId: string,
    userId: string,
    data: Parameters<PrismaService['category']['updateMany']>[0]['data'],
  ) {
    return this.prisma.category.updateMany({
      where: {
        id: categoryId,
        userId,
        deletedAt: null,
      },
      data,
    });
  }

  async softDelete(categoryId: string, userId: string) {
    return this.prisma.category.updateMany({
      where: {
        id: categoryId,
        userId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }
}
