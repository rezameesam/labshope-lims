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
  AlertCircle,
  Bell
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
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
  newPatientsThisWeek: number;
  totalRevenue: number;
  revenueToday: number;
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

const DashboardOverview = () => {
  const { user, isCollector } = useAuth();
  const [stats, setStats] = useState<Stats>({
    employees: 0,
    patients: 0,
    tests: 0,
    pendingTests: 0,
    completedToday: 0,
    newPatientsThisWeek: 0,
    totalRevenue: 0,
    revenueToday: 0,
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
      try {
        const today = new Date();
        const weekAgo = subDays(today, 7);

        const monthAgo = subDays(today, 30);
        const [
          employeesRes, 
          patientsRes, 
          testsRes, 
          pendingRes,
          completedTodayRes,
          newPatientsRes,
          recentTestsRes,
          inProgressRes,
          allInvoicesRes,
          invoicesTodayRes,
          invoicesWeekRes,
          invoicesMonthRes,
        ] = await Promise.all([
          supabase.from("employees").select("id", { count: "exact", head: true }),
          supabase.from("patients").select("id", { count: "exact", head: true }),
          supabase.from("patient_tests").select("id", { count: "exact", head: true }),
          supabase.from("patient_tests").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("patient_tests").select("id", { count: "exact", head: true })
            .eq("status", "completed")
            .gte("updated_at", startOfDay(today).toISOString())
            .lte("updated_at", endOfDay(today).toISOString()),
          supabase.from("patients").select("id", { count: "exact", head: true })
            .gte("created_at", weekAgo.toISOString()),
          supabase.from("patient_tests")
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
            .limit(5),
          supabase.from("patient_tests").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
          supabase.from("invoices").select("final_amount, paid_amount, payment_status, created_at"),
          supabase.from("invoices")
            .select("final_amount, paid_amount")
            .gte("created_at", startOfDay(today).toISOString())
            .lte("created_at", endOfDay(today).toISOString()),
          supabase.from("invoices")
            .select("final_amount, paid_amount")
            .gte("created_at", weekAgo.toISOString()),
          supabase.from("invoices")
            .select("final_amount, paid_amount")
            .gte("created_at", monthAgo.toISOString()),
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
        const { data: invoiceItemsRes } = await supabase
          .from("invoice_items")
          .select("test_name, amount");

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
          const { data: dayInvoices } = await supabase
            .from("invoices")
            .select("final_amount, paid_amount")
            .gte("created_at", startOfDay(date).toISOString())
            .lte("created_at", endOfDay(date).toISOString());

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

        setStats({
          employees: employeesRes.count || 0,
          patients: patientsRes.count || 0,
          tests: testsRes.count || 0,
          pendingTests: pendingRes.count || 0,
          completedToday: completedTodayRes.count || 0,
          newPatientsThisWeek: newPatientsRes.count || 0,
          totalRevenue,
          revenueToday,
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
        const completed = (testsRes.count || 0) - pending - inProgress;
        
        setStatusDistribution([
          { name: "Completed", value: completed, color: "#10B981" },
          { name: "In Progress", value: inProgress, color: "#3B82F6" },
          { name: "Pending", value: pending, color: "#F59E0B" },
        ]);

        // Generate trend data for last 7 days
        const trends: TestTrend[] = [];
        for (let i = 6; i >= 0; i--) {
          const date = subDays(today, i);
          const { count } = await supabase
            .from("patient_tests")
            .select("id", { count: "exact", head: true })
            .gte("test_date", startOfDay(date).toISOString().split('T')[0])
            .lte("test_date", endOfDay(date).toISOString().split('T')[0]);
          
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
  }, []);

  const statCards = [
    {
      title: "Total Revenue",
      value: stats.totalRevenue,
      subtitle: `₹${stats.revenueThisMonth.toLocaleString()} this month`,
      icon: DollarSign,
      trend: "up",
      color: "from-green-500 to-green-600",
      iconBg: "bg-green-500/10",
      iconColor: "text-green-500",
      format: (val: number) => `₹${val.toLocaleString()}`,
    },
    {
      title: "Outstanding Dues",
      value: stats.outstandingDues,
      subtitle: `${stats.pendingInvoices} unpaid invoices`,
      icon: CreditCard,
      trend: stats.outstandingDues > 0 ? "down" : null,
      color: "from-red-500 to-red-600",
      iconBg: "bg-red-500/10",
      iconColor: "text-red-500",
      format: (val: number) => `₹${val.toLocaleString()}`,
    },
    {
      title: "Total Patients",
      value: stats.patients,
      subtitle: `+${stats.newPatientsThisWeek} this week`,
      icon: UserPlus,
      trend: "up",
      color: "from-emerald-500 to-emerald-600",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
    },
    {
      title: "Pending Tests",
      value: stats.pendingTests,
      subtitle: "Awaiting results",
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
              <Button variant="ghost" size="sm" className="text-primary">
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
                        {format(new Date(test.test_date), "dd MMM")}
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
              >
                <UserPlus className="h-6 w-6 text-primary" />
                <span className="font-medium">Add Patient</span>
                <span className="text-xs text-muted-foreground">Register new patient</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto flex-col gap-2 py-6 hover:bg-primary/5 hover:border-primary/30 transition-all"
              >
                <ClipboardList className="h-6 w-6 text-primary" />
                <span className="font-medium">New Test</span>
                <span className="text-xs text-muted-foreground">Create test record</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto flex-col gap-2 py-6 hover:bg-primary/5 hover:border-primary/30 transition-all"
              >
                <FileText className="h-6 w-6 text-primary" />
                <span className="font-medium">View Reports</span>
                <span className="text-xs text-muted-foreground">Analytics & exports</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto flex-col gap-2 py-6 hover:bg-primary/5 hover:border-primary/30 transition-all"
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
