import { useState, useEffect } from "react";
import {
  Bell,
  Plus,
  Edit,
  Trash2,
  Save,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, isPast, isToday, isFuture } from "date-fns";

interface Reminder {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_id_code: string;
  reminder_type: string; // 'follow_up' | 'checkup' | 'payment' | 'test_result' | 'custom'
  title: string;
  message: string;
  reminder_date: string;
  due_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  notification_sent: boolean;
  notification_method: string; // 'email' | 'sms' | 'both' | 'none'
  created_at: string;
}

const ManageReminders = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [patients, setPatients] = useState<Array<{ id: string; full_name: string; patient_id: string; phone: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [reminderToDelete, setReminderToDelete] = useState<string | null>(null);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  const [reminderForm, setReminderForm] = useState({
    patient_id: "",
    reminder_type: "follow_up",
    title: "",
    message: "",
    reminder_date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
    due_date: "",
    notification_method: "both",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch reminders
      const { data: remindersData, error: remindersError } = await supabase
        .from("patient_reminders")
        .select("*")
        .order("reminder_date", { ascending: true });

      if (remindersError) throw remindersError;

      // Fetch patient info for reminders
      const remindersWithPatients = await Promise.all(
        (remindersData || []).map(async (rem) => {
          if (rem.patient_id) {
            const { data: patientData } = await supabase
              .from("patients")
              .select("full_name, patient_id, phone")
              .eq("id", rem.patient_id)
              .single();

            return {
              ...rem,
              patient_name: patientData?.full_name || "Unknown",
              patient_id_code: patientData?.patient_id || "",
            };
          }
          return {
            ...rem,
            patient_name: "Unknown",
            patient_id_code: "",
          };
        })
      );

      setReminders(remindersWithPatients);

      // Fetch all patients for dropdown
      const { data: patientsData, error: patientsError } = await supabase
        .from("patients")
        .select("id, full_name, patient_id, phone")
        .eq("is_active", true)
        .order("full_name");

      if (patientsError) throw patientsError;
      setPatients(patientsData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load reminders");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setReminderForm({
      patient_id: "",
      reminder_type: "follow_up",
      title: "",
      message: "",
      reminder_date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
      due_date: "",
      notification_method: "both",
    });
    setPatientSearch("");
    setEditingReminder(null);
  };

  const openEditDialog = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setPatientSearch("");
    setReminderForm({
      patient_id: reminder.patient_id,
      reminder_type: reminder.reminder_type,
      title: reminder.title,
      message: reminder.message,
      reminder_date: reminder.reminder_date,
      due_date: reminder.due_date || "",
      notification_method: reminder.notification_method,
    });
    setIsDialogOpen(true);
  };

  const handleSaveReminder = async () => {
    if (!reminderForm.patient_id) {
      toast.error("Please select a patient");
      return;
    }

    if (!reminderForm.title.trim()) {
      toast.error("Title is required");
      return;
    }

    try {
      const reminderData = {
        patient_id: reminderForm.patient_id,
        reminder_type: reminderForm.reminder_type,
        title: reminderForm.title.trim(),
        message: reminderForm.message.trim() || null,
        reminder_date: reminderForm.reminder_date,
        due_date: reminderForm.due_date || null,
        notification_method: reminderForm.notification_method,
        is_completed: false,
        notification_sent: false,
      };

      if (editingReminder) {
        const { error } = await supabase
          .from("patient_reminders")
          .update(reminderData)
          .eq("id", editingReminder.id);

        if (error) throw error;
        toast.success("Reminder updated successfully");
      } else {
        const { error } = await supabase
          .from("patient_reminders")
          .insert(reminderData);

        if (error) throw error;
        toast.success("Reminder created successfully");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving reminder:", error);
      toast.error("Failed to save reminder");
    }
  };

  const handleDeleteReminder = async () => {
    if (!reminderToDelete) return;

    try {
      const { error } = await supabase
        .from("patient_reminders")
        .delete()
        .eq("id", reminderToDelete);

      if (error) throw error;

      toast.success("Reminder deleted successfully");
      setIsDeleteDialogOpen(false);
      setReminderToDelete(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting reminder:", error);
      toast.error("Failed to delete reminder");
    }
  };

  const handleSendReminder = async (reminderId: string) => {
    try {
      const { sendReminderNotification } = await import("@/services/notificationService");
      const results = await sendReminderNotification(reminderId);
      
      if (results.some(r => r.success)) {
        toast.success("Reminder notification sent successfully");
        fetchData();
      } else {
        toast.error(results[0]?.error || "Failed to send reminder notification");
      }
    } catch (error: any) {
      console.error("Error sending reminder:", error);
      toast.error(error.message || "Failed to send reminder notification");
    }
  };

  const handleMarkCompleted = async (reminderId: string) => {
    try {
      const { error } = await supabase
        .from("patient_reminders")
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq("id", reminderId);

      if (error) throw error;
      toast.success("Reminder marked as completed");
      fetchData();
    } catch (error) {
      console.error("Error updating reminder:", error);
      toast.error("Failed to update reminder");
    }
  };

  const getReminderTypeBadge = (type: string) => {
    const types: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      follow_up: { label: "Follow-up", variant: "default" },
      checkup: { label: "Checkup", variant: "secondary" },
      payment: { label: "Payment", variant: "destructive" },
      test_result: { label: "Test Result", variant: "outline" },
      custom: { label: "Custom", variant: "outline" },
    };
    const typeInfo = types[type] || { label: type, variant: "outline" as const };
    return <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>;
  };

  const getStatusBadge = (reminder: Reminder) => {
    if (reminder.is_completed) {
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Completed</Badge>;
    }

    const reminderDate = new Date(reminder.reminder_date);
    if (isPast(reminderDate) && !isToday(reminderDate)) {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    if (isToday(reminderDate)) {
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Due Today</Badge>;
    }
    if (isFuture(reminderDate)) {
      return <Badge variant="outline">Upcoming</Badge>;
    }
    return <Badge variant="outline">Pending</Badge>;
  };

  const filteredReminders = reminders.filter((reminder) => {
    const matchesSearch = reminder.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reminder.patient_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeTab === "all") return matchesSearch;
    if (activeTab === "pending") return matchesSearch && !reminder.is_completed;
    if (activeTab === "completed") return matchesSearch && reminder.is_completed;
    if (activeTab === "overdue") {
      const reminderDate = new Date(reminder.reminder_date);
      return matchesSearch && !reminder.is_completed && isPast(reminderDate) && !isToday(reminderDate);
    }
    return matchesSearch;
  });

  const filteredPatients = patients.filter((patient) => {
    if (!patientSearch.trim()) return true;
    const searchLower = patientSearch.toLowerCase();
    return (
      patient.full_name.toLowerCase().includes(searchLower) ||
      patient.patient_id.toLowerCase().includes(searchLower) ||
      patient.phone.includes(patientSearch)
    );
  });

  const pendingCount = reminders.filter((r) => !r.is_completed).length;
  const overdueCount = reminders.filter((r) => {
    const date = new Date(r.reminder_date);
    return !r.is_completed && isPast(date) && !isToday(date);
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-clinical-navy">Patient Reminders</h2>
          <p className="text-muted-foreground">Manage follow-ups, checkups, and payment reminders</p>
        </div>
        <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Reminder
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Bell className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{reminders.length}</p>
                <p className="text-xs text-muted-foreground">Total Reminders</p>
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
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overdueCount}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
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
                <p className="text-2xl font-bold">{reminders.filter((r) => r.is_completed).length}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reminders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Reminders Table */}
        <TabsContent value={activeTab} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reminders</CardTitle>
              <CardDescription>Manage patient reminders and notifications</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : filteredReminders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No reminders found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Notification</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReminders.map((reminder) => (
                      <TableRow key={reminder.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{format(new Date(reminder.reminder_date), "dd MMM yyyy")}</p>
                            {reminder.due_date && (
                              <p className="text-xs text-muted-foreground">
                                Due: {format(new Date(reminder.due_date), "dd MMM")}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{reminder.patient_name}</p>
                            <p className="text-xs text-muted-foreground">{reminder.patient_id_code}</p>
                          </div>
                        </TableCell>
                        <TableCell>{getReminderTypeBadge(reminder.reminder_type)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{reminder.title}</p>
                            {reminder.message && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{reminder.message}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {reminder.notification_method.includes("email") && (
                              <Mail className="h-3 w-3 text-muted-foreground" />
                            )}
                            {reminder.notification_method.includes("sms") && (
                              <Phone className="h-3 w-3 text-muted-foreground" />
                            )}
                            {reminder.notification_sent && (
                              <Badge variant="outline" className="text-xs">Sent</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(reminder)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {!reminder.is_completed && !reminder.notification_sent && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSendReminder(reminder.id)}
                                title="Send notification now"
                              >
                                <Mail className="h-4 w-4 mr-1" />
                                Send
                              </Button>
                            )}
                            {!reminder.is_completed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkCompleted(reminder.id)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(reminder)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setReminderToDelete(reminder.id);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
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

      {/* Add/Edit Reminder Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingReminder ? "Edit Reminder" : "Create Reminder"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="patient">Patient *</Label>
              <Select
                value={reminderForm.patient_id}
                onValueChange={(value) => setReminderForm({ ...reminderForm, patient_id: value })}
                onOpenChange={(open) => {
                  if (open) setPatientSearch("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent className="p-0">
                  <div className="sticky top-0 z-10 bg-popover p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="patient-search"
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        placeholder="Search by name, ID, or phone..."
                        className="pl-10 h-9"
                        aria-label="Search patients"
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {filteredPatients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.full_name} ({patient.patient_id})
                    </SelectItem>
                    ))}
                  </div>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">Reminder Type *</Label>
                <Select
                  value={reminderForm.reminder_type}
                  onValueChange={(value) => setReminderForm({ ...reminderForm, reminder_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="checkup">Checkup</SelectItem>
                    <SelectItem value="payment">Payment</SelectItem>
                    <SelectItem value="test_result">Test Result</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="notification">Notification Method</Label>
                <Select
                  value={reminderForm.notification_method}
                  onValueChange={(value) => setReminderForm({ ...reminderForm, notification_method: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Email & SMS</SelectItem>
                    <SelectItem value="email">Email Only</SelectItem>
                    <SelectItem value="sms">SMS Only</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={reminderForm.title}
                onChange={(e) => setReminderForm({ ...reminderForm, title: e.target.value })}
                placeholder="e.g., Follow-up appointment"
              />
            </div>

            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={reminderForm.message}
                onChange={(e) => setReminderForm({ ...reminderForm, message: e.target.value })}
                placeholder="Reminder message..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reminder_date">Reminder Date *</Label>
                <Input
                  id="reminder_date"
                  type="date"
                  value={reminderForm.reminder_date}
                  onChange={(e) => setReminderForm({ ...reminderForm, reminder_date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="due_date">Due Date (Optional)</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={reminderForm.due_date}
                  onChange={(e) => setReminderForm({ ...reminderForm, due_date: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveReminder}>
              <Save className="h-4 w-4 mr-2" />
              {editingReminder ? "Update" : "Create"} Reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reminder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this reminder? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteReminder} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageReminders;
