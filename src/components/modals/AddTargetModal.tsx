import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { useSalesTargets } from "@/hooks/useSalesTargets";

const targetSchema = z.object({
  accountManagerId: z.string().min(1, "Please select an Account Manager"),
  periodStart: z.date({
    required_error: "Period start date is required",
  }),
  periodEnd: z.date({
    required_error: "Period end date is required",
  }),
  measure: z.string().min(1, "Please select a measure"),
  targetAmount: z.string().min(1, "Target amount is required"),
});

type TargetFormData = z.infer<typeof targetSchema>;

interface AddTargetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTargetAdded?: () => void;
}

const measures = [
  { value: "revenue", label: "Revenue" },
  { value: "margin", label: "Margin" },
];

export function AddTargetModal({
  open,
  onOpenChange,
  onTargetAdded,
}: AddTargetModalProps) {
  const { profile } = useProfile();
  const {
    createTarget,
    accountManagers,
    loading: usersLoading,
  } = useSalesTargets();
  const { toast } = useToast();

  const form = useForm<TargetFormData>({
    resolver: zodResolver(targetSchema),
    defaultValues: {
      accountManagerId: "",
      measure: "",
      targetAmount: "",
      periodStart: undefined,
      periodEnd: undefined,
    },
  });

  // Use team members from useSalesTargets hook with role labels
  const amOptions = useMemo(() => {
    return accountManagers.map((am) => {
      const roleLabel =
        am.role === "manager"
          ? "Manager"
          : am.role === "head"
          ? "Head"
          : am.role === "staff"
          ? "Staff"
          : "Account Manager";
      return {
        value: String(am.id),
        label: `${am.full_name ?? "(Unnamed)"} (${roleLabel})`,
      };
    });
  }, [accountManagers]);

  const hasAMs = amOptions.length > 0;

  // Format number with commas as user types
  const formatNumberInput = (value: string) => {
    // Remove all non-digits
    const numericValue = value.replace(/\D/g, "");
    // Add commas for thousands separator
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  // Parse formatted number back to numeric value
  const parseFormattedNumber = (value: string) => {
    return parseFloat(value.replace(/,/g, "")) || 0;
  };

  const watchedFields = form.watch();
  const periodStart = watchedFields.periodStart;
  const periodEnd = watchedFields.periodEnd;
  const targetAmount = parseFormattedNumber(watchedFields.targetAmount || "0");

  // Calculate Quarter and Fiscal Year automatically based on period
  const getFiscalQuarterAndYear = () => {
    if (periodStart && periodEnd) {
      const startMonth = periodStart.getMonth() + 1; // getMonth() returns 0-11, so add 1
      const endMonth = periodEnd.getMonth() + 1;
      const startYear = periodStart.getFullYear();
      const endYear = periodEnd.getFullYear();

      // Determine quarter based on the start date
      let quarter = 1;
      if (startMonth >= 1 && startMonth <= 3) quarter = 1;
      else if (startMonth >= 4 && startMonth <= 6) quarter = 2;
      else if (startMonth >= 7 && startMonth <= 9) quarter = 3;
      else if (startMonth >= 10 && startMonth <= 12) quarter = 4;

      // Use the start year as the fiscal year
      return `Q${quarter} ${startYear}`;
    }
    return "";
  };

  // Format currency to IDR
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calculate accurate months difference (including days)
  const calculateMonthsDiff = (start: Date, end: Date): number => {
    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    const startDay = start.getDate();
    const endYear = end.getFullYear();
    const endMonth = end.getMonth();
    const endDay = end.getDate();
    
    // If same month, calculate based on days
    if (startYear === endYear && startMonth === endMonth) {
      const daysInMonth = new Date(startYear, startMonth + 1, 0).getDate();
      const totalDays = endDay - startDay + 1;
      return Math.max(totalDays / daysInMonth, 0.033); // Minimum 1 day
    }
    
    // Calculate days in each month
    const daysInStartMonth = new Date(startYear, startMonth + 1, 0).getDate();
    const daysInEndMonth = new Date(endYear, endMonth + 1, 0).getDate();
    
    // Calculate partial months
    const daysInStartPartial = daysInStartMonth - startDay + 1; // Days from start to end of start month
    const daysInEndPartial = endDay; // Days from start of end month to end day
    
    // Calculate full months between (excluding start and end months)
    let fullMonthsBetween = (endYear - startYear) * 12 + (endMonth - startMonth) - 1;
    fullMonthsBetween = Math.max(fullMonthsBetween, 0);
    
    // Calculate partial months as fractions
    const startMonthFraction = daysInStartPartial / daysInStartMonth;
    const endMonthFraction = daysInEndPartial / daysInEndMonth;
    
    // Total months = partial start month + full months + partial end month
    const totalMonths = startMonthFraction + fullMonthsBetween + endMonthFraction;
    
    return Math.max(totalMonths, 0.033); // Minimum 1 day
  };

  // Calculate quarterly amount (target per quarter, based on 3-month period)
  const getQuarterlyAmount = () => {
    if (periodStart && periodEnd && targetAmount > 0) {
      const monthsDiff = calculateMonthsDiff(periodStart, periodEnd);
      // Quarterly target = (target amount / months) * 3
      // This gives the target per quarter (3 months)
      const monthlyTarget = targetAmount / monthsDiff;
      const quarterlyTarget = monthlyTarget * 3;
      return formatCurrency(quarterlyTarget);
    }
    return formatCurrency(0);
  };

  // Calculate monthly amount (target per month)
  const getMonthlyAmount = () => {
    if (periodStart && periodEnd && targetAmount > 0) {
      const monthsDiff = calculateMonthsDiff(periodStart, periodEnd);
      const monthlyTarget = targetAmount / monthsDiff;
      return formatCurrency(monthlyTarget);
    }
    return formatCurrency(0);
  };

  const onSubmit = async (data: TargetFormData) => {

    try {
      const result = await createTarget({
        assigned_to: data.accountManagerId,
        measure: data.measure,
        amount: parseFormattedNumber(data.targetAmount),
        period_start: format(data.periodStart, "yyyy-MM-dd"),
        period_end: format(data.periodEnd, "yyyy-MM-dd"),
        account_manager_id: data.accountManagerId,
        target_amount: parseFormattedNumber(data.targetAmount),
      });

      if (result.error) {
        throw new Error(result.error);
      }

      // Reset form and close modal
      form.reset();
      onOpenChange(false);

      // Refresh the targets list
      onTargetAdded?.();
    } catch (error: any) {
      console.error("Error creating target:", error);
      toast({
        title: "Error",
        description: "Failed to create sales target. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Target</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Assign to Account Manager */}
              <FormField
                control={form.control}
                name="accountManagerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign To</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-background border shadow-lg z-50">
                        {usersLoading ? (
                          <SelectItem value="loading" disabled>
                            Loading team members...
                          </SelectItem>
                        ) : hasAMs ? (
                          amOptions.map((opt) => (
                            <SelectItem
                              key={opt.value}
                              value={opt.value}
                              className="bg-background hover:bg-muted"
                            >
                              {opt.label}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-managers" disabled>
                            No team members found in your{" "}
                            {profile?.role === "manager"
                              ? "department"
                              : "division"}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Measure */}
              <FormField
                control={form.control}
                name="measure"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Measure</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select measure" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {measures.map((measure) => (
                          <SelectItem key={measure.value} value={measure.value}>
                            {measure.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Period Start */}
              <FormField
                control={form.control}
                name="periodStart"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Period Start</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick start date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Period End */}
              <FormField
                control={form.control}
                name="periodEnd"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Period End</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick end date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Fiscal Quarter & Year (Auto-calculated) */}
              <div className="space-y-2">
                <Label>Fiscal Quarter & Year</Label>
                <Input
                  value={getFiscalQuarterAndYear()}
                  placeholder="Automatic display according to period"
                  disabled
                  className="bg-muted"
                />
              </div>

              {/* Target Amount */}
              <FormField
                control={form.control}
                name="targetAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Amount (IDR)</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Enter target amount"
                        value={field.value}
                        onChange={(e) => {
                          const formatted = formatNumberInput(e.target.value);
                          field.onChange(formatted);
                        }}
                        className="text-right"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Quarterly (Auto-calculated) */}
              <div className="space-y-2">
                <Label>Quarterly Estimate (IDR)</Label>
                <Input
                  value={getQuarterlyAmount()}
                  placeholder="Automatically calculated"
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Estimated target per quarter (3 months) based on monthly average
                </p>
              </div>

              {/* Monthly (Auto-calculated) */}
              <div className="space-y-2">
                <Label>Monthly Average (IDR)</Label>
                <Input
                  value={getMonthlyAmount()}
                  placeholder="Automatically calculated"
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Average target per month for the selected period
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Add Target</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
