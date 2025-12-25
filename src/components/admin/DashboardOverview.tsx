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
  ArrowDownRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
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
}

const DashboardOverview = () => {
  const [stats, setStats] = useState<Stats>({
    employees: 0,
    patients: 0,
    tests: 0,
    pendingTests: 0,
    completedToday: 0,
    newPatientsThisWeek: 0,
  });
  const [recentTests, setRecentTests] = useState<RecentTest[]>([]);
  const [testTrends, setTestTrends] = useState<TestTrend[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<{ name: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const today = new Date();
        const weekAgo = subDays(today, 7);

        const [
          employeesRes, 
          patientsRes, 
          testsRes, 
          pendingRes,
          completedTodayRes,
          newPatientsRes,
          recentTestsRes,
          inProgressRes,
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
        ]);

        setStats({
          employees: employeesRes.count || 0,
          patients: patientsRes.count || 0,
          tests: testsRes.count || 0,
          pendingTests: pendingRes.count || 0,
          completedToday: completedTodayRes.count || 0,
          newPatientsThisWeek: newPatientsRes.count || 0,
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
      title: "Total Employees",
      value: stats.employees,
      icon: Users,
      trend: null,
      color: "from-blue-500 to-blue-600",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
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
      title: "Total Tests",
      value: stats.tests,
      subtitle: `${stats.completedToday} completed today`,
      icon: ClipboardList,
      trend: "up",
      color: "from-violet-500 to-violet-600",
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-500",
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
                  {loading ? "..." : card.value.toLocaleString()}
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
        {/* Test Trends Chart */}
        <Card className="lg:col-span-2 shadow-md border-0">
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
                <AreaChart data={testTrends}>
                  <defs>
                    <linearGradient id="colorTests" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
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
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="tests" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorTests)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card className="shadow-md border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Test Status
            </CardTitle>
            <CardDescription>Distribution by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {statusDistribution.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-muted-foreground">{item.name}</span>
                </div>
              ))}
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
