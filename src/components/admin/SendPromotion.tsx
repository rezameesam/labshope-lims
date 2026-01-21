import { useState, useEffect } from "react";
import { Mail, MessageSquare, Users, Send, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SendPromotion = () => {
  const [patients, setPatients] = useState<Array<{ id: string; full_name: string; email: string | null; phone: string }>>([]);
  const [selectedPatients, setSelectedPatients] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notificationType, setNotificationType] = useState<"email" | "sms" | "both">("both");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [filterType, setFilterType] = useState<"all" | "with_email" | "with_phone">("all");

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, email, phone")
        .eq("is_active", true)
        .order("full_name");

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error("Error fetching patients:", error);
      toast.error("Failed to load patients");
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patients.filter((patient) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !patient.full_name.toLowerCase().includes(query) &&
        !patient.phone.includes(query) &&
        !(patient.email && patient.email.toLowerCase().includes(query))
      ) {
        return false;
      }
    }

    // Type filter
    if (filterType === "with_email" && !patient.email) return false;
    if (filterType === "with_phone" && !patient.phone) return false;

    return true;
  });

  const togglePatient = (patientId: string) => {
    const newSelected = new Set(selectedPatients);
    if (newSelected.has(patientId)) {
      newSelected.delete(patientId);
    } else {
      newSelected.add(patientId);
    }
    setSelectedPatients(newSelected);
  };

  const selectAll = () => {
    if (selectedPatients.size === filteredPatients.length) {
      setSelectedPatients(new Set());
    } else {
      setSelectedPatients(new Set(filteredPatients.map(p => p.id)));
    }
  };

  const handleSend = async () => {
    if (selectedPatients.size === 0) {
      toast.error("Please select at least one patient");
      return;
    }

    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }

    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setSending(true);
    try {
      const patientIds = Array.from(selectedPatients);
      const { sendPromotionalMessage } = await import("@/services/notificationService");
      const result = await sendPromotionalMessage(
        patientIds,
        subject,
        message,
        notificationType
      );

      toast.success(
        `Promotional message sent to ${result.sent} patient(s). ${result.failed > 0 ? `${result.failed} failed.` : ""}`
      );

      // Reset form
      setSubject("");
      setMessage("");
      setSelectedPatients(new Set());
    } catch (error: any) {
      console.error("Error sending promotion:", error);
      toast.error(error.message || "Failed to send promotional messages");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-clinical-navy">Send Promotional Messages</h2>
        <p className="text-muted-foreground mt-1">
          Send promotional emails and SMS to selected patients
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Form */}
        <Card>
          <CardHeader>
            <CardTitle>Compose Message</CardTitle>
            <CardDescription>Create your promotional message</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Notification Type</Label>
              <Select value={notificationType} onValueChange={(v: any) => setNotificationType(v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Email & SMS</SelectItem>
                  <SelectItem value="email">Email Only</SelectItem>
                  <SelectItem value="sms">SMS Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Subject</Label>
              <Input
                placeholder="Special Offer - 20% Off on Health Packages"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Message</Label>
              <Textarea
                placeholder="Dear Patient,&#10;&#10;We are excited to offer you..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={8}
                className="mt-1"
              />
            </div>

            <Button
              onClick={handleSend}
              disabled={sending || selectedPatients.size === 0}
              className="w-full"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Sending..." : `Send to ${selectedPatients.size} Patient(s)`}
            </Button>
          </CardContent>
        </Card>

        {/* Patient Selection */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Select Patients</CardTitle>
                <CardDescription>
                  {selectedPatients.size} of {filteredPatients.length} selected
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={selectAll}>
                {selectedPatients.size === filteredPatients.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search patients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Patients</SelectItem>
                  <SelectItem value="with_email">With Email</SelectItem>
                  <SelectItem value="with_phone">With Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg max-h-[500px] overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-muted-foreground">Loading patients...</div>
              ) : filteredPatients.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No patients found</div>
              ) : (
                <div className="divide-y">
                  {filteredPatients.map((patient) => (
                    <div
                      key={patient.id}
                      className="p-3 flex items-center gap-3 hover:bg-muted/50 cursor-pointer"
                      onClick={() => togglePatient(patient.id)}
                    >
                      <Checkbox
                        checked={selectedPatients.has(patient.id)}
                        onCheckedChange={() => togglePatient(patient.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{patient.full_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {patient.email && (
                            <Badge variant="outline" className="text-xs">
                              <Mail className="h-3 w-3 mr-1" />
                              Email
                            </Badge>
                          )}
                          {patient.phone && (
                            <Badge variant="outline" className="text-xs">
                              <MessageSquare className="h-3 w-3 mr-1" />
                              SMS
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SendPromotion;
