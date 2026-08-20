import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/031_sync_transport_compatibility.sql",
  "utf8",
).toLowerCase();
const lessonMigration = readFileSync(
  "supabase/migrations/004_stabilisation_lesson_payloads.sql",
  "utf8",
).toLowerCase();
const attendanceMigration = readFileSync(
  "supabase/migrations/019_attendance.sql",
  "utf8",
).toLowerCase();
const blockingFixMigration = readFileSync(
  "supabase/migrations/032_v091_blocking_fixes.sql",
  "utf8",
).toLowerCase();
const gradingSubjectMigration = readFileSync(
  "supabase/migrations/035_v091_grading_subject_resolution.sql",
  "utf8",
).toLowerCase();
const gradingStaleClassMigration = readFileSync(
  "supabase/migrations/036_v091_grading_stale_class_resolution.sql",
  "utf8",
).toLowerCase();
const rosterMigration = readFileSync(
  "supabase/migrations/056_student_roster_automatic_sync.sql",
  "utf8",
).toLowerCase();
const preschoolGradingMigration = readFileSync(
  "supabase/migrations/059_preschool_grading_persistence.sql",
  "utf8",
).toLowerCase();

describe("compatibilité du transport avec le schéma installé", () => {
  it("rend facultatives les anciennes clés d’assiduité incompatibles", () => {
    expect(migration).toContain("alter column class_student_id drop not null");
    expect(migration).toContain("alter column grading_period_id drop not null");
  });

  it("corrige les RPC de fiches sans colonne profiles.user_id inexistante", () => {
    expect(migration).toContain("where id = v_profile_id");
    expect(migration).toContain("where lp.teacher_id = auth.uid()");
    expect(migration).not.toContain("profiles where user_id");
    expect(migration).not.toContain("p.user_id");
    expect(lessonMigration).toContain("where id = auth.uid()");
    expect(lessonMigration).not.toContain("profiles where user_id");
  });

  it("permet à la migration d’assiduité de suivre la table créée en 010", () => {
    expect(attendanceMigration).toContain(
      "alter table public.attendance_records",
    );
    expect(attendanceMigration).toContain(
      "add column if not exists attendance_date date",
    );
  });

  it("répare les cinq blocages confirmés par la recette cloud", () => {
    expect(blockingFixMigration).toContain("insert into public.student_records");
    expect(blockingFixMigration).toContain("list_school_teachers");
    expect(blockingFixMigration).toContain("save_grading_workspace_relational");
    expect(blockingFixMigration).toContain("insert into public.assessment_scores");
    expect(blockingFixMigration).toContain("class_group_id = coalesce");
  });

  it("résout les matières du registre par nom ou par code", () => {
    expect(gradingSubjectMigration).toContain(
      "or lower(s.code) = lower(v_assessment->>'subject')",
    );
    expect(gradingSubjectMigration).toContain(
      "values ('hge', 'histoire-géographie'",
    );
    expect(gradingSubjectMigration).toContain(
      "insert into public.assessment_scores",
    );
  });

  it("répare une référence de classe périmée via l'élève noté", () => {
    expect(gradingStaleClassMigration).toContain("join public.class_students cs");
    expect(gradingStaleClassMigration).toContain(
      "score.value->>'assessmentid' = v_assessment_id::text",
    );
    expect(gradingStaleClassMigration).toContain("v_payload := jsonb_set");
    expect(gradingStaleClassMigration).toContain("values (v_teacher, v_payload)");
  });

  it("synchronise automatiquement un dossier élève avec la liste de sa classe", () => {
    expect(rosterMigration).toContain("sync_student_record_to_class_roster");
    expect(rosterMigration).toContain("after insert or update of class_group_id");
    expect(rosterMigration).toContain("insert into public.class_students");
    expect(rosterMigration).toContain("where class_group_id is not null and status = 'active'");
  });

  it("persiste les observations et niveaux de maîtrise de la maternelle", () => {
    expect(preschoolGradingMigration).toContain("'mat-lang', 'langage et communication'");
    expect(preschoolGradingMigration).toContain("add column if not exists evaluation_mode");
    expect(preschoolGradingMigration).toContain("add column if not exists mastery_level");
    expect(preschoolGradingMigration).toContain("v_assessment->>'evaluationmode'");
    expect(preschoolGradingMigration).toContain("v_score->>'mastery'");
    expect(preschoolGradingMigration).toContain("save_grading_workspace_relational");
  });
});
