import { IndianRupee, Clock, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface BillingSummaryProps {
  totalRevenue: number;
  todayRevenue: number;
  pendingAmount: number;
  totalInvoices: number;
}

const BillingSummary = ({
  totalRevenue,
  todayRevenue,
  pendingAmount,
  totalInvoices,
}: BillingSummaryProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <IndianRupee className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">₹{totalRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <IndianRupee className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">₹{todayRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Today's Revenue</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">₹{pendingAmount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Pending Amount</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100">
              <Receipt className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalInvoices}</p>
              <p className="text-xs text-muted-foreground">Total Invoices</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingSummary;
