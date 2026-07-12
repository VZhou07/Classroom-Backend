CREATE TABLE "grade_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "grade_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"class_id" integer NOT NULL,
	"name" text NOT NULL,
	"weight" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_grades" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "student_grades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"grade_item_id" integer NOT NULL,
	"student_id" text NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_grades_grade_item_id_student_id_uidx" UNIQUE("grade_item_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_grades" ADD CONSTRAINT "student_grades_grade_item_id_grade_items_id_fk" FOREIGN KEY ("grade_item_id") REFERENCES "public"."grade_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_grades" ADD CONSTRAINT "student_grades_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grade_items_class_id_idx" ON "grade_items" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "student_grades_grade_item_id_idx" ON "student_grades" USING btree ("grade_item_id");--> statement-breakpoint
CREATE INDEX "student_grades_student_id_idx" ON "student_grades" USING btree ("student_id");