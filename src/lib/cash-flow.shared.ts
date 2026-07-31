export type CashFlowReport = {
  from: string;
  to: string;
  operating: { inflow: number; outflow: number; net: number };
  investing: { inflow: number; outflow: number; net: number };
  financing: { inflow: number; outflow: number; net: number };
  netChange: number;
  byMonth: Array<{
    month: string;
    operating: number;
    investing: number;
    financing: number;
    net: number;
  }>;
  breakdown: Array<{
    label: string;
    labelAr?: string;
    direction: "in" | "out";
    category: "operating" | "investing" | "financing";
    amount: number;
  }>;
};

export type CashFlowCashRow = {
  type: string;
  amount: number;
  occurred_at: string;
  transfer_group?: string | null;
};

type MonthlyCashFlow = CashFlowReport["byMonth"][number];

function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function buildCashFlowReport(
  from: string,
  to: string,
  cashRows: CashFlowCashRow[],
): CashFlowReport {
  const months = new Map<string, MonthlyCashFlow>();
  const getMonth = (key: string) => {
    let month = months.get(key);
    if (!month) {
      month = {
        month: key,
        operating: 0,
        investing: 0,
        financing: 0,
        net: 0,
      };
      months.set(key, month);
    }
    return month;
  };

  let operatingInflow = 0;
  let operatingOutflow = 0;
  let financingInflow = 0;
  let financingOutflow = 0;

  for (const row of cashRows) {
    if (row.transfer_group) continue;

    const amount = Number(row.amount) || 0;
    if (amount === 0) continue;

    if (row.type === "collection") {
      operatingInflow += amount;
      getMonth(monthKey(row.occurred_at)).operating += amount;
    } else if (row.type === "other_out") {
      operatingOutflow += amount;
      getMonth(monthKey(row.occurred_at)).operating -= amount;
    } else if (row.type === "deposit") {
      financingInflow += amount;
      getMonth(monthKey(row.occurred_at)).financing += amount;
    } else if (row.type === "personal_withdrawal") {
      financingOutflow += amount;
      getMonth(monthKey(row.occurred_at)).financing -= amount;
    }
  }

  for (const month of months.values()) {
    month.net = month.operating + month.investing + month.financing;
  }

  const operatingNet = operatingInflow - operatingOutflow;
  const financingNet = financingInflow - financingOutflow;

  return {
    from,
    to,
    operating: {
      inflow: operatingInflow,
      outflow: operatingOutflow,
      net: operatingNet,
    },
    investing: { inflow: 0, outflow: 0, net: 0 },
    financing: {
      inflow: financingInflow,
      outflow: financingOutflow,
      net: financingNet,
    },
    netChange: operatingNet + financingNet,
    byMonth: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month)),
    breakdown: [
      {
        label: "Customer collections",
        labelAr: "تحصيلات العملاء",
        direction: "in",
        category: "operating",
        amount: operatingInflow,
      },
      {
        label: "Operating cash outflows",
        labelAr: "مدفوعات التشغيل النقدية",
        direction: "out",
        category: "operating",
        amount: operatingOutflow,
      },
      {
        label: "Owner/Investor deposits",
        labelAr: "إيداعات الملاك/المستثمرين",
        direction: "in",
        category: "financing",
        amount: financingInflow,
      },
      {
        label: "Owner/Investor withdrawals",
        labelAr: "مسحوبات الملاك/المستثمرين",
        direction: "out",
        category: "financing",
        amount: financingOutflow,
      },
    ],
  };
}
