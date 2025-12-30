import { useState, useEffect } from "react";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Download,
  Calendar,
  FileText,
  CreditCard,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

interface FinancialStats {
  totalRevenue: number;
  totalPaid: number;
  outstandingDues: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  partialInvoices: number;
}

interface DailyRevenue {
  date: string;
  billed: number;
  paid: number;
  pending: number;
}

interface InvoiceSummary {
  invoice_number: string;
  patient_name: string;
  final_amount: number;
  paid_amount: number;
  outstanding: number;
  status: string;
  created_at: string;
}

const FinancialReports = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "all">("month");
  const [stats, setStats] = useState<FinancialStats>({
    totalRevenue: 0,
    totalPaid: 0,
    outstandingDues: 0,
    totalInvoices: 0,
    paidInvoices: 0,
    pendingInvoices: 0,
    partialInvoices: 0,
  });
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary[]>([]);

  useEffect(() => {
    fetchFinancialData();
  }, [period]);

  const fetchFinancialData = async () => {
    setLoading(true);
    try {
      const today = new Date();
      let startDate: Date;
      
      switch (period) {
        case "today":
          startDate = startOfDay(today);
          break;
        case "week":
          startDate = startOfWeek(today);
          break;
        case "month":
          startDate = startOfMonth(today);
          break;
        default:
          startDate = new Date(0); // All time
      }

      const endDate = period === "all" ? new Date() : endOfDay(today);

      // Fetch invoices
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          final_amount,
          paid_amount,
          payment_status,
          created_at,
          patient:patients(full_name, patient_id)
        `)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Calculate stats
      const totalRevenue = invoices?.reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0) || 0;
      const totalPaid = invoices?.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0) || 0;
      const outstandingDues = totalRevenue - totalPaid;

      const paidInvoices = invoices?.filter(inv => {
        const paid = Number(inv.paid_amount) || 0;
        const final = Number(inv.final_amount) || 0;
        return paid >= final;
      }).length || 0;

      const pendingInvoices = invoices?.filter(inv => {
        const paid = Number(inv.paid_amount) || 0;
        const final = Number(inv.final_amount) || 0;
        return paid === 0;
      }).length || 0;

      const partialInvoices = invoices?.filter(inv => {
        const paid = Number(inv.paid_amount) || 0;
        const final = Number(inv.final_amount) || 0;
        return paid > 0 && paid < final;
      }).length || 0;

      setStats({
        totalRevenue,
        totalPaid,
        outstandingDues: Math.max(0, outstandingDues),
        totalInvoices: invoices?.length || 0,
        paidInvoices,
        pendingInvoices,
        partialInvoices,
      });

      // Generate daily revenue data
      const days = period === "today" ? 1 : period === "week" ? 7 : period === "month" ? 30 : 90;
      const dailyData: DailyRevenue[] = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(today, i);
        const dayInvoices = invoices?.filter(inv => {
          const invDate = new Date(inv.created_at);
          return invDate.toDateString() === date.toDateString();
        }) || [];

        const billed = dayInvoices.reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0);
        const paid = dayInvoices.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0);
        const pending = billed - paid;

        dailyData.push({
          date: format(date, period === "today" ? "HH:mm" : "dd MMM"),
          billed,
          paid,
          pending,
        });
      }

      setDailyRevenue(dailyData);

      // Generate invoice summary
      const summary: InvoiceSummary[] = (invoices || []).map(inv => ({
        invoice_number: inv.invoice_number,
        patient_name: (inv.patient as any)?.full_name || "Unknown",
        final_amount: Number(inv.final_amount) || 0,
        paid_amount: Number(inv.paid_amount) || 0,
        outstanding: Math.max(0, (Number(inv.final_amount) || 0) - (Number(inv.paid_amount) || 0)),
        status: inv.payment_status,
        created_at: inv.created_at,
      }));

      setInvoiceSummary(summary);
    } catch (error) {
      console.error("Error fetching financial data:", error);
      toast.error("Failed to load financial data");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text("Financial Report", 14, 20);
    doc.setFontSize(12);
    doc.text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`, 14, 30);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 36);

    // Summary Table
    autoTable(doc, {
      startY: 45,
      head: [["Metric", "Amount"]],
      body: [
        ["Total Revenue", `₹${stats.totalRevenue.toLocaleString()}`],
        ["Total Paid", `₹${stats.totalPaid.toLocaleString()}`],
        ["Outstanding Dues", `₹${stats.outstandingDues.toLocaleString()}`],
        ["Total Invoices", stats.totalInvoices.toString()],
        ["Paid Invoices", stats.paidInvoices.toString()],
        ["Pending Invoices", stats.pendingInvoices.toString()],
        ["Partial Invoices", stats.partialInvoices.toString()],
      ],
      theme: "striped",
    });

    // Invoice Details
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Invoice #", "Patient", "Billed", "Paid", "Outstanding", "Status"]],
      body: invoiceSummary.map(inv => [
        inv.invoice_number,
        inv.patient_name,
        `₹${inv.final_amount.toLocaleString()}`,
        `₹${inv.paid_amount.toLocaleString()}`,
        `₹${inv.outstanding.toLocaleString()}`,
        inv.status,
      ]),
      theme: "striped",
    });

    doc.save(`financial-report-${period}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("Financial report exported successfully");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Paid</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
      case "partial":
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Partial</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-clinical-navy">Financial Reports</h2>
          <p className="text-muted-foreground">Revenue, payments, and outstanding dues analysis</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExportPDF} className="gap-2">
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <DollarSign className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{stats.totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <CreditCard className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{stats.totalPaid.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Paid</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{stats.outstandingDues.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Outstanding Dues</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100">
                <FileText className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalInvoices}</p>
                <p className="text-xs text-muted-foreground">Total Invoices</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Revenue Trends
          </CardTitle>
          <CardDescription>Daily revenue breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyRevenue}>
                <defs>
                  <linearGradient id="colorBilled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  className="text-xs fill-muted-foreground"
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  className="text-xs fill-muted-foreground"
                  tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => `₹${value.toLocaleString()}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="billed" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorBilled)"
                  name="Billed"
                />
                <Area 
                  type="monotone" 
                  dataKey="paid" 
                  stroke="#3B82F6" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorPaid)"
                  name="Paid"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">Billed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-muted-foreground">Paid</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoice Summary
          </CardTitle>
          <CardDescription>Detailed invoice breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : invoiceSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No invoices found
                    </TableCell>
                  </TableRow>
                ) : (
                  invoiceSummary.map((inv) => (
                    <TableRow key={inv.invoice_number} className="hover:bg-muted/30">
                      <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.patient_name}</TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{inv.final_amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{inv.paid_amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {inv.outstanding > 0 ? (
                          <span className="font-medium text-red-600">
                            ₹{inv.outstanding.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(inv.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(inv.created_at), "dd MMM yyyy")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancialReports;

