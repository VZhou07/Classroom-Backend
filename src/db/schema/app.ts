import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { user } from './auth.js';
import { subjects } from './schema.js';

const timestamps = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const classStatusEnum = pgEnum('class_status', [
  'active',
  'inactive',
  'archived',
]);

export type ClassScheduleSlot = {
  day: string;
  start: string;
  end: string;
};

export const classes = pgTable(
  'classes',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    teacherId: text('teacher_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    inviteCode: text('invite_code').notNull().unique(),
    name: text('name').notNull(),
    bannerCldPubId: text('banner_cld_pub_id'),
    bannerUrl: text('banner_url'),
    description: text('description'),
    capacity: integer('capacity').notNull().default(50),
    status: classStatusEnum('status').notNull().default('active'),
    schedules: jsonb('schedules')
      .$type<ClassScheduleSlot[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index('classes_subject_id_idx').on(table.subjectId),
    index('classes_teacher_id_idx').on(table.teacherId),
  ],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    studentId: text('student_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    classId: integer('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
  },
  (table) => [
    unique('enrollments_student_id_class_id_uidx').on(
      table.studentId,
      table.classId,
    ),
    index('enrollments_student_id_idx').on(table.studentId),
    index('enrollments_class_id_idx').on(table.classId),
  ],
);

export const classRelations = relations(classes, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [classes.subjectId],
    references: [subjects.id],
  }),
  teacher: one(user, {
    fields: [classes.teacherId],
    references: [user.id],
  }),
  enrollments: many(enrollments),
}));

export const enrollmentRelations = relations(enrollments, ({ one }) => ({
  student: one(user, {
    fields: [enrollments.studentId],
    references: [user.id],
  }),
  class: one(classes, {
    fields: [enrollments.classId],
    references: [classes.id],
  }),
}));

export type Class = typeof classes.$inferSelect;
export type newClass = typeof classes.$inferInsert;
export type Enrollment = typeof enrollments.$inferSelect;
export type newEnrollment = typeof enrollments.$inferInsert;
