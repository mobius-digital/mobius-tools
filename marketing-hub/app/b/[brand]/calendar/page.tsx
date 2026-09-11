import { redirect } from "next/navigation";
import { currentBrandId } from "@/lib/brandContext";

export const dynamic = "force-dynamic";

/**
 * The calendar used to live at /calendar; it is the board's home now. Old
 * bookmarks and Slack links land here and are sent on.
 */
export default async function OldCalendarPage() {
  redirect(`/b/${await currentBrandId()}/`);
}
