import { Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useLab } from "@/contexts/LabContext";
import { useAuth } from "@/hooks/useAuth";

const LabSelector = () => {
  const { currentLab, availableLabs, setCurrentLab, loading } = useLab();
  const { hasRole } = useAuth();

  if (loading || availableLabs.length === 0) {
    return null;
  }

  // Don't show selector if user only has access to one lab (unless admin)
  if (availableLabs.length === 1 && !hasRole("admin")) {
    return null;
  }

  const handleLabChange = (lab: typeof availableLabs[0]) => {
    setCurrentLab(lab);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="hidden sm:inline">
            {currentLab ? currentLab.name : "Select Lab"}
          </span>
          <span className="sm:hidden">
            {currentLab ? currentLab.lab_code : "Lab"}
          </span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch Lab</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableLabs.map((lab) => (
          <DropdownMenuItem
            key={lab.id}
            onClick={() => handleLabChange(lab)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex flex-col">
              <span className="font-medium">{lab.name}</span>
              <span className="text-xs text-muted-foreground">{lab.lab_code}</span>
            </div>
            {currentLab?.id === lab.id && (
              <Badge variant="default" className="ml-2">Current</Badge>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LabSelector;

