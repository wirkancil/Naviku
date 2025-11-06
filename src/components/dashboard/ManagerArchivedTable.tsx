import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useManagerArchived, ManagerArchived } from "@/hooks/useManagerArchived";
import { formatCurrency } from "@/lib/constants";
import { DollarSign, TrendingUp, Package } from "lucide-react";

interface ManagerArchivedTableProps {
  period?: string;
  startDate?: Date;
  endDate?: Date;
}

export function ManagerArchivedTable({ period, startDate, endDate }: ManagerArchivedTableProps) {
  const { data: archivedData, isLoading, error } = useManagerArchived({
    period,
    startDate,
    endDate,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Manager Archived</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Manager Archived</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-destructive">
            Error loading archived data: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const managers = archivedData || [];
  const totalRevenue = managers.reduce((sum, m) => sum + m.revenue, 0);
  const totalMargin = managers.reduce((sum, m) => sum + m.margin, 0);
  const totalProjects = managers.reduce((sum, m) => sum + m.project_count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Manager Archived
        </CardTitle>
        {period && (
          <p className="text-sm text-muted-foreground">Period: {period}</p>
        )}
      </CardHeader>
      <CardContent>
        {managers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No archived data found for the selected period.</p>
            <p className="text-sm mt-2">
              Archived data comes from projects added by Account Managers.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center gap-3 p-4 border rounded-lg">
                <DollarSign className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 border rounded-lg">
                <TrendingUp className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Margin</p>
                  <p className="text-xl font-bold">{formatCurrency(totalMargin)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 border rounded-lg">
                <Package className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Projects</p>
                  <p className="text-xl font-bold">{totalProjects}</p>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Manager</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Projects</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managers.map((manager) => {
                    const cogs = manager.revenue - manager.margin;
                    const marginPercentage =
                      manager.revenue > 0
                        ? ((manager.margin / manager.revenue) * 100).toFixed(1)
                        : '0.0';

                    return (
                      <TableRow key={manager.manager_id}>
                        <TableCell className="font-medium">
                          {manager.manager_name}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(manager.revenue)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(cogs)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {formatCurrency(manager.margin)}
                        </TableCell>
                        <TableCell className="text-right">
                          {manager.project_count}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              Number(marginPercentage) >= 30
                                ? 'text-green-600 font-semibold'
                                : Number(marginPercentage) >= 20
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }
                          >
                            {marginPercentage}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Footer summary */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">
                  {managers.length} Manager{managers.length !== 1 ? 's' : ''}
                </span>
                <div className="flex gap-6">
                  <span>
                    <span className="text-muted-foreground">Avg Margin %: </span>
                    <span className="font-semibold">
                      {totalRevenue > 0
                        ? ((totalMargin / totalRevenue) * 100).toFixed(1)
                        : '0.0'}
                      %
                    </span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Avg Projects: </span>
                    <span className="font-semibold">
                      {managers.length > 0
                        ? (totalProjects / managers.length).toFixed(1)
                        : '0'}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

