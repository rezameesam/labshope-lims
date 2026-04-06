import { useState, useEffect, useCallback } from "react";
import {
  Eye, Receipt, CreditCard, Banknote,
  IndianRupee, Printer,
  CheckCircle, Clock, XCircle, Edit2, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatAppDate, formatAppDateTime } from "@/lib/date";
import { generateScopedInvoiceNumber } from "@/lib/invoiceNumbers";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
import BillingSummary from "@/components/admin/billing/BillingSummary";
import BillingFilters from "@/components/admin/billing/BillingFilters";
import BillingTable from "@/components/admin/billing/BillingTable";
import BillingFormDialog from "@/components/admin/billing/BillingFormDialog";
import BillingPaymentDialog from "@/components/admin/billing/BillingPaymentDialog";

interface Invoice {
  id: string;
  invoice_number: string;
  patient_id: string;
  total_amount: number;
  discount_amount: number;
  discount_entered_by?: string | null;
  discount_entered_by_name?: string | null;
  tax_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  updated_by?: string | null;
  journal_entry_id?: string | null;
  lab_id?: string | null;
  collection_center_id?: string | null;
  patient?: {
    full_name: string;
    patient_id: string;
    phone: string;
    abha_address?: string | null;
  };
  labs?: {
    id: string;
    name: string;
    lab_code: string;
  } | null;
  collection_centers?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  lab_id?: string | null;
  collection_center_id?: string | null;
}

interface PatientTest {
  id: string;
  test_name: string;
  test_date: string;
  status: string;
  test_id: string | null;
  test?: {
    price: number | null;
  } | null;
  invoice_status?: "not_invoiced" | "unpaid" | "paid";
  invoice_number?: string;
}

interface InvoiceItem {
  id: string;
  test_name: string;
  unit_price: number;
  quantity: number;
  amount: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  transaction_id: string | null;
  notes: string | null;
  received_by: string | null;
  received_by_name?: string | null;
}

interface BillingAuditLog {
  id: string;
  invoice_id: string;
  payment_id: string | null;
  entity_type: string;
  action: string;
  changed_by: string | null;
  changed_by_name?: string | null;
  changed_at: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  notes: string | null;
}

interface Test {
  id: string;
  name: string;
  price: number | null;
}

interface TestPrice {
  testId: string;
  price: number;
}

