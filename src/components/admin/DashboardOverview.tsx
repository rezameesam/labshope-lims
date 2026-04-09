import { Suspense, lazy, useEffect, useState } from "react";
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

const DashboardOverviewCharts = lazy(() => import("./DashboardOverviewCharts"));
const QuickRegisterForm = lazy(() => import("./dashboard/QuickRegisterForm"));
const PendingResultsWidget = lazy(() => import("./dashboard/PendingResultsWidget"));

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

type RevenueAccumulator = {
  totalRevenue: number;
  totalPaid: number;
  paidInvoices: number;
  pendingInvoices: number;
};

type DashboardOverviewStatsRow = {
  employees: number;
  patients: number;
  tests: number;
  pending_tests: number;
  in_progress_tests: number;
  completed_today: number;
  tests_yesterday: number;
  new_patients_today: number;
  new_patients_yesterday: number;
  new_patients_this_week: number;
  total_revenue: number;
  revenue_today: number;
  revenue_yesterday: number;
  revenue_this_week: number;
  revenue_this_month: number;
  outstanding_dues: number;
  paid_invoices: number;
  pending_invoices: number;
};

type DashboardOverviewAnalyticsRow = {
  top_tests: TopTest[];
  revenue_trends: RevenueTrend[];
  test_trends: TestTrend[];
};

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
        const { data: statsRow, error: statsError } = await (supabase as any)
          .rpc("get_dashboard_overview_stats", { p_organization_id: organization.id })
          .single();

        if (statsError) throw statsError;

        const { data: analyticsRow, error: analyticsError } = await (supabase as any)
          .rpc("get_dashboard_overview_analytics", { p_organization_id: organization.id })
          .single();

        if (analyticsError) throw analyticsError;

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

        recentTestsQuery = recentTestsQuery.eq("organization_id" as any, organization.id);

        const [recentTestsRes] = await Promise.all([recentTestsQuery]);

        const overviewStats = statsRow as DashboardOverviewStatsRow;
        const analytics = analyticsRow as DashboardOverviewAnalyticsRow;

        setTopTests(analytics.top_tests || []);
        setRevenueTrends(analytics.revenue_trends || []);

        setStats({
          employees: overviewStats.employees || 0,
          patients: overviewStats.patients || 0,
          tests: overviewStats.tests || 0,
          pendingTests: overviewStats.pending_tests || 0,
          completedToday: overviewStats.completed_today || 0,
          testsYesterday: overviewStats.tests_yesterday || 0,
          newPatientsToday: overviewStats.new_patients_today || 0,
          newPatientsYesterday: overviewStats.new_patients_yesterday || 0,
          newPatientsThisWeek: overviewStats.new_patients_this_week || 0,
          totalRevenue: Number(overviewStats.total_revenue) || 0,
          revenueToday: Number(overviewStats.revenue_today) || 0,
          revenueYesterday: Number(overviewStats.revenue_yesterday) || 0,
          revenueThisWeek: Number(overviewStats.revenue_this_week) || 0,
          revenueThisMonth: Number(overviewStats.revenue_this_month) || 0,
          outstandingDues: Math.max(0, Number(overviewStats.outstanding_dues) || 0),
          paidInvoices: overviewStats.paid_invoices || 0,
          pendingInvoices: overviewStats.pending_invoices || 0,
        });

        setRecentTests(recentTestsRes.data || []);

        // Calculate status distribution
        const pending = overviewStats.pending_tests || 0;
        const inProgress = overviewStats.in_progress_tests || 0;
        const completed = Math.max(0, (overviewStats.tests || 0) - pending - inProgress);
        
        setStatusDistribution([
          { name: "Completed", value: completed, color: "#10B981" },
          { name: "In Progress", value: inProgress, color: "#3B82F6" },
          { name: "Pending", value: pending, color: "#F59E0B" },
        ]);

        setTestTrends(analytics.test_trends || []);
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

      {/* Quick Register + Pending Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl bg-muted/40" />}>
          <QuickRegisterForm onNavigate={onNavigate} />
        </Suspense>
        <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl bg-muted/40" />}>
          <PendingResultsWidget onNavigate={onNavigate} />
        </Suspense>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Suspense fallback={<div className="lg:col-span-2 h-[360px] animate-pulse rounded-2xl bg-muted/40" />}>
          <DashboardOverviewCharts revenueTrends={revenueTrends} testTrends={testTrends} />
        </Suspense>

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
