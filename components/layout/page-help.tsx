import { getPageHelp } from "@/lib/help-content";
import { HelpDrawer } from "./help-drawer";

/**
 * Server-side wrapper — sayfa için yardım kaydı varsa HelpDrawer render eder.
 *
 * ```tsx
 * <PageHeader
 *   title="Müşteriler"
 *   actions={
 *     <>
 *       <PageHelp pageKey="customers" />
 *       <Button>Yeni</Button>
 *     </>
 *   }
 * />
 * ```
 */
export function PageHelp({ pageKey }: { pageKey: string }) {
  const help = getPageHelp(pageKey);
  if (!help) return null;
  return <HelpDrawer help={help} />;
}