const ManageBilling = () => {
  const { user, hasRole, isCollector } = useAuth();
  const { branding, organization, loading: organizationLoading } = useOrganization();
  const isAdmin = hasRole("admin");
  const organizationId = organization?.id ?? null;
  const currentUserId = user?.id ?? null;
  
  // Collectors should not have access to billing
  useEffect(() => {
    if (isCollector) {
      toast.error("Access denied. Billing is restricted to admins and employees.");
    }
  }, [isCollector]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [linkedInvoiceIds, setLinkedInvoiceIds] = useState<Set<string>>(new Set());
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "partial" | "paid">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [editableItems, setEditableItems] = useState<InvoiceItem[]>([]);
  const [editableDiscount, setEditableDiscount] = useState(0);
  
  // Create invoice state
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [patientTests, setPatientTests] = useState<PatientTest[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [customPrices, setCustomPrices] = useState<Map<string, number>>(new Map());
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState("");

  // Payment state
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [transactionId, setTransactionId] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // Tests database for price lookup
  const [testsDb, setTestsDb] = useState<Test[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [billingAuditLogs, setBillingAuditLogs] = useState<BillingAuditLog[]>([]);

  const resolveUserDisplayNames = useCallback(async (userIds: string[]) => {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    const nameMap = new Map<string, string>();

    if (uniqueIds.length === 0) {
      return nameMap;
    }

    const { data: employeesData, error: employeesError } = await supabase
      .from("employees")
      .select("user_id, full_name")
      .in("user_id", uniqueIds);

    if (employeesError) throw employeesError;

    (employeesData || []).forEach((employee) => {
      if (employee.user_id) {
        nameMap.set(employee.user_id, employee.full_name);
      }
    });

    const missingIds = uniqueIds.filter((userId) => !nameMap.has(userId));
    if (missingIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", missingIds);

      if (profilesError) throw profilesError;

      (profilesData || []).forEach((profile) => {
        if (profile.user_id) {
          nameMap.set(profile.user_id, profile.full_name);
        }
      });
    }

    return nameMap;
  }, []);

  const enrichInvoiceDiscountAudit = useCallback(
    async (invoice: Invoice) => {
      if (!invoice.discount_entered_by) {
        return { ...invoice, discount_entered_by_name: null };
      }

      const nameMap = await resolveUserDisplayNames([invoice.discount_entered_by]);
      return {
        ...invoice,
        discount_entered_by_name: nameMap.get(invoice.discount_entered_by) || "Unknown staff",
      };
    },
    [resolveUserDisplayNames],
  );

  const fetchInvoices = useCallback(async () => {
    if (!organizationId) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    try {
      // Try to fetch with lab/collection center joins, fallback to basic query if it fails
      let data: Invoice[] | null = null;
      let error: any = null;
      try {
        const result = await (supabase as any)
          .from("invoices")
          .select(`
            *,
            patient:patients(full_name, patient_id, phone, abha_address),
            labs (
              id,
              name,
              lab_code
            ),
            collection_centers (
              id,
              name,
              code
            )
          `)
          .order("created_at", { ascending: false })
          .eq("organization_id" as any, organizationId);
        
        data = (result.data as unknown as Invoice[] | null) ?? null;
        error = result.error;
        
        // If join fails due to missing tables/columns, fallback to basic query
        if (error && (error.code === "PGRST116" || error.code === "42P01" || error.message?.includes("Could not find") || error.message?.includes("relation") || error.code === "400")) {
          const basicResult = await (supabase as any)
            .from("invoices")
            .select(`
              *,
              patient:patients(full_name, patient_id, phone, abha_address)
            `)
            .order("created_at", { ascending: false })
            .eq("organization_id" as any, organizationId);
          
          data = (basicResult.data as unknown as Invoice[] | null) ?? null;
          error = basicResult.error;
        }
      } catch (err: any) {
        // If join fails, try basic query
        const basicResult = await (supabase as any)
          .from("invoices")
          .select(`
            *,
            patient:patients(full_name, patient_id, phone, abha_address)
          `)
          .order("created_at", { ascending: false })
          .eq("organization_id" as any, organizationId);

        data = (basicResult.data as unknown as Invoice[] | null) ?? null;
        error = basicResult.error;
      }

      if (error) throw error;
      const invoiceList = (data || []) as Invoice[];
      setInvoices(invoiceList);

      // Fetch which invoices are already linked to ABHA
      const invoiceIds = invoiceList
        .filter((inv) => inv.patient?.abha_address)
        .map((inv) => inv.id);
      if (invoiceIds.length > 0) {
        const { data: linkData } = await (supabase as any)
          .from("abdm_care_context_links" as any)
          .select("invoice_id")
          .eq("organization_id" as any, organizationId)
          .in("invoice_id", invoiceIds)
          .in("link_status", ["linked", "notified"]);
        const ids = new Set<string>((linkData || []).map((r: any) => r.invoice_id).filter(Boolean));
        setLinkedInvoiceIds(ids);
      } else {
        setLinkedInvoiceIds(new Set());
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to fetch invoices");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const fetchPatients = useCallback(async () => {
    if (!organizationId) {
      setPatients([]);
      return;
    }

    try {
      let query: any = supabase
        .from("patients")
        .select("id, patient_id, full_name, phone, lab_id, collection_center_id")
        .eq("is_active", true);

      query = query.eq("organization_id" as any, organizationId);

      // Note: Collectors shouldn't be here, but add restriction just in case
      if (isCollector && currentUserId) {
        query = query.eq("created_by", currentUserId);
      }

      const { data, error } = await query.order("full_name");

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error("Error fetching patients:", error);
    }
  }, [currentUserId, isCollector, organizationId]);

  const fetchTestsDb = useCallback(async () => {
    if (!organizationId) {
      setTestsDb([]);
      return;
    }

    try {
      let query = supabase
        .from("tests")
        .select("id, name, price");

      query = query.eq("organization_id", organizationId);

      const { data, error } = await query;

      if (error) throw error;
      setTestsDb((data || []) as Test[]);
    } catch (error) {
      console.error("Error fetching tests:", error);
    }
  }, [organizationId]);

  // Filter patients based on search query
  const filteredPatients = patients.filter((patient) => {
    if (!patientSearchQuery) return true;
    const query = patientSearchQuery.toLowerCase();
    return (
      patient.full_name.toLowerCase().includes(query) ||
      patient.patient_id.toLowerCase().includes(query) ||
      patient.phone.includes(query)
    );
  });

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  const fetchInvoiceItems = async (invoiceId: string) => {
    if (!organizationId) {
      setInvoiceItems([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("id, test_name, unit_price, quantity, amount")
        .eq("invoice_id", invoiceId)
        .eq("organization_id", organizationId);

      if (error) throw error;
      setInvoiceItems((data || []) as InvoiceItem[]);
    } catch (error) {
      console.error("Error fetching invoice items:", error);
    }
  };

  const fetchPayments = async (invoiceId: string) => {
    if (!organizationId) {
      setPayments([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, payment_method, payment_date, transaction_id, notes, received_by")
        .eq("invoice_id", invoiceId)
        .eq("organization_id", organizationId)
        .order("payment_date", { ascending: false });

      if (error) throw error;

      const paymentsData = (data || []) as Payment[];
      const receivedByIds = Array.from(
        new Set(paymentsData.map((payment) => payment.received_by).filter(Boolean) as string[]),
      );

      if (receivedByIds.length === 0) {
        setPayments(paymentsData);
        return;
      }

      const nameMap = await resolveUserDisplayNames(receivedByIds);

      setPayments(
        paymentsData.map((payment) => ({
          ...payment,
          received_by_name: payment.received_by ? nameMap.get(payment.received_by) || "Unknown staff" : null,
        })),
      );
    } catch (error) {
      console.error("Error fetching payments:", error);
    }
  };

  const fetchBillingAudit = async (invoiceId: string) => {
    if (!organizationId) {
      setBillingAuditLogs([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("billing_audit")
        .select("*")
        .eq("invoice_id", invoiceId)
        .eq("organization_id", organizationId)
        .order("changed_at", { ascending: false });

      if (error) throw error;

      const auditData = (data || []) as BillingAuditLog[];
      const changedByIds = Array.from(
        new Set(auditData.map((log) => log.changed_by).filter(Boolean) as string[]),
      );

      if (changedByIds.length === 0) {
        setBillingAuditLogs(auditData);
        return;
      }

      const nameMap = await resolveUserDisplayNames(changedByIds);
      setBillingAuditLogs(
        auditData.map((log) => ({
          ...log,
          changed_by_name: log.changed_by ? nameMap.get(log.changed_by) || "Unknown staff" : null,
        })),
      );
    } catch (error) {
      console.error("Error fetching billing audit logs:", error);
    }
  };

  const fetchPatientTests = useCallback(async (patientId: string) => {
    if (!organizationId) {
      setPatientTests([]);
      return;
    }

    try {
      let query: any = (supabase as any)
        .from("patient_tests")
        .select(`
          id, test_name, test_date, status, test_id,
          test:tests(price)
        `)
        .eq("patient_id", patientId)
        .order("test_date", { ascending: false });

      query = query.eq("organization_id" as any, organizationId);

      const { data, error } = await query;

      if (error) throw error;
      
      // Check which tests are already invoiced
      const testIds = (data || []).map(t => t.id);
      
      if (testIds.length > 0) {
        const { data: invoiceItemsData } = await supabase
          .from("invoice_items")
          .select(`
            patient_test_id,
            invoice:invoices!invoice_items_invoice_id_fkey (
              id,
              invoice_number,
              payment_status,
              final_amount,
              paid_amount
            )
          `)
          .in("patient_test_id", testIds)
          .eq("organization_id", organizationId);

        if (invoiceItemsData && invoiceItemsData.length > 0) {
          const testInvoiceMap = new Map<
            string,
            { status: string; number: string; isPaid: boolean }
          >();

          (invoiceItemsData as Array<{
            patient_test_id: string | null;
            invoice:
              | {
                  id: string;
                  invoice_number: string;
                  payment_status: string;
                  final_amount: number;
                  paid_amount: number;
                }
              | null;
          }>).forEach((item) => {
            if (!item.patient_test_id || !item.invoice) {
              return;
            }

            const invoice = item.invoice;
            testInvoiceMap.set(item.patient_test_id, {
              status: invoice.payment_status,
              number: invoice.invoice_number,
              isPaid: (invoice.paid_amount || 0) >= (invoice.final_amount || 0),
            });
          });

          // Add invoice status to each test
          const testsWithInvoiceStatus = (data || []).map(test => {
            const invoiceInfo = testInvoiceMap.get(test.id);
            if (invoiceInfo) {
              return {
                ...test,
                invoice_status: invoiceInfo.isPaid ? "paid" : "unpaid",
                invoice_number: invoiceInfo.number
              };
            }
            return { ...test, invoice_status: "not_invoiced" as const };
          });

          setPatientTests(testsWithInvoiceStatus as PatientTest[]);
        } else {
          // No invoices, all tests are not invoiced
          setPatientTests((data || []).map(t => ({ ...t, invoice_status: "not_invoiced" as const })) as PatientTest[]);
        }
      } else {
        setPatientTests([]);
      }
    } catch (error) {
      console.error("Error fetching patient tests:", error);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationLoading) {
      return;
    }

    if (!organizationId) {
      setInvoices([]);
      setPatients([]);
      setTestsDb([]);
      setPatientTests([]);
      setSelectedPatientId("");
      setLoading(false);
      return;
    }

    void fetchInvoices();
    void fetchPatients();
    void fetchTestsDb();
  }, [fetchInvoices, fetchPatients, fetchTestsDb, organizationId, organizationLoading]);

  useEffect(() => {
    if (!organizationId) {
      setPatientTests([]);
      return;
    }

    if (selectedPatientId) {
      void fetchPatientTests(selectedPatientId);
      setSelectedTestIds(new Set());
      setCustomPrices(new Map());
    }
  }, [fetchPatientTests, organizationId, selectedPatientId]);

  // Initialize custom prices when tests are loaded - look up prices from testsDb by test name
  useEffect(() => {
    const testsDbByName = new Map(
      testsDb.map((test) => [test.name.toLowerCase(), Number(test.price) || 0]),
    );
    const newPrices = new Map<string, number>();
    patientTests.forEach(t => {
      // First try to get price from linked test
      let price = t.test?.price || 0;
      
      // If no price, look up in testsDb by test name
      if (price === 0) {
        price = testsDbByName.get(t.test_name.toLowerCase()) || 0;
      }
      
      newPrices.set(t.id, price);
    });
    setCustomPrices(newPrices);
  }, [patientTests, testsDb]);

  const getTestPrice = (testId: string) => {
    return customPrices.get(testId) || 0;
  };

  const updateTestPrice = (testId: string, price: number) => {
    const newPrices = new Map(customPrices);
    newPrices.set(testId, price);
    setCustomPrices(newPrices);
  };

  const calculateTotal = () => {
    const selectedTests = patientTests.filter(t => selectedTestIds.has(t.id));
    const total = selectedTests.reduce((sum, t) => sum + getTestPrice(t.id), 0);
    return total;
  };

  const clampDiscount = (value: number, total: number) => {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    return Math.min(value, Math.max(0, total));
  };

  const handleCreateInvoice = async () => {
    if (!organizationId) {
      toast.error("Organization context is required before creating invoices");
      return;
    }

    if (!selectedPatientId || selectedTestIds.size === 0) {
      toast.error("Please select a patient and at least one test");
      return;
    }

    // Check if any selected tests are already in paid invoices
    const selectedTests = patientTests.filter(t => selectedTestIds.has(t.id));
    const paidInvoicedTests = selectedTests.filter(t => t.invoice_status === "paid");
    
    if (paidInvoicedTests.length > 0) {
      const testNames = paidInvoicedTests.map(t => t.test_name).join(", ");
      const invoiceNumbers = Array.from(new Set(paidInvoicedTests.map(t => t.invoice_number).filter(Boolean))).join(", ");
      toast.error(
        `Cannot create invoice. The following tests are already invoiced and paid: ${testNames}. Invoice(s): ${invoiceNumbers}`
      );
      return;
    }

    // Warn if tests are in unpaid invoices (but allow it)
    const unpaidInvoicedTests = selectedTests.filter(t => t.invoice_status === "unpaid");
    if (unpaidInvoicedTests.length > 0) {
      const testNames = unpaidInvoicedTests.map(t => t.test_name).join(", ");
      toast.warning(
        `Warning: Some tests (${testNames}) are already in unpaid invoices. This will create a duplicate invoice.`
      );
    }

    setIsSubmitting(true);
    try {
      const totalAmount = calculateTotal();
      const appliedDiscount = clampDiscount(discount, totalAmount);
      const finalAmount = totalAmount - appliedDiscount;
      const invoiceNumber = await generateScopedInvoiceNumber(organizationId);

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          patient_id: selectedPatientId,
          organization_id: organizationId,
          lab_id: selectedPatient?.lab_id || null,
          collection_center_id: selectedPatient?.collection_center_id || null,
          total_amount: totalAmount,
          discount_amount: appliedDiscount,
          discount_entered_by: appliedDiscount > 0 ? currentUserId : null,
          final_amount: finalAmount,
          notes,
          created_by: currentUserId,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice items with custom prices
      const invoiceItems = selectedTests.map(t => {
        const price = getTestPrice(t.id);
        return {
          invoice_id: invoice.id,
          organization_id: organizationId,
          patient_test_id: t.id,
          test_name: t.test_name,
          unit_price: price,
          amount: price,
        };
      });

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(invoiceItems);

      if (itemsError) throw itemsError;

      toast.success(`Invoice ${invoiceNumber} created successfully`);
      setIsCreateDialogOpen(false);
      resetCreateForm();
      fetchInvoices();
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      toast.error(error.message || "Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!organizationId) {
      toast.error("Organization context is required before recording payments");
      return;
    }

    if (!selectedInvoice || paymentAmount <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    setIsSubmitting(true);
    try {
      // Record payment
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          invoice_id: selectedInvoice.id,
          organization_id: organizationId,
          amount: paymentAmount,
          payment_method: paymentMethod,
          transaction_id: transactionId || null,
          notes: paymentNotes || null,
          received_by: currentUserId,
        });

      if (paymentError) throw paymentError;

      // Update invoice
      const newPaidAmount = selectedInvoice.paid_amount + paymentAmount;
      const newStatus = newPaidAmount >= selectedInvoice.final_amount ? "paid" : "partial";
      
      const { error: updateError } = await (supabase as any)
        .from("invoices")
        .update({
          paid_amount: newPaidAmount,
          payment_status: newStatus,
          payment_method: paymentMethod,
          paid_at: newStatus === "paid" ? new Date().toISOString() : null,
        })
        .eq("id", selectedInvoice.id)
        .eq("organization_id" as any, organizationId);

      if (updateError) throw updateError;

      if (newStatus === "paid") {
        const { sendPaymentSuccessNotification } = await import("@/services/notificationService");
        await sendPaymentSuccessNotification(
          selectedInvoice.patient_id,
          paymentAmount,
          selectedInvoice.invoice_number,
          branding.displayName,
          `${window.location.origin}/auth/patient`
        );
      }

      toast.success("Payment recorded successfully");
      setIsPaymentDialogOpen(false);
      resetPaymentForm();
      fetchInvoices();
    } catch (error: any) {
      console.error("Error recording payment:", error);
      toast.error(error.message || "Failed to record payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setSelectedPatientId("");
    setPatientTests([]);
    setSelectedTestIds(new Set());
    setDiscount(0);
    setNotes("");
    setPatientSearchQuery("");
    setPatientSearchOpen(false);
  };

  const resetPaymentForm = () => {
    setPaymentAmount(0);
    setPaymentMethod("cash");
    setTransactionId("");
    setPaymentNotes("");
    setSelectedInvoice(null);
  };

  const openPaymentDialog = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.final_amount - invoice.paid_amount);
    setPaymentMethod("cash");
    setTransactionId("");
    setPaymentNotes("");
    setIsPaymentDialogOpen(true);
  };

  const openEditDialog = async (invoice: Invoice) => {
    // Check if user has permission to edit this invoice
    if (!isAdmin && invoice.payment_status === "paid") {
      toast.error("Only administrators can edit paid invoices. Please contact an admin for assistance.");
      return;
    }

    setSelectedInvoice(invoice);
    setEditableDiscount(invoice.discount_amount);
    
    // Fetch invoice items
    const { data: items, error } = await supabase
      .from("invoice_items")
      .select("id, test_name, unit_price, quantity, amount")
      .eq("invoice_id", invoice.id)
      .eq("organization_id", organizationId);

    if (error) {
      toast.error("Failed to load invoice items");
      return;
    }

    setEditableItems(items || []);
    setIsEditDialogOpen(true);
  };

  const updateItemPrice = (itemId: string, price: number) => {
    setEditableItems(items => 
      items.map(item => {
        if (item.id === itemId) {
          const newAmount = price * item.quantity;
          return { ...item, unit_price: price, amount: newAmount };
        }
        return item;
      })
    );
  };

  const calculateEditableTotal = () => {
    return editableItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const calculateEditableFinal = () => {
    const total = calculateEditableTotal();
    return total - clampDiscount(editableDiscount, total);
  };

  const handleSaveInvoice = async () => {
    if (!selectedInvoice) return;
    if (!organizationId) {
      toast.error("Organization context is required before updating invoices");
      return;
    }

    setIsSubmitting(true);
    try {
      const newTotal = calculateEditableTotal();
      const appliedDiscount = clampDiscount(editableDiscount, newTotal);
      const newFinal = newTotal - appliedDiscount;
      const currentPaidAmount = Number(selectedInvoice.paid_amount) || 0;
      const newStatus =
        currentPaidAmount >= newFinal
          ? "paid"
          : currentPaidAmount > 0
            ? "partial"
            : "pending";
      const newPaidAt = newStatus === "paid" ? selectedInvoice.paid_at || new Date().toISOString() : null;

      // Persist line-item edits in parallel to avoid serial round-trips.
      await Promise.all(
        editableItems.map(async (item) => {
          const { error } = await supabase
            .from("invoice_items")
            .update({
              unit_price: item.unit_price,
              amount: item.amount,
            })
            .eq("id", item.id)
            .eq("organization_id", organizationId);

          if (error) throw error;
        }),
      );

      // Update invoice totals
      const { error: invoiceError } = await (supabase as any)
        .from("invoices")
        .update({
          total_amount: newTotal,
          discount_amount: appliedDiscount,
          discount_entered_by: appliedDiscount > 0 ? currentUserId : null,
          final_amount: newFinal,
          updated_by: currentUserId,
          payment_status: newStatus,
          paid_at: newPaidAt,
        })
        .eq("id", selectedInvoice.id)
        .eq("organization_id" as any, organizationId);

      if (invoiceError) throw invoiceError;

      toast.success("Invoice updated successfully");
      setIsEditDialogOpen(false);
      fetchInvoices();
      
      // Refresh invoice details if open
      if (isDetailsOpen && selectedInvoice) {
        try {
          const result = await (supabase as any)
            .from("invoices")
            .select(`
              *,
              patient:patients(full_name, patient_id, phone, abha_address),
              labs (
                id,
                name,
                lab_code
              ),
              collection_centers (
                id,
                name,
                code
              )
            `)
            .eq("id", selectedInvoice.id)
            .eq("organization_id" as any, organizationId)
            .single();

          if (!result.error && result.data) {
            const invoiceData = result.data as any;
            if (
              invoiceData.collection_centers &&
              typeof invoiceData.collection_centers === "object" &&
              "error" in invoiceData.collection_centers
            ) {
              invoiceData.collection_centers = null;
            }

            setSelectedInvoice(await enrichInvoiceDiscountAudit(invoiceData as Invoice));
            await fetchBillingAudit(selectedInvoice.id);
          } else if (
            result.error &&
            (result.error.code === "PGRST116" ||
              result.error.code === "42P01" ||
              result.error.message?.includes("Could not find") ||
              result.error.code === "400")
          ) {
            const basicResult = await (supabase as any)
              .from("invoices")
              .select(`
                *,
                patient:patients(full_name, patient_id, phone, abha_address)
              `)
              .eq("id", selectedInvoice.id)
              .eq("organization_id" as any, organizationId)
              .single();

            if (!basicResult.error && basicResult.data) {
              const basicInvoice = basicResult.data as unknown as Invoice;
              setSelectedInvoice(await enrichInvoiceDiscountAudit(basicInvoice));
              await fetchBillingAudit(selectedInvoice.id);
            }
          }
        } catch (err) {
          console.error("Error refreshing invoice:", err);
        }
      }
    } catch (error: any) {
      console.error("Error updating invoice:", error);
      toast.error(error.message || "Failed to update invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
      case "partial":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Partial</Badge>;
      case "pending":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Pending</Badge>;
      case "cancelled":
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case "cash": return "Cash";
      case "upi": return "UPI";
      case "card": return "Card";
      case "bank_transfer": return "Bank Transfer";
      case "online": return "Online";
      default: return method;
    }
  };

  const getBillingActionLabel = (action: string) => {
    switch (action) {
      case "invoice_created":
        return "Invoice Created";
      case "invoice_updated":
        return "Invoice Updated";
      case "discount_updated":
        return "Discount Updated";
      case "payment_recorded":
        return "Payment Recorded";
      case "payment_updated":
        return "Payment Updated";
      case "payment_deleted":
        return "Payment Deleted";
      default:
        return action.replace(/_/g, " ");
    }
  };

  const renderBillingAuditSummary = (log: BillingAuditLog) => {
    const oldValues = log.old_values || {};
    const newValues = log.new_values || {};

    switch (log.action) {
      case "payment_recorded":
        return `₹${Number(newValues.amount || 0).toLocaleString()} via ${getPaymentMethodLabel(String(newValues.payment_method || ""))}`;
      case "payment_updated":
        return `Payment changed from ₹${Number(oldValues.amount || 0).toLocaleString()} to ₹${Number(newValues.amount || 0).toLocaleString()}`;
      case "payment_deleted":
        return `Deleted payment of ₹${Number(oldValues.amount || 0).toLocaleString()}`;
      case "discount_updated":
        return `Discount changed from ₹${Number(oldValues.discount_amount || 0).toLocaleString()} to ₹${Number(newValues.discount_amount || 0).toLocaleString()}`;
      case "invoice_updated":
        return `Final amount changed from ₹${Number(oldValues.final_amount || 0).toLocaleString()} to ₹${Number(newValues.final_amount || 0).toLocaleString()}`;
      case "invoice_created":
        return `Invoice created for ₹${Number(newValues.final_amount || 0).toLocaleString()}`;
      default:
        return null;
    }
  };

  const handlePrintInvoice = async (invoice: Invoice) => {
    // Fetch invoice items for the invoice
    const { data: items, error } = await supabase
      .from("invoice_items")
      .select("id, test_name, unit_price, quantity, amount")
      .eq("invoice_id", invoice.id)
      .eq("organization_id", organizationId);

    if (error) {
      toast.error("Failed to fetch invoice items");
      return;
    }

    const { data: paymentData, error: paymentError } = await supabase
      .from("payments")
      .select("amount, payment_method, payment_date, transaction_id")
      .eq("invoice_id", invoice.id)
      .eq("organization_id", organizationId)
      .order("payment_date", { ascending: false });

    if (paymentError) {
      toast.error("Failed to fetch payments");
      return;
    }

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(branding.displayName, pageWidth / 2, 28, { align: "center" });
    doc.text(`${branding.addressLines.join(", ")} | ${branding.primaryPhone}`, pageWidth / 2, 34, { align: "center" });
    
    // Invoice details
    doc.setFontSize(11);
    doc.text(`Invoice #: ${invoice.invoice_number}`, 14, 50);
    doc.text(`Date: ${formatAppDate(invoice.created_at)}`, 14, 57);
    doc.text(`Status: ${invoice.payment_status.toUpperCase()}`, 14, 64);
    
    // Patient details
    let patientY = 50;
    doc.text(`Patient: ${invoice.patient?.full_name || "N/A"}`, pageWidth - 14, patientY, { align: "right" });
    doc.text(`ID: ${invoice.patient?.patient_id || "N/A"}`, pageWidth - 14, patientY + 7, { align: "right" });
    doc.text(`Phone: ${invoice.patient?.phone || "N/A"}`, pageWidth - 14, patientY + 14, { align: "right" });
    
    // Lab and Collection Center info (if available)
    if (invoice.labs || invoice.collection_centers) {
      let infoY = patientY + 21;
      if (invoice.labs) {
        const labDisplay = invoice.labs.lab_code || (invoice.labs.name.length > 15 ? invoice.labs.name.substring(0, 15) + "..." : invoice.labs.name);
        doc.text(`Lab: ${labDisplay}`, pageWidth - 14, infoY, { align: "right" });
        infoY += 7;
      }
      if (invoice.collection_centers) {
        const centerDisplay = invoice.collection_centers.code || (invoice.collection_centers.name.length > 15 ? invoice.collection_centers.name.substring(0, 15) + "..." : invoice.collection_centers.name);
        doc.text(`Center: ${centerDisplay}`, pageWidth - 14, infoY, { align: "right" });
        infoY += 7;
      }
    }
    
    // Line separator
    doc.setLineWidth(0.5);
    const separatorY = invoice.labs || invoice.collection_centers ? 78 : 70;
    doc.line(14, separatorY, pageWidth - 14, separatorY);
    
    // Items table
    const tableData = (items || []).map((item: InvoiceItem, index: number) => [
      (index + 1).toString(),
      item.test_name,
      item.quantity.toString(),
      `₹${Number(item.unit_price).toLocaleString()}`,
      `₹${Number(item.amount).toLocaleString()}`
    ]);
    
    const tableStartY = invoice.labs || invoice.collection_centers ? 83 : 75;
    autoTable(doc, {
      startY: tableStartY,
      head: [["#", "Test Name", "Qty", "Unit Price", "Amount"]],
      body: tableData,
      theme: "striped",
      margin: { left: 14, right: 20 },
      styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak", cellWidth: "wrap" },
      headStyles: { fillColor: [41, 65, 112], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 82 },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: 34, halign: "center" },
        4: { cellWidth: 34, halign: "center" }
      }
    });
    
    // Summary section
    const finalY = (doc as any).lastAutoTable?.finalY || 120;
    
    const amountX = pageWidth - 22;
    const labelX = amountX - 56;

    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", labelX, finalY + 15);
    doc.text(`₹${Number(invoice.total_amount).toLocaleString()}`, amountX, finalY + 15, { align: "right" });
    
    if (invoice.discount_amount > 0) {
      doc.text("Discount:", labelX, finalY + 22);
      doc.text(`-₹${Number(invoice.discount_amount).toLocaleString()}`, amountX, finalY + 22, { align: "right" });
    }
    
    doc.setFont("helvetica", "bold");
    doc.text("Total:", labelX, finalY + 32);
    doc.text(`₹${Number(invoice.final_amount).toLocaleString()}`, amountX, finalY + 32, { align: "right" });
    
    doc.setFont("helvetica", "normal");
    doc.text("Paid:", labelX, finalY + 42);
    doc.text(`₹${Number(invoice.paid_amount).toLocaleString()}`, amountX, finalY + 42, { align: "right" });
    
    const outstanding = invoice.final_amount - invoice.paid_amount;
    let summaryEndY = finalY + 42;
    if (outstanding > 0) {
      doc.setTextColor(255, 100, 100);
      doc.text("Outstanding:", labelX, finalY + 52);
      doc.text(`₹${outstanding.toLocaleString()}`, amountX, finalY + 52, { align: "right" });
      doc.setTextColor(0, 0, 0);
      summaryEndY = finalY + 52;
    }

    const paymentsForInvoice = paymentData || [];
    if (paymentsForInvoice.length > 0) {
      let paymentY = summaryEndY + 12;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Payments", 14, paymentY);
      paymentY += 6;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);

      paymentsForInvoice.forEach((payment) => {
        const method = getPaymentMethodLabel(payment.payment_method);
        const dateText = formatAppDate(payment.payment_date);
        const txnId = payment.transaction_id;
        const detailParts = [
          `${method} • ${dateText}`,
          txnId ? `Txn: ${txnId}` : null,
        ].filter(Boolean);

        doc.text(`₹${Number(payment.amount).toLocaleString()} - ${detailParts.join(" | ")}`, 14, paymentY);
        paymentY += 5;
      });

      doc.setTextColor(0, 0, 0);
    }
    
    // Footer
    doc.setFontSize(9);
    doc.setTextColor(128, 128, 128);
    doc.text("Thank you for choosing our laboratory services.", pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
    
    // Save PDF directly instead of opening print dialog (avoids popup blockers)
    doc.save(`Invoice_${invoice.invoice_number}.pdf`);
    
    toast.success("Invoice downloaded successfully");
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch = 
      invoice.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      invoice.patient?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      invoice.patient?.patient_id.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus =
      filterStatus === "all" || invoice.payment_status === filterStatus;

    const invDate = invoice.created_at ? invoice.created_at.slice(0, 10) : null;
    const matchesDate =
      (!dateFrom || (invDate && invDate >= dateFrom)) &&
      (!dateTo || (invDate && invDate <= dateTo));

    return matchesSearch && matchesStatus && matchesDate;
  });

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedInvoices = filteredInvoices.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, dateFrom, dateTo]);

  useEffect(() => {
    if (currentPage !== safePage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  // Stats
  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.paid_amount, 0);
  const pendingAmount = invoices.reduce((sum, inv) => sum + (inv.final_amount - inv.paid_amount), 0);
  const todayRevenue = invoices
    .filter(inv => format(new Date(inv.created_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"))
    .reduce((sum, inv) => sum + inv.paid_amount, 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <BillingSummary
        totalRevenue={totalRevenue}
        todayRevenue={todayRevenue}
        pendingAmount={pendingAmount}
        totalInvoices={invoices.length}
      />

      {/* Header with search and filters */}
      <BillingFilters
        search={search}
        onSearchChange={setSearch}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        filteredInvoices={filteredInvoices}
        onCreateInvoice={() => setIsCreateDialogOpen(true)}
      />

      {/* Invoices Table */}
      <BillingTable
        loading={loading}
        pagedInvoices={pagedInvoices}
        filteredInvoices={filteredInvoices}
        isAdmin={isAdmin}
        organizationId={organizationId}
        linkedInvoiceIds={linkedInvoiceIds}
        safePage={safePage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        onOpenPaymentDialog={openPaymentDialog}
        onOpenEditDialog={openEditDialog}
        onViewDetails={async (invoice) => {
          setSelectedInvoice(await enrichInvoiceDiscountAudit(invoice));
          setPayments([]);
          setBillingAuditLogs([]);
          await fetchInvoiceItems(invoice.id);
          await fetchPayments(invoice.id);
          await fetchBillingAudit(invoice.id);
          setIsDetailsOpen(true);
        }}
      />

      {/* Create Invoice Dialog */}
      <BillingFormDialog
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        filteredPatients={filteredPatients}
        selectedPatientId={selectedPatientId}
        onPatientSelect={setSelectedPatientId}
        patientSearchOpen={patientSearchOpen}
        onPatientSearchOpenChange={setPatientSearchOpen}
        patientSearchQuery={patientSearchQuery}
        onPatientSearchQueryChange={setPatientSearchQuery}
        selectedPatient={selectedPatient}
        patientTests={patientTests}
        selectedTestIds={selectedTestIds}
        onTestSelectionChange={setSelectedTestIds}
        getTestPrice={getTestPrice}
        updateTestPrice={updateTestPrice}
        calculateTotal={calculateTotal}
        clampDiscount={clampDiscount}
        discount={discount}
        onDiscountChange={setDiscount}
        notes={notes}
        onNotesChange={setNotes}
        isSubmitting={isSubmitting}
        onSubmit={handleCreateInvoice}
      />

      {/* Record Payment Dialog */}
      <BillingPaymentDialog
        isOpen={isPaymentDialogOpen}
        onOpenChange={setIsPaymentDialogOpen}
        selectedInvoice={selectedInvoice}
        paymentAmount={paymentAmount}
        onPaymentAmountChange={setPaymentAmount}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        transactionId={transactionId}
        onTransactionIdChange={setTransactionId}
        paymentNotes={paymentNotes}
        onPaymentNotesChange={setPaymentNotes}
        isSubmitting={isSubmitting}
        onSubmit={handleRecordPayment}
      />

      {/* Edit Invoice Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Edit Invoice
            </DialogTitle>
            <DialogDescription>
              Update invoice item pricing and discounts, then save the revised invoice totals.
            </DialogDescription>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-4 flex-1 overflow-y-auto">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Invoice #{selectedInvoice.invoice_number}</p>
                <p className="font-medium">{selectedInvoice.patient?.full_name}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium leading-none">Invoice Items</p>
                <div className="border rounded-lg">
                  {editableItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No items found</p>
                  ) : (
                    <div className="divide-y">
                      {editableItems.map((item, index) => (
                        <div 
                          key={item.id} 
                          className="flex items-center gap-4 p-4 hover:bg-muted/50"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{item.test_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Quantity: {item.quantity}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Price:</span>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">₹</span>
                              <Input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => updateItemPrice(item.id, Number(e.target.value))}
                                className="w-32 h-9 text-right"
                                min={0}
                                step="0.01"
                              />
                            </div>
                            <div className="w-24 text-right">
                              <p className="text-sm text-muted-foreground">Amount:</p>
                              <p className="font-medium">₹{item.amount.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-invoice-subtotal">Subtotal</Label>
                  <Input 
                    id="edit-invoice-subtotal"
                    name="edit_invoice_subtotal"
                    value={`₹${calculateEditableTotal().toLocaleString()}`} 
                    disabled 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-invoice-discount">Discount</Label>
                  <Input 
                    id="edit-invoice-discount"
                    name="edit_invoice_discount"
                    type="number" 
                    value={editableDiscount} 
                    onChange={(e) => setEditableDiscount(Number(e.target.value) || 0)}
                    placeholder="0"
                    min={0}
                    max={calculateEditableTotal()}
                    step="0.01"
                  />
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Amount</span>
                  <span className="text-2xl font-bold">₹{calculateEditableFinal().toLocaleString()}</span>
                </div>
                {selectedInvoice.paid_amount > 0 && (
                  <div className="flex justify-between items-center mt-2 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Already Paid</span>
                    <span className="text-sm font-medium text-emerald-600">
                      ₹{selectedInvoice.paid_amount.toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedInvoice.paid_amount > 0 && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm font-medium">Outstanding</span>
                    <span className={`text-sm font-bold ${
                      calculateEditableFinal() - selectedInvoice.paid_amount > 0 
                        ? "text-amber-600" 
                        : "text-emerald-600"
                    }`}>
                      ₹{(calculateEditableFinal() - selectedInvoice.paid_amount).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveInvoice} 
              disabled={isSubmitting || editableItems.length === 0}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Details Sheet */}
      <Sheet open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <SheetContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Invoice Details
            </SheetTitle>
            <SheetDescription>
              Review invoice summary, line items, and payment entries.
            </SheetDescription>
          </SheetHeader>
          
          {selectedInvoice && (
            <div className="mt-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-2xl font-mono font-bold">{selectedInvoice.invoice_number}</p>
                  <p className="text-sm text-muted-foreground">
                    Created {formatAppDateTime(selectedInvoice.created_at)}
                  </p>
                </div>
                {getStatusBadge(selectedInvoice.payment_status)}
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <p className="text-sm text-muted-foreground">Patient</p>
                <p className="font-medium text-lg">{selectedInvoice.patient?.full_name}</p>
                <p className="text-sm">{selectedInvoice.patient?.patient_id} • {selectedInvoice.patient?.phone}</p>
              </div>

              {/* Invoice Items */}
              {invoiceItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Items</p>
                  <div className="border rounded-lg divide-y">
                    {invoiceItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center p-3">
                        <div className="flex-1">
                          <p className="font-medium">{item.test_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Qty: {item.quantity} × ₹{item.unit_price.toLocaleString()}
                          </p>
                        </div>
                        <p className="font-medium">₹{item.amount.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{selectedInvoice.total_amount.toLocaleString()}</span>
                </div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-₹{selectedInvoice.discount_amount.toLocaleString()}</span>
                  </div>
                )}
                {selectedInvoice.discount_amount > 0 && selectedInvoice.discount_entered_by_name && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Discount entered by</span>
                    <span>{selectedInvoice.discount_entered_by_name}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>Total</span>
                  <span>₹{selectedInvoice.final_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Paid</span>
                  <span>₹{selectedInvoice.paid_amount.toLocaleString()}</span>
                </div>
                {selectedInvoice.final_amount - selectedInvoice.paid_amount > 0 && (
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Outstanding</span>
                    <span>₹{(selectedInvoice.final_amount - selectedInvoice.paid_amount).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {payments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Payment History</p>
                  <div className="border rounded-lg divide-y">
                    {payments.map((payment) => (
                      <div key={payment.id} className="p-3 flex justify-between items-start">
                        <div>
                          <p className="font-medium">₹{payment.amount.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {getPaymentMethodLabel(payment.payment_method)} • {formatAppDate(payment.payment_date)}
                          </p>
                          {payment.received_by_name && (
                            <p className="text-xs text-muted-foreground">
                              Entered by {payment.received_by_name}
                            </p>
                          )}
                        </div>
                        {payment.transaction_id && (
                          <div className="text-right text-xs font-mono text-muted-foreground">
                            <div>Txn: {payment.transaction_id}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {billingAuditLogs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Billing Activity</p>
                  <div className="border rounded-lg divide-y">
                    {billingAuditLogs.map((log) => (
                      <div key={log.id} className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant="secondary">{getBillingActionLabel(log.action)}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatAppDateTime(log.changed_at)}
                          </span>
                        </div>
                        {renderBillingAuditSummary(log) && (
                          <p className="text-sm">{renderBillingAuditSummary(log)}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {log.changed_by_name ? `By ${log.changed_by_name}` : "By system"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedInvoice.notes && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{selectedInvoice.notes}</p>
                </div>
              )}

              {/* Finance link */}
              {selectedInvoice.journal_entry_id && (
                <a
                  href="/admin?tab=finance"
                  className="flex items-center gap-2 p-3 rounded-lg bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
                >
                  <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-blue-700 dark:text-blue-300">Linked to Finance — Journal Entry recorded</span>
                  <span className="ml-auto text-blue-500 text-xs">View &rarr;</span>
                </a>
              )}

              <div className="flex gap-2 pt-4 border-t">
                {selectedInvoice.payment_status !== "paid" && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setIsDetailsOpen(false);
                      openPaymentDialog(selectedInvoice);
                    }}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Record Payment
                  </Button>
                )}
                {(isAdmin || selectedInvoice.payment_status !== "paid") && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setIsDetailsOpen(false);
                      openEditDialog(selectedInvoice);
                    }}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit Invoice
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handlePrintInvoice(selectedInvoice)}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Invoice
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ManageBilling;
