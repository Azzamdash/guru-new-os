import { Button } from "@/components/ui/button";
import { Printer, Download, Share2 } from "lucide-react";
import { exportToCSV, printReport, shareSummary, type CsvColumn } from "@/lib/export-utils";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";

type Props<T extends Record<string, unknown>> = {
  filename: string;
  summaryTitle: string;
  summaryText: string;
  rows?: T[];
  columns?: CsvColumn<T>[];
};

export function ReportActions<T extends Record<string, unknown>>({ filename, summaryTitle, summaryText, rows, columns }: Props<T>) {
  const { t } = useLang();
  const canExport = rows && rows.length > 0 && columns && columns.length > 0;
  return (
    <div className="flex gap-2 flex-wrap print:hidden">
      <Button variant="outline" size="sm" onClick={printReport} className="gap-1.5">
        <Printer className="w-4 h-4" /> {t("action_print")}
      </Button>
      {canExport && (
        <Button variant="outline" size="sm" onClick={() => { exportToCSV(filename, rows!, columns!); toast.success(t("exported_csv")); }} className="gap-1.5">
          <Download className="w-4 h-4" /> {t("action_export_csv")}
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => shareSummary(summaryTitle, summaryText)} className="gap-1.5">
        <Share2 className="w-4 h-4" /> {t("action_share")}
      </Button>
    </div>
  );
}
