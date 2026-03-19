import { useEffect, useState } from "react";
import { 
  Users, 
  UserPlus, 
  ClipboardList, 
  Activity, 
  TrendingUp,
  Calendar,
  Clock,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  CreditCard,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatAppDate } from "@/lib/date";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
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
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface Stats {
  employees: number;
  patients: number;
  tests: number;
  pendingTests: number;
  completedToday: number;
  testsYesterday: number;
  newPatientsToday: number;
  newPatientsYesterday: number;
  newPatientsThisWeek: number;
  totalRevenue: number;
  revenueToday: number;
  revenueYesterday: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
  outstandingDues: number;
  paidInvoices: number;
  pendingInvoices: number;
}

interface RecentTest {
  id: string;
  test_name: string;
  status: string;
  test_date: string;
  patients: {
    full_name: string;
    patient_id: string;
  };
}

interface TestTrend {
  date: string;
  tests: number;
  revenue?: number;
}

interface RevenueTrend {
  date: string;
  revenue: number;
  paid: number;
  pending: number;
}

interface TopTest {
  test_name: string;
  count: number;
  revenue: number;
}

type DashboardOverviewProps = {
  onNavigate?: (tabId: string) => void;
};

const DashboardOverview = ({ onNavigate }: DashboardOverviewProps) => {
  const { user, isCollector } = useAuth();
  const { organization, loading: organizationLoading } = useOrganization();
  const [stats, setStats] = useState<Stats>({
    employees: 0,
    patients: 0,
    tests: 0,
    pendingTests: 0,
    completedToday: 0,
    testsYesterday: 0,
    newPatientsToday: 0,
    newPatientsYesterday: 0,
    newPatientsThisWeek: 0,
    totalRevenue: 0,
    revenueToday: 0,
    revenueYesterday: 0,
    revenueThisWeek: 0,
    revenueThisMonth: 0,
    outstandingDues: 0,
    paidInvoices: 0,
    pendingInvoices: 0,
  });
  const [recentTests, setRecentTests] = useState<RecentTest[]>([]);
  const [testTrends, setTestTrends] = useState<TestTrend[]>([]);
  const [revenueTrends, setRevenueTrends] = useState<RevenueTrend[]>([]);
  const [topTests, setTopTests] = useState<TopTest[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<{ name: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (organizationLoading) {
        return;
      }

      if (!organization?.id) {
        setStats({
          employees: 0, patients: 0, tests: 0, pendingTests: 0,
          completedToday: 0, testsYesterday: 0, newPatientsToday: 0, newPatientsYesterday: 0,
          newPatientsThisWeek: 0, totalRevenue: 0, revenueToday: 0, revenueYesterday: 0,
          revenueThisWeek: 0, revenueThisMonth: 0, outstandingDues: 0,
          paidInvoices: 0, pendingInvoices: 0,
        });
        setRecentTests([]);
        setTestTrends([]);
        setRevenueTrends([]);
        setTopTests([]);
        setStatusDistribution([]);
        setLoading(false);
        return;
      }

      try {
        const today = new Date();
        const yesterday = subDays(today, 1);
        const weekAgo = subDays(today, 7);
        const monthAgo = subDays(today, 30);
        let employeesQuery = (supabase as any).from("employees").select("id", { count: "exact", head: true });
        let patientsQuery = (supabase as any).from("patients").select("id", { count: "exact", head: true });
        let testsQuery = (supabase as any).from("patient_tests").select("id", { count: "exact", head: true });
        let pendingTestsQuery = (supabase as any)
          .from("patient_tests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        let completedTodayQuery = (supabase as any)
          .from("patient_tests")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("updated_at", startOfDay(today).toISOString())
          .lte("updated_at", endOfDay(today).toISOString());
        let newPatientsQuery = (supabase as any)
          .from("patients")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo.toISOString());
        let newPatientsTodayQuery = (supabase as any)
          .from("patients")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfDay(today).toISOString())
          .lte("created_at", endOfDay(today).toISOString());
        let newPatientsYesterdayQuery = (supabase as any)
          .from("patients")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfDay(yesterday).toISOString())
          .lte("created_at", endOfDay(yesterday).toISOString());
        let testsYesterdayQuery = (supabase as any)
          .from("patient_tests")
          .select("id", { count: "exact", head: true })
          .gte("test_date", startOfDay(yesterday).toISOString().split('T')[0])
          .lte("test_date", endOfDay(yesterday).toISOString().split('T')[0]);
        let invoicesYesterdayQuery = (supabase as any)
          .from("invoices")
          .select("id, paid_amount")
          .gte("created_at", startOfDay(yesterday).toISOString())
          .lte("created_at", endOfDay(yesterday).toISOString());
        let recentTestsQuery = (supabase as any)
          .from("patient_tests")
          .select(`
            id,
            test_name,
            status,
            test_date,
            patients (
              full_name,
              patient_id
            )
          `)
          .order("created_at", { ascending: false })
          .limit(5);
        let inProgressQuery = (supabase as any)
          .from("patient_tests")
          .select("id", { count: "exact", head: true })
          .eq("status", "in_progress");
        let allInvoicesQuery = (supabase as any)
          .from("invoices")
          .select("id, final_amount, paid_amount, payment_status, created_at");
        let invoicesTodayQuery = (supabase as any)
          .from("invoices")
          .select("id, final_amount, paid_amount")
          .gte("created_at", startOfDay(today).toISOString())
          .lte("created_at", endOfDay(today).toISOString());
        let invoicesWeekQuery = (supabase as any)
          .from("invoices")
          .select("id, final_amount, paid_amount")
          .gte("created_at", weekAgo.toISOString());
        let invoicesMonthQuery = (supabase as any)
          .from("invoices")
          .select("id, final_amount, paid_amount")
          .gte("created_at", monthAgo.toISOString());

        employeesQuery = employeesQuery.eq("organization_id" as any, organization.id);
        patientsQuery = patientsQuery.eq("organization_id" as any, organization.id);
        testsQuery = testsQuery.eq("organization_id" as any, organization.id);
        pendingTestsQuery = pendingTestsQuery.eq("organization_id" as any, organization.id);
        completedTodayQuery = completedTodayQuery.eq("organization_id" as any, organization.id);
        newPatientsQuery = newPatientsQuery.eq("organization_id" as any, organization.id);
        recentTestsQuery = recentTestsQuery.eq("organization_id" as any, organization.id);
        inProgressQuery = inProgressQuery.eq("organization_id" as any, organization.id);
        allInvoicesQuery = allInvoicesQuery.eq("organization_id" as any, organization.id);
        invoicesTodayQuery = invoicesTodayQuery.eq("organization_id" as any, organization.id);
        invoicesWeekQuery = invoicesWeekQuery.eq("organization_id" as any, organization.id);
        invoicesMonthQuery = invoicesMonthQuery.eq("organization_id" as any, organization.id);
        newPatientsTodayQuery = newPatientsTodayQuery.eq("organization_id" as any, organization.id);
        newPatientsYesterdayQuery = newPatientsYesterdayQuery.eq("organization_id" as any, organization.id);
        testsYesterdayQuery = testsYesterdayQuery.eq("organization_id" as any, organization.id);
        invoicesYesterdayQuery = invoicesYesterdayQuery.eq("organization_id" as any, organization.id);

        const [
          employeesRes, patientsRes, testsRes, pendingRes,
          completedTodayRes, newPatientsRes, recentTestsRes, inProgressRes,
          allInvoicesRes, invoicesTodayRes, invoicesWeekRes, invoicesMonthRes,
          newPatientsTodayRes, newPatientsYesterdayRes, testsYesterdayRes, invoicesYesterdayRes,
        ] = await Promise.all([
          employeesQuery, patientsQuery, testsQuery, pendingTestsQuery,
          completedTodayQuery, newPatientsQuery, recentTestsQuery, inProgressQuery,
          allInvoicesQuery, invoicesTodayQuery, invoicesWeekQuery, invoicesMonthQuery,
          newPatientsTodayQuery, newPatientsYesterdayQuery, testsYesterdayQuery, invoicesYesterdayQuery,
        ]);

        // Calculate financial stats
        const allInvoices = allInvoicesRes.data || [];
        const invoicesToday = invoicesTodayRes.data || [];
        const invoicesWeek = invoicesWeekRes.data || [];
        const invoicesMonth = invoicesMonthRes.data || [];

        const totalRevenue = allInvoices.reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0);
        const revenueToday = invoicesToday.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0);
        const revenueThisWeek = invoicesWeek.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0);
        const revenueThisMonth = invoicesMonth.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0);
        
        const totalBilled = allInvoices.reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0);
        const totalPaid = allInvoices.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0);
        const outstandingDues = totalBilled - totalPaid;

        const paidInvoices = allInvoices.filter(inv => {
          const paid = Number(inv.paid_amount) || 0;
          const final = Number(inv.final_amount) || 0;
          return paid >= final;
        }).length;

        const pendingInvoices = allInvoices.filter(inv => {
          const paid = Number(inv.paid_amount) || 0;
          const final = Number(inv.final_amount) || 0;
          return paid < final;
        }).length;

        // Get top tests by revenue
        const invoiceIds = allInvoices
          .map((invoice) => invoice.id)
          .filter((invoiceId): invoiceId is string => Boolean(invoiceId));

        let invoiceItemsRes:
          | {
              test_name: string;
              amount: number | null;
            }[]
          | null = [];

        if (invoiceIds.length > 0) {
          const { data } = await (supabase as any)
            .from("invoice_items")
            .select("test_name, amount")
            .in("invoice_id", invoiceIds)
            .eq("organization_id", organization.id);
          invoiceItemsRes = data;
        }

        const testRevenueMap = new Map<string, { count: number; revenue: number }>();
        invoiceItemsRes?.forEach(item => {
          const testName = item.test_name;
          const amount = Number(item.amount) || 0;
          const existing = testRevenueMap.get(testName) || { count: 0, revenue: 0 };
          testRevenueMap.set(testName, {
            count: existing.count + 1,
            revenue: existing.revenue + amount
          });
        });

        const topTestsData = Array.from(testRevenueMap.entries())
          .map(([test_name, data]) => ({
            test_name,
            count: data.count,
            revenue: data.revenue
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        setTopTests(topTestsData);

        // Generate revenue trends for last 7 days
        const revenueTrendsData: RevenueTrend[] = [];
        for (let i = 6; i >= 0; i--) {
          const date = subDays(today, i);
          let dayInvoicesQuery = (supabase as any)
            .from("invoices")
            .select("final_amount, paid_amount")
            .gte("created_at", startOfDay(date).toISOString())
            .lte("created_at", endOfDay(date).toISOString());

          if (organization?.id) {
            dayInvoicesQuery = dayInvoicesQuery.eq("organization_id" as any, organization.id);
          }

          const { data: dayInvoices } = await dayInvoicesQuery;

          const dayRevenue = (dayInvoices || []).reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0);
          const dayPaid = (dayInvoices || []).reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0);
          const dayPending = dayRevenue - dayPaid;

          revenueTrendsData.push({
            date: format(date, "EEE"),
            revenue: dayRevenue,
            paid: dayPaid,
            pending: dayPending
          });
        }
        setRevenueTrends(revenueTrendsData);

        const revenueYesterday = (invoicesYesterdayRes.data || []).reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0);

        setStats({
          employees: employeesRes.count || 0,
          patients: patientsRes.count || 0,
          tests: testsRes.count || 0,
          pendingTests: pendingRes.count || 0,
          completedToday: completedTodayRes.count || 0,
          testsYesterday: testsYesterdayRes.count || 0,
          newPatientsToday: newPatientsTodayRes.count || 0,
          newPatientsYesterday: newPatientsYesterdayRes.count || 0,
          newPatientsThisWeek: newPatientsRes.count || 0,
          totalRevenue,
          revenueToday,
          revenueYesterday,
          revenueThisWeek,
          revenueThisMonth,
          outstandingDues: Math.max(0, outstandingDues),
          paidInvoices,
          pendingInvoices,
        });

        setRecentTests(recentTestsRes.data || []);

        // Calculate status distribution
        const pending = pendingRes.count || 0;
        const inProgress = inProgressRes.count || 0;
        const completed = Math.max(0, (testsRes.count || 0) - pending - inProgress);
        
        setStatusDistribution([
          { name: "Completed", value: completed, color: "#10B981" },
          { name: "In Progress", value: inProgress, color: "#3B82F6" },
          { name: "Pending", value: pending, color: "#F59E0B" },
        ]);

        // Generate trend data for last 7 days
        const trends: TestTrend[] = [];
        for (let i = 6; i >= 0; i--) {
          const date = subDays(today, i);
          let dayTestsQuery = (supabase as any)
            .from("patient_tests")
            .select("id", { count: "exact", head: true })
            .gte("test_date", startOfDay(date).toISOString().split('T')[0])
            .lte("test_date", endOfDay(date).toISOString().split('T')[0]);

          if (organization?.id) {
            dayTestsQuery = dayTestsQuery.eq("organization_id" as any, organization.id);
          }

          const { count } = await dayTestsQuery;
          
          trends.push({
            date: format(date, "EEE"),
            tests: count || 0,
          });
        }
        setTestTrends(trends);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [organization?.id, organizationLoading]);

  const todayDate = format(new Date(), "EEEE, MMM d");

  const testsChange = stats.completedToday - stats.testsYesterday;
  const patientsChange = stats.newPatientsToday - stats.newPatientsYesterday;
  const revenueChange = stats.revenueToday - stats.revenueYesterday;

  const statCards = [
    {
      title: "Tests Today",
      value: stats.completedToday,
      subtitle: testsChange === 0
        ? `Same as yesterday (${stats.testsYesterday})`
        : testsChange > 0
        ? `↑ ${testsChange} more than yesterday`
        : `↓ ${Math.abs(testsChange)} fewer than yesterday`,
      icon: ClipboardList,
      trend: testsChange > 0 ? "up" : testsChange < 0 ? "down" : null,
      color: "from-blue-500 to-blue-600",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      title: "Revenue Today",
      value: stats.revenueToday,
      subtitle: revenueChange === 0
        ? `Same as yesterday`
        : revenueChange > 0
        ? `↑ ₹${revenueChange.toLocaleString()} more than yesterday`
        : `↓ ₹${Math.abs(revenueChange).toLocaleString()} less than yesterday`,
      icon: DollarSign,
      trend: revenueChange > 0 ? "up" : revenueChange < 0 ? "down" : null,
      color: "from-green-500 to-green-600",
      iconBg: "bg-green-500/10",
      iconColor: "text-green-500",
      format: (val: number) => `₹${val.toLocaleString()}`,
    },
    {
      title: "New Patients Today",
      value: stats.newPatientsToday,
      subtitle: patientsChange === 0
        ? `Same as yesterday (${stats.newPatientsYesterday})`
        : patientsChange > 0
        ? `↑ ${patientsChange} more than yesterday`
        : `↓ ${Math.abs(patientsChange)} fewer than yesterday`,
      icon: UserPlus,
      trend: patientsChange > 0 ? "up" : patientsChange < 0 ? "down" : null,
      color: "from-emerald-500 to-emerald-600",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
    },
    {
      title: "Pending Tests",
      value: stats.pendingTests,
      subtitle: `${stats.outstandingDues > 0 ? `₹${stats.outstandingDues.toLocaleString()} outstanding dues` : "All dues cleared"}`,
      icon: Activity,
      trend: stats.pendingTests > 5 ? "down" : null,
      color: "from-amber-500 to-amber-600",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Completed</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">In Progress</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Today's date header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>{todayDate}</span>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Today's Stats</span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <Card key={card.title} className="relative overflow-hidden hover:shadow-lg transition-all duration-300 border-0 shadow-md">
            <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-[0.03]`} />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`p-2.5 rounded-xl ${card.iconBg}`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <div className="text-3xl font-bold text-foreground">
                  {loading ? "..." : (card.format ? card.format(card.value) : card.value.toLocaleString())}
                </div>
                {card.trend && (
                  <div className={`flex items-center text-xs ${card.trend === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {card.trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  </div>
                )}
              </div>
              {card.subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trends Chart */}
        <Card className="lg:col-span-2 shadow-md border-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Revenue Trends
                </CardTitle>
                <CardDescription>Revenue over the last 7 days</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrends}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
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
                    dataKey="revenue" 
                    stroke="#10B981" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorRevenue)"
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

        {/* Top Tests by Revenue */}
        <Card className="shadow-md border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Top Tests
            </CardTitle>
            <CardDescription>By revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
              ) : topTests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No data</div>
              ) : (
                topTests.map((test, index) => (
                  <div key={test.test_name} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{test.test_name}</p>
                        <p className="text-xs text-muted-foreground">{test.count} tests</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">₹{test.revenue.toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Activity Chart */}
      <Card className="shadow-md border-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Test Activity
              </CardTitle>
              <CardDescription>Tests conducted over the last 7 days</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={testTrends}>
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
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar 
                  dataKey="tests" 
                  fill="hsl(var(--primary))" 
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tests */}
        <Card className="shadow-md border-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Recent Tests
                </CardTitle>
                <CardDescription>Latest test records</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary"
                onClick={() => onNavigate?.("tests")}
              >
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : recentTests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No recent tests</div>
              ) : (
                recentTests.map((test) => (
                  <div key={test.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{test.test_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {test.patients?.full_name} • {test.patients?.patient_id}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(test.status)}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatAppDate(test.test_date)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="shadow-md border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common tasks at a glance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant="outline" 
                className="h-auto flex-col gap-2 py-6 hover:bg-primary/5 hover:border-primary/30 transition-all"
                onClick={() => onNavigate?.("patients")}
              >
                <UserPlus className="h-6 w-6 text-primary" />
                <span className="font-medium">Add Patient</span>
                <span className="text-xs text-muted-foreground">Register new patient</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto flex-col gap-2 py-6 hover:bg-primary/5 hover:border-primary/30 transition-all"
                onClick={() => onNavigate?.("tests")}
              >
                <ClipboardList className="h-6 w-6 text-primary" />
                <span className="font-medium">New Test</span>
                <span className="text-xs text-muted-foreground">Create test record</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto flex-col gap-2 py-6 hover:bg-primary/5 hover:border-primary/30 transition-all"
                onClick={() => onNavigate?.("reports")}
                disabled={isCollector}
              >
                <FileText className="h-6 w-6 text-primary" />
                <span className="font-medium">View Reports</span>
                <span className="text-xs text-muted-foreground">
                  {isCollector ? "Admin only" : "Analytics & exports"}
                </span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto flex-col gap-2 py-6 hover:bg-primary/5 hover:border-primary/30 transition-all"
                onClick={() => onNavigate?.("tests")}
              >
                <Activity className="h-6 w-6 text-primary" />
                <span className="font-medium">Pending Tests</span>
                <span className="text-xs text-muted-foreground">{stats.pendingTests} awaiting</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardOverview;
