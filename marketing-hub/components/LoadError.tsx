/**
 * Shown when a view cannot reach Supabase. Deliberately specific: the usual
 * causes are an unset environment variable or a schema that was never applied,
 * and saying so is more use than "something went wrong".
 */
export function LoadError({ error }: { error: unknown }) {
  return (
    <div className="panel">
      <h1 className="page-header__title">Can&apos;t reach the database</h1>
      <p className="field__hint" style={{ marginTop: "var(--space-3)" }}>
        {error instanceof Error ? error.message : "Unknown error."}
      </p>
      <p className="field__hint" style={{ marginTop: "var(--space-3)" }}>
        Check the Supabase values in <code>.env.local</code>, and confirm that{" "}
        <code>supabase/schema.sql</code> has been applied to the project.
      </p>
    </div>
  );
}
