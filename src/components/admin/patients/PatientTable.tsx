import React from "react";
import { Eye, Edit2, Phone, Mail, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { DataPagination } from "@/components/ui/data-pagination";
import { formatAppDate } from "@/lib/date";
import { formatPhoneForDisplay } from "@/lib/phone";

export interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  abha_number?: string | null;
  abha_address?: string | null;
  abdm_link_status?: string | null;
  abdm_linked_at?: string | null;
  abdm_last_verified_at?: string | null;
  abdm_source?: string | null;
  is_active: boolean;
  lab_id?: string | null;
  collection_center_id?: string | null;
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
  created_at: string;
}

export interface PatientTableProps {
  loading: boolean;
  filteredPatients: Patient[];
  pagedPatients: Patient[];
  safePage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onViewPatient: (patient: Patient) => void;
  onEditPatient: (patient: Patient) => void;
  onAssignTests?: (patient: Patient) => void;
}

const PatientTable = ({
  loading,
  filteredPatients,
  pagedPatients,
  safePage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onViewPatient,
  onEditPatient,
  onAssignTests,
}: PatientTableProps) => {
  return (
    <Card className="border-0 shadow-md">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Patient ID</TableHead>
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Contact</TableHead>
              <TableHead className="font-semibold">Gender</TableHead>
              <TableHead className="font-semibold">Blood</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    Loading patients...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredPatients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No patients found
                </TableCell>
              </TableRow>
            ) : (
              pagedPatients.map((patient) => (
                <TableRow key={patient.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-mono text-sm font-medium text-primary">
                    {patient.patient_id}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{patient.full_name}</div>
                    {patient.date_of_birth && (
                      <div className="text-xs text-muted-foreground">
                        DOB: {formatAppDate(patient.date_of_birth)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {formatPhoneForDisplay(patient.phone)}
                    </div>
                    {patient.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {patient.email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{patient.gender || "-"}</TableCell>
                  <TableCell>
                    {patient.blood_group ? (
                      <Badge variant="outline" className="font-mono">
                        {patient.blood_group}
                      </Badge>
                    ) : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={patient.is_active
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : "bg-red-100 text-red-700 hover:bg-red-100"
                      }
                    >
                      {patient.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {onAssignTests && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAssignTests(patient)}
                          className="h-8 w-8 p-0"
                          title="Assign tests"
                          aria-label="Assign tests"
                        >
                          <ClipboardList className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewPatient(patient)}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditPatient(patient)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filteredPatients.length > 0 && (
        <DataPagination
          total={filteredPatients.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </Card>
  );
};

export default PatientTable;
