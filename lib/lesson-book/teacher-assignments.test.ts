import { describe, expect, it } from "vitest";
import { teacherAssignmentsFromRows } from "./store";

describe("teacherAssignmentsFromRows", () => {
  it("lit la réponse sécurisée destinée au cahier de textes", () => {
    expect(
      teacherAssignmentsFromRows([
        {
          class_group_id: "classe-1",
          class_name: "3e année A",
          school_subject_id: "matiere-1",
          subject_label: "Français",
        },
      ]),
    ).toEqual([
      {
        classId: "classe-1",
        className: "3e année A",
        subjectId: "matiere-1",
        subjectLabel: "Français",
      },
    ]);
  });

  it("conserve le repli historique et élimine les doublons", () => {
    const row = {
      class_group_id: "classe-1",
      school_subject_id: "matiere-1",
      class_groups: { name: "3e année A" },
      school_subjects: { label: "Mathématiques" },
    };
    expect(teacherAssignmentsFromRows([row, row])).toHaveLength(1);
  });
});
