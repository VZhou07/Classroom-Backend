import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
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

export const inviteRoleEnum = pgEnum('invite_role', ['teacher', 'student']);

export const inviteStatusEnum = pgEnum('invite_status', [
  'pending',
  'accepted',
  'expired',
  'revoked',
]);

export const invitations = pgTable(
  'invitations',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    email: text('email').notNull(),
    role: inviteRoleEnum('role').notNull(),
    token: text('token').notNull().unique(),
    invitedById: text('invited_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Only set for student invites; the class the student is auto-enrolled into on acceptance.
    classId: integer('class_id').references(() => classes.id, {
      onDelete: 'cascade',
    }),
    status: inviteStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at').notNull(),
    ...timestamps,
  },
  (table) => [
    index('invitations_token_idx').on(table.token),
    index('invitations_email_idx').on(table.email),
    index('invitations_invited_by_id_idx').on(table.invitedById),
  ],
);

export const invitationRelations = relations(invitations, ({ one }) => ({
  invitedBy: one(user, {
    fields: [invitations.invitedById],
    references: [user.id],
  }),
  class: one(classes, {
    fields: [invitations.classId],
    references: [classes.id],
  }),
}));

export type Invitation = typeof invitations.$inferSelect;
export type newInvitation = typeof invitations.$inferInsert;

export const gradeItems = pgTable(
  'grade_items',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    classId: integer('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    weight: integer('weight').notNull(),
    ...timestamps,
  },
  (table) => [
    index('grade_items_class_id_idx').on(table.classId),
  ],
);

export const studentGrades = pgTable(
  'student_grades',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    gradeItemId: integer('grade_item_id')
      .notNull()
      .references(() => gradeItems.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    published: boolean('published').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique('student_grades_grade_item_id_student_id_uidx').on(
      table.gradeItemId,
      table.studentId,
    ),
    index('student_grades_grade_item_id_idx').on(table.gradeItemId),
    index('student_grades_student_id_idx').on(table.studentId),
  ],
);

export const gradeItemRelations = relations(gradeItems, ({ one, many }) => ({
  class: one(classes, {
    fields: [gradeItems.classId],
    references: [classes.id],
  }),
  studentGrades: many(studentGrades),
}));

export const studentGradeRelations = relations(studentGrades, ({ one }) => ({
  gradeItem: one(gradeItems, {
    fields: [studentGrades.gradeItemId],
    references: [gradeItems.id],
  }),
  student: one(user, {
    fields: [studentGrades.studentId],
    references: [user.id],
  }),
}));

export type GradeItem = typeof gradeItems.$inferSelect;
export type NewGradeItem = typeof gradeItems.$inferInsert;
export type StudentGrade = typeof studentGrades.$inferSelect;
export type NewStudentGrade = typeof studentGrades.$inferInsert;
