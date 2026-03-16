import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  TestTube,
  Calendar,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatAppDate, formatAppDateTime } from "@/lib/date";
import { useOrganization } from "@/contexts/OrganizationContext";

interface LabAnalyticsProps {
  labId: string;
  labName: string;
  labCode: string;
}

interface TestStats {
  total: number;
  completed: number;
  pending: number;
  in_progress: number;
  cancelled: number;
}

interface TestBreakdown {
  test_name: string;
  count: number;
  completed: number;
  pending: number;
}

interface RecentTest {
  id: string;
  test_name: string;
  patient_name: string;
  patient_id: string;
  status: string;
  test_date: string;
  created_at: string;
}

const LabAnalytics = ({ labId, labName, labCode }: LabAnalyticsProps) => {
  const { organization, loading: organizationLoading } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TestStats>({
    total: 0,
    completed: 0,
    pending: 0,
    in_progress: 0,
    cancelled: 0,
  });
  const [testBreakdown, setTestBreakdown] = useState<TestBreakdown[]>([]);
  const [recentTests, setRecentTests] = useState<RecentTest[]>([]);
  const [pendingTests, setPendingTests] = useState<RecentTest[]>([]);
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "all">("30d");

  const fetchAnalytics = useCallback(async () => {
    if (!organization?.id) {
      setStats({
        total: 0,
        completed: 0,
        pending: 0,
        in_progress: 0,
        cancelled: 0,
      });
      setTestBreakdown([]);
      setRecentTests([]);
      setPendingTests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Build date filter
      let dateFilter = {};
      if (dateRange === "7d") {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        dateFilter = { created_at: { gte: sevenDaysAgo.toISOString() } };
      } else if (dateRange === "30d") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        dateFilter = { created_at: { gte: thirtyDaysAgo.toISOString() } };
      }

      // Fetch test statistics
      let query = supabase
        .from("patient_tests")
        .select("id, status, test_name, created_at, patients!inner(full_name, patient_id)")
        .eq("lab_id", labId);

      query = query.eq("organization_id" as any, organization.id);

      if (dateRange !== "all") {
        const dateThreshold = dateRange === "7d" 
          ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        query = query.gte("created_at", dateThreshold.toISOString());
      }

      const { data: tests, error } = await query;

      if (error) throw error;

      // Calculate statistics
      const testStats: TestStats = {
        total: tests?.length || 0,
        completed: tests?.filter((t) => t.status === "completed").length || 0,
        pending: tests?.filter((t) => t.status === "pending").length || 0,
        in_progress: tests?.filter((t) => t.status === "in_progress").length || 0,
        cancelled: tests?.filter((t) => t.status === "cancelled").length || 0,
      };
      setStats(testStats);

      // Test breakdown by type
      const breakdownMap = new Map<string, { count: number; completed: number; pending: number }>();
      tests?.forEach((test) => {
        const existing = breakdownMap.get(test.test_name) || { count: 0, completed: 0, pending: 0 };
        existing.count++;
        if (test.status === "completed") existing.completed++;
        if (test.status === "pending") existing.pending++;
        breakdownMap.set(test.test_name, existing);
      });

      const breakdown: TestBreakdown[] = Array.from(breakdownMap.entries())
        .map(([test_name, data]) => ({
          test_name,
          ...data,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setTestBreakdown(breakdown);

      // Recent tests (last 10)
      const recent = (tests || [])
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10)
        .map((t) => ({
          id: t.id,
          test_name: t.test_name,
          patient_name: (t.patients as any)?.full_name || "Unknown",
          patient_id: (t.patients as any)?.patient_id || "",
          status: t.status,
          test_date: t.created_at,
          created_at: t.created_at,
        }));
      setRecentTests(recent);

      // Pending tests
      const pending = (tests || [])
        .filter((t) => t.status === "pending" || t.status === "in_progress")
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(0, 20)
        .map((t) => ({
          id: t.id,
          test_name: t.test_name,
          patient_name: (t.patients as any)?.full_name || "Unknown",
          patient_id: (t.patients as any)?.patient_id || "",
          status: t.status,
          test_date: t.created_at,
          created_at: t.created_at,
        }));
      setPendingTests(pending);
    } catch (error: any) {
      console.error("Error fetching lab analytics:", error);
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [dateRange, labId, organization?.id]);

  useEffect(() => {
    if (organizationLoading) {
      return;
    }

    void fetchAnalytics();
  }, [fetchAnalytics, organizationLoading]);

  const completionRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : "0";

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading analytics...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-xl font-bold text-clinical-navy">{labName}</h3>
        <p className="text-sm text-muted-foreground">Lab Code: {labCode}</p>
      </div>

      {/* Date Range Selector */}
      <div className="flex gap-2">
        <Badge
          variant={dateRange === "7d" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setDateRange("7d")}
        >
          Last 7 Days
        </Badge>
        <Badge
          variant={dateRange === "30d" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setDateRange("30d")}
        >
          Last 30 Days
        </Badge>
        <Badge
          variant={dateRange === "all" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setDateRange("all")}
        >
          All Time
        </Badge>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <TestTube className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Tests</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Activity className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.in_progress}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completionRate}%</p>
                <p className="text-xs text-muted-foreground">Completion Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="breakdown" className="space-y-4">
        <TabsList>
          <TabsTrigger value="breakdown">Test Breakdown</TabsTrigger>
          <TabsTrigger value="pending">Pending Tests</TabsTrigger>
          <TabsTrigger value="recent">Recent Tests</TabsTrigger>
        </TabsList>

        <TabsContent value="breakdown" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Breakdown by Type</CardTitle>
              <CardDescription>Top 10 most requested tests</CardDescription>
            </CardHeader>
            <CardContent>
              {testBreakdown.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No tests found for this period
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Test Name</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Completed</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead className="text-center">Completion %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {testBreakdown.map((test, idx) => {
                      const testCompletionRate = test.count > 0 
                        ? ((test.completed / test.count) * 100).toFixed(1) 
                        : "0";
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{test.test_name}</TableCell>
                          <TableCell className="text-center">{test.count}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default" className="bg-green-500">
                              {test.completed}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{test.pending}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-medium">{testCompletionRate}%</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Tests</CardTitle>
              <CardDescription>
                {pendingTests.length} test(s) awaiting completion
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingTests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No pending tests
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Test Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Test Date</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingTests.map((test) => (
                      <TableRow key={test.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{test.patient_name}</p>
                            <p className="text-xs text-muted-foreground">{test.patient_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>{test.test_name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={test.status === "pending" ? "outline" : "secondary"}
                          >
                            {test.status === "pending" ? "Pending" : "In Progress"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatAppDate(test.test_date)}
                        </TableCell>
                        <TableCell>
                          {formatAppDateTime(test.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Tests</CardTitle>
              <CardDescription>Latest 10 tests processed</CardDescription>
            </CardHeader>
            <CardContent>
              {recentTests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No recent tests
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Test Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Test Date</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTests.map((test) => (
                      <TableRow key={test.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{test.patient_name}</p>
                            <p className="text-xs text-muted-foreground">{test.patient_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>{test.test_name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              test.status === "completed"
                                ? "default"
                                : test.status === "pending"
                                ? "outline"
                                : "secondary"
                            }
                          >
                            {test.status === "completed"
                              ? "Completed"
                              : test.status === "pending"
                              ? "Pending"
                              : "In Progress"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatAppDate(test.test_date)}
                        </TableCell>
                        <TableCell>
                          {formatAppDateTime(test.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LabAnalytics;
