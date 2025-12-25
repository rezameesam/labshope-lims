import { useEffect, useState } from "react";
import { Users, UserPlus, ClipboardList, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  employees: number;
  patients: number;
  tests: number;
  pendingTests: number;
}

const DashboardOverview = () => {
  const [stats, setStats] = useState<Stats>({
    employees: 0,
    patients: 0,
    tests: 0,
    pendingTests: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [employeesRes, patientsRes, testsRes, pendingRes] = await Promise.all([
          supabase.from("employees").select("id", { count: "exact", head: true }),
          supabase.from("patients").select("id", { count: "exact", head: true }),
          supabase.from("patient_tests").select("id", { count: "exact", head: true }),
          supabase.from("patient_tests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        ]);

        setStats({
          employees: employeesRes.count || 0,
          patients: patientsRes.count || 0,
          tests: testsRes.count || 0,
          pendingTests: pendingRes.count || 0,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const cards = [
    {
      title: "Total Employees",
      value: stats.employees,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      title: "Total Patients",
      value: stats.patients,
      icon: UserPlus,
      color: "text-green-600",
      bg: "bg-green-100",
    },
    {
      title: "Total Tests",
      value: stats.tests,
      icon: ClipboardList,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
    {
      title: "Pending Tests",
      value: stats.pendingTests,
      icon: Activity,
      color: "text-orange-600",
      bg: "bg-orange-100",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <Card key={card.title} className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {loading ? "..." : card.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Use the sidebar to manage employees, patients, and tests. 
            You can add new records, view existing ones, and update test results.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardOverview;
