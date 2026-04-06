import { useState, lazy, Suspense, useCallback } from "react";
import {
  BookOpen, List, FileSpreadsheet, TrendingUp, Plus, Loader2, Scale, RefreshCw, ClipboardCheck, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";

const ChartOfAccounts = lazy(() => import("./finance/ChartOfAccounts"));
const AccountLedger = lazy(() => import("./finance/AccountLedger"));
const JournalEntryForm = lazy(() => import("./finance/JournalEntryForm"));
const TransactionsList = lazy(() => import("./finance/TransactionsList"));
const BalanceSheet = lazy(() => import("./finance/BalanceSheet"));
const ProfitAndLoss = lazy(() => import("./finance/ProfitAndLoss"));
const TrialBalance = lazy(() => import("./finance/TrialBalance"));
const OutsourceReport = lazy(() => import("./finance/OutsourceReport"));

type SubTab = "transactions" | "new-entry" | "balance-sheet" | "profit-loss" | "trial-balance" | "outsource" | "accounts" | "ledger";

interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

const SUB_TABS: { id: SubTab; label: string; icon: typeof BookOpen; hidden?: boolean }[] = [
  { id: "transactions", label: "Transactions", icon: List },
  { id: "new-entry", label: "New Entry", icon: Plus },
  { id: "balance-sheet", label: "Balance Sheet", icon: Scale },
  { id: "profit-loss", label: "Profit & Loss", icon: TrendingUp },
  { id: "trial-balance", label: "Trial Balance", icon: ClipboardCheck },
  { id: "outsource", label: "Outsource Report", icon: Send },
  { id: "accounts", label: "Chart of Accounts", icon: BookOpen },
  { id: "ledger", label: "Ledger", icon: FileSpreadsheet, hidden: true },
];

const ManageFinance = () => {
  const { organization } = useOrganization();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("transactions");
  const [ledgerAccount, setLedgerAccount] = useState<LedgerAccount | null>(null);
  const [syncing, setSyncing] = useState(false);

  const openLedger = (account: LedgerAccount) => {
    setLedgerAccount(account);
    setActiveSubTab("ledger");
  };

  const closeLedger = () => {
    setLedgerAccount(null);
    setActiveSubTab("accounts");
  };

  const handleSyncBilling = useCallback(async () => {
    if (!organization?.id) return;
    setSyncing(true);
    try {
      const { data, error } = await (supabase as any).rpc("finance_sync_existing_invoices", {
        org_id: organization.id,
      });
      if (error) throw error;
      const count = typeof data === "number" ? data : 0;
      if (count > 0) {
        toast.success(`Synced ${count} billing record${count > 1 ? "s" : ""} to finance`);
      } else {
        toast.info("All billing records are already synced");
      }
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    }
    setSyncing(false);
  }, [organization?.id]);

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex flex-wrap gap-1 p-1 bg-muted/50 rounded-lg border">
        {SUB_TABS.filter((t) => !t.hidden).map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.id}
              variant={activeSubTab === tab.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSubTab(tab.id)}
              className={cn(
                "gap-2 text-sm",
                activeSubTab === tab.id ? "" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </Button>
          );
        })}

        {/* Sync from Billing button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncBilling}
          disabled={syncing}
          className="ml-auto gap-2 text-sm"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{syncing ? "Syncing..." : "Sync Billing"}</span>
        </Button>

        {/* Show ledger breadcrumb when active */}
        {activeSubTab === "ledger" && ledgerAccount && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground px-2">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span className="font-mono text-xs">{ledgerAccount.code}</span>
            <span>{ledgerAccount.name}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        {activeSubTab === "transactions" && <TransactionsList />}
        {activeSubTab === "new-entry" && (
          <JournalEntryForm
            onSaved={() => setActiveSubTab("transactions")}
            onCancel={() => setActiveSubTab("transactions")}
          />
        )}
        {activeSubTab === "balance-sheet" && <BalanceSheet />}
        {activeSubTab === "profit-loss" && <ProfitAndLoss />}
        {activeSubTab === "trial-balance" && <TrialBalance />}
        {activeSubTab === "outsource" && <OutsourceReport />}
        {activeSubTab === "accounts" && <ChartOfAccounts onOpenLedger={openLedger} />}
        {activeSubTab === "ledger" && ledgerAccount && (
          <AccountLedger account={ledgerAccount} onBack={closeLedger} />
        )}
      </Suspense>
    </div>
  );
};

export default ManageFinance;
