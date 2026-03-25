import { useMemo } from "react";
import { format, parseISO, isAfter, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SimpleLineAreaChart } from "@/components/ui/simple-charts";
import { Calendar, TrendingUp, TrendingDown, Minus, FlaskConical, CheckCircle2, AlertCircle, Activity } from "lucide-react";
import { formatAppDate } from "@/lib/date";

interface PatientTest {
  id: string;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  result_items: Array<{
    name: string;
    value: number | string | null;
    unit: string | null;
    normal_range_min: number | null;
    normal_range_max: number | null;
    normal_range_text: string | null;
  }> | null;
  is_abnormal: boolean;
  normal_range_text: string | null;
  created_at: string;
}

interface PatientHistoryTimelineProps {
  tests: PatientTest[];
  hasOutstandingDues?: boolean;
  outstandingAmount?: number;
  onPayNow?: () => void;
}

const PatientHistoryTimeline = ({ tests, hasOutstandingDues = false, outstandingAmount = 0, onPayNow }: PatientHistoryTimelineProps) => {
  // Group tests by date
  const testsByDate = useMemo(() => {
    const grouped = new Map<string, PatientTest[]>();
    tests.forEach((test) => {
      const dateKey = format(parseISO(test.test_date), "yyyy-MM-dd");
      const existing = grouped.get(dateKey) || [];
      grouped.set(dateKey, [...existing, test]);
    });
    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, testList]) => ({
        date,
        formattedDate: formatAppDate(date),
        tests: testList.sort((a, b) => a.test_name.localeCompare(b.test_name)),
      }));
  }, [tests]);

  // Get unique test names for trend analysis
  const uniqueTestNames = useMemo(() => {
    const names = new Set<string>();
    tests.forEach((test) => {
      if (test.test_name) names.add(test.test_name);
    });
    return Array.from(names);
  }, [tests]);

  // Generate trend data for tests with numeric results
  const trendData = useMemo(() => {
    const sixMonthsAgo = subMonths(new Date(), 6);
    const recentTests = tests.filter(
      (test) =>
        test.result_value !== null &&
        test.result_value !== undefined &&
        isAfter(parseISO(test.test_date), sixMonthsAgo)
    );

    // Group by test name
    const testGroups = new Map<string, { date: string; value: number }[]>();
    recentTests.forEach((test) => {
      if (!test.test_name || test.result_value === null) return;
      const existing = testGroups.get(test.test_name) || [];
      existing.push({
        date: format(parseISO(test.test_date), "MMM dd"),
        value: test.result_value,
      });
      testGroups.set(test.test_name, existing.sort((a, b) => a.date.localeCompare(b.date)));
    });

    return Array.from(testGroups.entries())
      .map(([testName, data]) => ({
        testName,
        data,
      }))
      .filter((item) => item.data.length >= 2); // Only show tests with at least 2 data points
  }, [tests]);

  // Calculate statistics
  const stats = useMemo(() => {
    const completed = tests.filter((t) => t.status === "completed").length;
    const pending = tests.filter((t) => t.status === "pending").length;
    const inProgress = tests.filter((t) => t.status === "in_progress").length;
    const abnormal = tests.filter((t) => t.is_abnormal).length;
    const totalTests = tests.length;
    const uniqueTests = uniqueTestNames.length;

    return {
      totalTests,
      uniqueTests,
      completed,
      pending,
      inProgress,
      abnormal,
    };
  }, [tests, uniqueTestNames]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20">Completed</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20">Pending</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20">In Progress</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTrendIcon = (testName: string) => {
    const testResults = tests
      .filter((t) => t.test_name === testName && t.result_value !== null)
      .sort((a, b) => a.test_date.localeCompare(b.test_date));

    if (testResults.length < 2) return <Minus className="h-4 w-4 text-muted-foreground" />;

    const first = testResults[0].result_value!;
    const last = testResults[testResults.length - 1].result_value!;

    if (last > first) {
      return <TrendingUp className="h-4 w-4 text-red-500" />;
    } else if (last < first) {
      return <TrendingDown className="h-4 w-4 text-green-500" />;
    }
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  if (hasOutstandingDues) {
    return (
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="py-10 space-y-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-100">Timeline Locked</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Outstanding dues of ₹{outstandingAmount.toLocaleString()} detected. Please clear your dues to view your test history.
              </p>
            </div>
          </div>
          {onPayNow && (
            <div className="flex gap-3">
              <Button onClick={onPayNow} className="gap-2">
                <AlertCircle className="h-4 w-4" />
                Go to Billing & Pay
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-500/10">
                <FlaskConical className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalTests}</p>
                <p className="text-xs text-muted-foreground">Total Tests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
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
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-500/10">
                <Activity className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.uniqueTests}</p>
                <p className="text-xs text-muted-foreground">Unique Tests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.abnormal}</p>
                <p className="text-xs text-muted-foreground">Abnormal</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Trends Chart */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Test Value Trends (Last 6 Months)
            </CardTitle>
            <CardDescription>Track changes in test results over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {trendData.map(({ testName, data }) => (
                <div key={testName} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{testName}</h4>
                    {getTrendIcon(testName)}
                  </div>
                  <SimpleLineAreaChart
                    className="h-[200px] min-w-0"
                    series={[
                      {
                        key: "value",
                        color: "hsl(var(--primary))",
                        titlePrefix: testName,
                        data,
                      },
                    ]}
                    yTickFormatter={(value) => `${Math.round(value)}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Test History Timeline
          </CardTitle>
          <CardDescription>Chronological view of all your tests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {testsByDate.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No test history available
              </div>
            ) : (
              testsByDate.map(({ date, formattedDate, tests: dayTests }, index) => (
                <div key={date} className="relative">
                  {/* Timeline line */}
                  {index < testsByDate.length - 1 && (
                    <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-border" />
                  )}
                  
                  <div className="flex gap-4">
                    {/* Date marker */}
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary">
                        <Calendar className="h-4 w-4 text-primary" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-6">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="font-semibold text-lg">{formattedDate}</h3>
                        <Badge variant="outline">{dayTests.length} test(s)</Badge>
                      </div>

                      <div className="space-y-2">
                        {dayTests.map((test) => (
                          <div
                            key={test.id}
                            className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium">{test.test_name}</h4>
                                  {test.is_abnormal && (
                                    <Badge variant="destructive" className="text-xs">
                                      Abnormal
                                    </Badge>
                                  )}
                                </div>
                                {test.result_value !== null && test.result_value !== undefined && (
                                  <p className="text-sm text-muted-foreground">
                                    Result: {test.result_value}
                                    {test.result_unit && ` ${test.result_unit}`}
                                    {test.normal_range_text && (
                                      <span className="ml-2">({test.normal_range_text})</span>
                                    )}
                                  </p>
                                )}
                                {test.result && (
                                  <p className="text-sm text-muted-foreground mt-1">{test.result}</p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                {getStatusBadge(test.status)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PatientHistoryTimeline;
