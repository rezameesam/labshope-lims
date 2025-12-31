import { useState, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Bell,
  CreditCard,
  TestTube,
  ArrowRight,
  Calendar,
  User,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { format, isPast, isToday, addDays, differenceInDays } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface NoticeItem {
  id: string;
  type: "test" | "reminder" | "invoice" | "payment" | "task";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  dueDate?: string;
  link: string;
  linkText: string;
  metadata?: Record<string, any>;
}

interface NoticeStats {
  pendingTests: number;
  overdueTests: number;
  upcomingReminders: number;
  overdueReminders: number;
  pendingInvoices: number;
  overdueInvoices: number;
  totalActionItems: number;
}

interface NoticeBoardProps {
  onNavigate?: (tab: string) => void;
}

const NoticeBoard = ({ onNavigate }: NoticeBoardProps) => {
  const { user, isCollector } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [stats, setStats] = useState<NoticeStats>({
    pendingTests: 0,
    overdueTests: 0,
    upcomingReminders: 0,
    overdueReminders: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    totalActionItems: 0,
  });
  const [activeTab, setActiveTab] = useState<"all" | "tests" | "reminders" | "invoices">("all");

  useEffect(() => {
    fetchNotices();
    // Refresh every 5 minutes
    const interval = setInterval(fetchNotices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotices = async () => {
    setLoading(true);
    try {
      const noticesList: NoticeItem[] = [];
      const today = new Date();
      const statsData: NoticeStats = {
        pendingTests: 0,
        overdueTests: 0,
        upcomingReminders: 0,
        overdueReminders: 0,
        pendingInvoices: 0,
        overdueInvoices: 0,
        totalActionItems: 0,
      };

      // Fetch pending tests
      let testsQuery = supabase
        .from("patient_tests")
        .select(`
          id,
          test_name,
          test_date,
          status,
          created_at,
          patients!inner(full_name, patient_id)
        `)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: true });

      // Filter by collector if needed
      if (isCollector) {
        testsQuery = testsQuery.eq("collected_by", user?.id);
      }

      const { data: tests, error: testsError } = await testsQuery;

      if (!testsError && tests) {
        tests.forEach((test) => {
          const testDate = new Date(test.test_date);
          const daysSince = differenceInDays(today, testDate);
          const isOverdue = daysSince > 1;
          
          if (isOverdue) statsData.overdueTests++;
          statsData.pendingTests++;

          noticesList.push({
            id: test.id,
            type: "test",
            priority: isOverdue ? "high" : daysSince > 0 ? "medium" : "low",
            title: `Test Result Pending: ${test.test_name}`,
            description: `Patient: ${(test.patients as any)?.full_name} (${(test.patients as any)?.patient_id})`,
            dueDate: test.test_date,
            link: "/admin?tab=tests",
            linkText: "Enter Test Results",
            metadata: {
              patientName: (test.patients as any)?.full_name,
              patientId: (test.patients as any)?.patient_id,
              testName: test.test_name,
              status: test.status,
              daysOverdue: isOverdue ? daysSince : 0,
            },
          });
        });
      }

      // Fetch upcoming and overdue reminders
      const { data: reminders, error: remindersError } = await supabase
        .from("patient_reminders")
        .select(`
          id,
          title,
          reminder_date,
          due_date,
          is_completed,
          notification_sent,
          patients!inner(full_name, patient_id)
        `)
        .eq("is_completed", false)
        .order("reminder_date", { ascending: true })
        .limit(50);

      if (!remindersError && reminders) {
        reminders.forEach((reminder) => {
          const reminderDate = new Date(reminder.reminder_date);
          const dueDate = reminder.due_date ? new Date(reminder.due_date) : null;
          const isOverdue = isPast(reminderDate) && !reminder.is_completed;
          const isUpcoming = isToday(reminderDate) || (dueDate && isPast(dueDate));

          if (isOverdue) statsData.overdueReminders++;
          if (isUpcoming && !isOverdue) statsData.upcomingReminders++;

          if (isOverdue || isUpcoming) {
            noticesList.push({
              id: reminder.id,
              type: "reminder",
              priority: isOverdue ? "high" : "medium",
              title: reminder.title,
              description: `Patient: ${(reminder.patients as any)?.full_name} • ${format(reminderDate, "dd MMM yyyy")}`,
              dueDate: reminder.reminder_date,
              link: "/admin?tab=reminders",
              linkText: "View Reminder",
              metadata: {
                patientName: (reminder.patients as any)?.full_name,
                notificationSent: reminder.notification_sent,
              },
            });
          }
        });
      }

      // Fetch pending invoices
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          final_amount,
          paid_amount,
          payment_status,
          created_at,
          patients!inner(full_name, patient_id)
        `)
        .neq("payment_status", "paid")
        .order("created_at", { ascending: true })
        .limit(50);

      if (!invoicesError && invoices) {
        invoices.forEach((invoice) => {
          const invoiceDate = new Date(invoice.created_at);
          const daysSince = differenceInDays(today, invoiceDate);
          // Consider overdue if older than 30 days
          const isOverdue = daysSince > 30;
          const outstanding = Number(invoice.final_amount) - Number(invoice.paid_amount || 0);

          if (isOverdue) statsData.overdueInvoices++;
          statsData.pendingInvoices++;

          noticesList.push({
            id: invoice.id,
            type: "invoice",
            priority: isOverdue ? "high" : "medium",
            title: `Outstanding Payment: ₹${outstanding.toLocaleString()}`,
            description: `Invoice #${invoice.invoice_number} • Patient: ${(invoice.patients as any)?.full_name}`,
            dueDate: invoice.created_at,
            link: "/admin?tab=billing",
            linkText: "View Invoice",
            metadata: {
              invoiceNumber: invoice.invoice_number,
              amount: outstanding,
              patientName: (invoice.patients as any)?.full_name,
            },
          });
        });
      }

      // Sort by priority and date
      noticesList.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        return 0;
      });

      statsData.totalActionItems = noticesList.length;
      setNotices(noticesList);
      setStats(statsData);
    } catch (error: any) {
      console.error("Error fetching notices:", error);
      toast.error("Failed to load notice board");
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">High Priority</Badge>;
      case "medium":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Medium</Badge>;
      case "low":
        return <Badge variant="outline">Low</Badge>;
      default:
        return null;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "test":
        return <TestTube className="h-5 w-5 text-blue-600" />;
      case "reminder":
        return <Bell className="h-5 w-5 text-purple-600" />;
      case "invoice":
        return <CreditCard className="h-5 w-5 text-green-600" />;
      default:
        return <FileText className="h-5 w-5 text-gray-600" />;
    }
  };

  const handleNoticeClick = (link: string) => {
    // Extract tab from link
    const tabMatch = link.match(/tab=(\w+)/);
    if (tabMatch && onNavigate) {
      onNavigate(tabMatch[1]);
    }
  };

  const filteredNotices = activeTab === "all" 
    ? notices 
    : notices.filter(n => {
        if (activeTab === "tests") return n.type === "test";
        if (activeTab === "reminders") return n.type === "reminder";
        if (activeTab === "invoices") return n.type === "invoice";
        return true;
      });

  const highPriorityNotices = filteredNotices.filter(n => n.priority === "high");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-clinical-navy">Notice Board</h2>
          <p className="text-muted-foreground">Action items and reminders requiring attention</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchNotices} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High Priority Items</p>
                <p className="text-2xl font-bold text-red-600">{highPriorityNotices.length}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Tests</p>
                <p className="text-2xl font-bold">{stats.pendingTests}</p>
                {stats.overdueTests > 0 && (
                  <p className="text-xs text-red-600 mt-1">{stats.overdueTests} overdue</p>
                )}
              </div>
              <TestTube className="h-8 w-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Upcoming Reminders</p>
                <p className="text-2xl font-bold">{stats.upcomingReminders + stats.overdueReminders}</p>
                {stats.overdueReminders > 0 && (
                  <p className="text-xs text-red-600 mt-1">{stats.overdueReminders} overdue</p>
                )}
              </div>
              <Bell className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Payments</p>
                <p className="text-2xl font-bold">{stats.pendingInvoices}</p>
                {stats.overdueInvoices > 0 && (
                  <p className="text-xs text-red-600 mt-1">{stats.overdueInvoices} overdue</p>
                )}
              </div>
              <CreditCard className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notices Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Action Items</CardTitle>
              <CardDescription>
                {filteredNotices.length} item(s) requiring attention
              </CardDescription>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="tests">Tests</TabsTrigger>
                <TabsTrigger value="reminders">Reminders</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading notices...</div>
          ) : filteredNotices.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium text-foreground">All Clear!</p>
              <p className="text-sm text-muted-foreground">No pending action items</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotices.map((notice) => {
                const isOverdue = notice.dueDate && isPast(new Date(notice.dueDate));
                const daysUntil = notice.dueDate 
                  ? differenceInDays(new Date(notice.dueDate), new Date())
                  : null;

                return (
                  <div
                    key={notice.id}
                    className={`p-4 border rounded-lg hover:shadow-md transition-all ${
                      notice.priority === "high" 
                        ? "border-red-200 bg-red-50/50" 
                        : notice.priority === "medium"
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`p-2 rounded-lg ${
                          notice.priority === "high" 
                            ? "bg-red-100" 
                            : notice.priority === "medium"
                            ? "bg-amber-100"
                            : "bg-muted"
                        }`}>
                          {getTypeIcon(notice.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-foreground">{notice.title}</h4>
                            {getPriorityBadge(notice.priority)}
                            {isOverdue && (
                              <Badge className="bg-red-500 text-white">Overdue</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{notice.description}</p>
                          {notice.dueDate && (
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(notice.dueDate), "dd MMM yyyy")}
                              </div>
                              {daysUntil !== null && (
                                <div className={`flex items-center gap-1 ${
                                  isOverdue ? "text-red-600 font-medium" : daysUntil <= 1 ? "text-amber-600" : ""
                                }`}>
                                  <Clock className="h-3 w-3" />
                                  {isOverdue 
                                    ? `${Math.abs(daysUntil)} day(s) overdue`
                                    : daysUntil === 0
                                    ? "Due today"
                                    : `${daysUntil} day(s) remaining`
                                  }
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleNoticeClick(notice.link)}
                        className="shrink-0"
                      >
                        {notice.linkText}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onNavigate?.("tests")}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-100">
                <TestTube className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Enter Test Results</p>
                <p className="text-sm text-muted-foreground">{stats.pendingTests} pending</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onNavigate?.("reminders")}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-purple-100">
                <Bell className="h-6 w-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Manage Reminders</p>
                <p className="text-sm text-muted-foreground">{stats.upcomingReminders + stats.overdueReminders} active</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onNavigate?.("billing")}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-100">
                <CreditCard className="h-6 w-6 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Process Payments</p>
                <p className="text-sm text-muted-foreground">{stats.pendingInvoices} pending</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NoticeBoard;

