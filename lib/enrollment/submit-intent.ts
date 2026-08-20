export type EnrollmentSubmitIntent = "draft" | "validate";

type SubmitterDescriptor = { name?: string; value?: string } | null;

/** Le bouton cliqué n'est pas inclus par `new FormData(form)` : on le lit explicitement. */
export function resolveEnrollmentSubmitIntent(
  submitter: SubmitterDescriptor,
): EnrollmentSubmitIntent {
  return submitter?.name === "intent" && submitter.value === "validate"
    ? "validate"
    : "draft";
}
