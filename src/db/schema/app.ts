import { pgTable, timestamp,integer,varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

const timestamps={
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
}

export const departments= pgTable('departments', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  code: varchar('code',{length: 50}).notNull(),
  name: varchar('name',{length: 255}).notNull(),
  description:varchar("description",{length:500}).notNull(),
  ...timestamps,
});

export const subjects= pgTable('subjects', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    departmentId: integer('department_id').notNull().references(() => departments.id),
    code: varchar('code',{length: 50}).notNull(),
    name: varchar('name',{length: 255}).notNull(),
    description:varchar("description",{length: 255}),
    ...timestamps,
  });

export const departmentRelations=relations(departments,({many})=>({subjects:many(subjects)}))
export const subjectRelations=relations(subjects,({one,many})=>({
    department: one(departments, {
      fields: [subjects.departmentId],
      references: [departments.id],
    }),
  }))

export type Department = typeof departments.$inferSelect;
export type newDepartment=typeof departments.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type newSubject = typeof subjects.$inferInsert;
