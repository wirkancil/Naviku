import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, TrendingUp, TrendingDown, Target, DollarSign } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { AddTargetModal } from "@/components/modals/AddTargetModal";
import { useSalesTargets } from "@/hooks/useSalesTargets";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

function SalesTarget() {
  const { profile } = useProfile();
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [isAddTargetOpen, setIsAddTargetOpen] = useState(false);
  const { targets, accountManagers, loading, fetchTargets } = useSalesTargets();
  const [achievedByProfileRevenue, setAchievedByProfileRevenue] = useState<Record<string, number>>({});
  const [achievedByProfileMargin, setAchievedByProfileMargin] = useState<Record<string, number>>({});
  const [loadingAchieved, setLoadingAchieved] = useState(false);

  // Helper to get quarter date range
  const getQuarterRange = (period: string) => {
    const m = period.match(/Q([1-4])\s+(\d{4})/);
    if (!m) return { start: '', end: '' };
    const q = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    const startMonthIdx = (q - 1) * 3;
    const start = new Date(year, startMonthIdx, 1);
    const end = new Date(year, startMonthIdx + 3, 0);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: fmt(start), end: fmt(end) };
  };

  // Calculate dynamic period options - only show periods that have targets
  const availablePeriods = useMemo(() => {
    const periods = new Set<string>();
    targets.forEach((target) => {
      if (target.period_start) {
        const startDate = new Date(target.period_start);
        const month = startDate.getMonth() + 1;
        const year = startDate.getFullYear();
        let quarter = 1;
        if (month >= 1 && month <= 3) quarter = 1;
        else if (month >= 4 && month <= 6) quarter = 2;
        else if (month >= 7 && month <= 9) quarter = 3;
        else if (month >= 10 && month <= 12) quarter = 4;
        periods.add(`Q${quarter} ${year}`);
      }
    });
    return Array.from(periods).sort((a, b) => {
      const [aQ, aY] = a.split(" ");
      const [bQ, bY] = b.split(" ");
      const aYear = parseInt(aY);
      const bYear = parseInt(bY);
      const aQuarter = parseInt(aQ.substring(1));
      const bQuarter = parseInt(bQ.substring(1));
      if (aYear !== bYear) return bYear - aYear;
      return bQuarter - aQuarter;
    });
  }, [targets]);

  // Initialize: fetch account managers first, then targets
  useEffect(() => {
    // Account managers will be auto-fetched by useSalesTargets hook
    // For Head, we can fetch targets even if accountManagers is empty (they might have managers)
    // For Manager/AM, wait for accountManagers to be loaded
    if (profile) {
      if (profile.role === 'head' || profile.role === 'admin') {
        // Head/Admin can fetch targets immediately
        console.log('🔍 [SalesTarget] Initial fetch for Head/Admin');
        fetchTargets();
      } else if (accountManagers.length > 0) {
        // Manager/AM wait for accountManagers to be loaded
        console.log('🔍 [SalesTarget] Initial fetch - accountManagers loaded:', accountManagers.length);
        fetchTargets();
      } else {
        console.log('🔍 [SalesTarget] Waiting for accountManagers to load...');
      }
    }
  }, [profile, accountManagers.length, fetchTargets]);

  // Update selectedPeriod when availablePeriods changes (before filteredTargets is defined)
  useEffect(() => {
    // If we have available periods and no selectedPeriod, use the first one
    if (availablePeriods.length > 0 && !selectedPeriod) {
      setSelectedPeriod(availablePeriods[0]);
    } 
    // If we have targets but no available periods (periods not calculated yet), calculate from targets
    else if (availablePeriods.length === 0 && targets.length > 0 && !selectedPeriod) {
      // Extract period from first target
      const firstTarget = targets[0];
      if (firstTarget.period_start) {
        const startDate = new Date(firstTarget.period_start);
        const month = startDate.getMonth() + 1;
        const year = startDate.getFullYear();
        let quarter = 1;
        if (month >= 1 && month <= 3) quarter = 1;
        else if (month >= 4 && month <= 6) quarter = 2;
        else if (month >= 7 && month <= 9) quarter = 3;
        else if (month >= 10 && month <= 12) quarter = 4;
        const defaultPeriod = `Q${quarter} ${year}`;
        setSelectedPeriod(defaultPeriod);
      }
    }
  }, [availablePeriods, selectedPeriod, targets.length]);

  // Note: We don't need to refetch targets when period changes
  // because we fetch all targets once and filter by period in frontend
  // This useEffect was causing double fetching

  // Compute achieved revenue & margin from real data
  useEffect(() => {
    const computeActuals = async () => {
      // Wait for account managers to be loaded
      if (accountManagers.length === 0) {
        setAchievedByProfileRevenue({});
        setAchievedByProfileMargin({});
        return;
      }

      // Use selectedPeriod or default to current quarter
      const periodToUse = selectedPeriod || "Q1 2026";

      setLoadingAchieved(true);
      const { start, end } = getQuarterRange(periodToUse);
      if (!start || !end) {
        console.warn('Invalid period format:', periodToUse);
        setLoadingAchieved(false);
        return;
      }

      console.log('🔍 [SalesTarget] Computing actuals for period:', periodToUse, 'Start:', start, 'End:', end);
      console.log('🔍 [SalesTarget] Account Managers:', accountManagers.length, accountManagers.map(am => ({ id: am.id, name: am.full_name, role: am.role })));

      try {
        // Map profile.id (AM) -> user_id (opportunities.owner_id)
        const amIds = accountManagers.map((am) => am.id);
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, user_id')
          .in('id', amIds);

        const profileToUser = new Map<string, string>();
        (profiles || []).forEach((p: any) => {
          if (p.id && p.user_id) profileToUser.set(p.id, p.user_id);
        });

        const ownerUserIds = Array.from(profileToUser.values());
        if (ownerUserIds.length === 0) {
          setAchievedByProfileRevenue({});
          setAchievedByProfileMargin({});
          setLoadingAchieved(false);
          return;
        }

        // Won opportunities within selected period
        const { data: opps } = await supabase
          .from('opportunities')
          .select('id, owner_id, amount, is_won, status, stage, expected_close_date')
          .in('owner_id', ownerUserIds)
          .or('is_won.eq.true,stage.eq.Closed Won')
          .neq('status', 'archived')
          .gte('expected_close_date', start)
          .lte('expected_close_date', end);

        const wonOpps = (opps || []) as any[];
        const oppIds = wonOpps.map((o) => o.id);

        const revenueByOwner: Record<string, number> = {};
        const marginByOwner: Record<string, number> = {};
        let costsByOpp: Record<string, number> = {};

        if (oppIds.length > 0) {
          // Get projects for won opportunities
          const { data: projects } = await supabase
            .from('projects')
            .select('opportunity_id, po_amount')
            .in('opportunity_id', oppIds);

          const projectOppIds = (projects || []).map((p: any) => p.opportunity_id).filter(Boolean);
          
          console.log('🔍 [SalesTarget] Projects found:', projects?.length || 0);
          
          // Revenue from projects
          (projects || []).forEach((p: any) => {
            const amt = Number(p.po_amount) || 0;
            const opp = wonOpps.find((o) => o.id === p.opportunity_id);
            if (opp) {
              const owner = opp.owner_id;
              revenueByOwner[owner] = (revenueByOwner[owner] || 0) + amt;
            }
          });
          
          console.log('🔍 [SalesTarget] Revenue by owner:', revenueByOwner);

          // Get costs from pipeline_items
          if (projectOppIds.length > 0) {
            const { data: items } = await supabase
              .from('pipeline_items')
              .select('opportunity_id, cost_of_goods, service_costs, other_expenses, status')
              .in('opportunity_id', projectOppIds)
              .eq('status', 'won');

            (items || []).forEach((it: any) => {
              const cogs = Number(it.cost_of_goods) || 0;
              const svc = Number(it.service_costs) || 0;
              const other = Number(it.other_expenses) || 0;
              const total = cogs + svc + other;
              if (total > 0) {
                costsByOpp[it.opportunity_id] = (costsByOpp[it.opportunity_id] || 0) + total;
              }
            });
          }

          // Calculate margin
          (projects || []).forEach((p: any) => {
            const amt = Number(p.po_amount) || 0;
            const cost = costsByOpp[p.opportunity_id] || 0;
            const margin = Math.max(0, amt - cost);
            const opp = wonOpps.find((o) => o.id === p.opportunity_id);
            if (opp) {
              const owner = opp.owner_id;
              marginByOwner[owner] = (marginByOwner[owner] || 0) + margin;
            }
          });
        }

        // Map back user_id -> profile.id
        const userToProfile = new Map<string, string>();
        (profiles || []).forEach((p: any) => {
          if (p.id && p.user_id) userToProfile.set(p.user_id, p.id);
        });

        const achievedRevByProfile: Record<string, number> = {};
        const achievedMarByProfile: Record<string, number> = {};

        // First, calculate achieved for each AM/Sales
        Object.entries(revenueByOwner).forEach(([userId, rev]) => {
          const profileId = userToProfile.get(userId);
          if (profileId) achievedRevByProfile[profileId] = rev;
        });

        Object.entries(marginByOwner).forEach(([userId, mar]) => {
          const profileId = userToProfile.get(userId);
          if (profileId) achievedMarByProfile[profileId] = mar;
        });

        // Then, aggregate achieved for managers from their team members
        // Get all profiles with full details to find relationships
        const { data: allTeamProfiles } = await supabase
          .from('user_profiles')
          .select('id, manager_id, role, entity_id, division_id')
          .in('id', amIds);

        // Also check manager_team_members table for explicit mappings
        const managers = accountManagers.filter(am => am.role === 'manager');
        const managerIds = managers.map(m => m.id);
        
        let managerTeamMap: Record<string, string[]> = {};
        if (managerIds.length > 0) {
          const { data: teamMappings } = await supabase
            .from('manager_team_members')
            .select('manager_id, account_manager_id')
            .in('manager_id', managerIds);
          
          (teamMappings || []).forEach((mapping: any) => {
            if (!managerTeamMap[mapping.manager_id]) {
              managerTeamMap[mapping.manager_id] = [];
            }
            managerTeamMap[mapping.manager_id].push(mapping.account_manager_id);
          });
        }

        // Get all AM/Sales profiles in the same entity+division for fallback matching
        const allAMProfiles = accountManagers.filter(am => 
          am.role === 'account_manager' || am.role === 'staff' || am.role === 'sales'
        );

        accountManagers.forEach((manager) => {
          if (manager.role === 'manager') {
            // Find all AM/Sales that report to this manager
            const teamMemberIds = new Set<string>();
            
            // Method 1: Via manager_team_members table (explicit mapping)
            if (managerTeamMap[manager.id]) {
              managerTeamMap[manager.id].forEach((amId: string) => {
                // Include all AMs that are mapped, even if not in amIds (they might have 0 achieved)
                teamMemberIds.add(amId);
              });
            }
            
            // Method 2: Via manager_id in user_profiles
            (allTeamProfiles || []).forEach((p: any) => {
              if (p.manager_id === manager.id && p.id !== manager.id) {
                teamMemberIds.add(p.id);
              }
            });
            
            // Method 3: Via entity + division_id match (fallback if manager_id not set)
            if (manager.entity_id && manager.division_id) {
              allAMProfiles.forEach((am: any) => {
                if (!am.manager_id && 
                    am.entity_id === manager.entity_id && 
                    am.division_id === manager.division_id) {
                  teamMemberIds.add(am.id);
                }
              });
            }

            // Aggregate revenue and margin from all team members
            let managerRevenue = 0;
            let managerMargin = 0;

            teamMemberIds.forEach((memberId) => {
              managerRevenue += achievedRevByProfile[memberId] || 0;
              managerMargin += achievedMarByProfile[memberId] || 0;
            });

            // Set manager's achieved as sum of team members (archived = sum of all AM archived)
            achievedRevByProfile[manager.id] = managerRevenue;
            achievedMarByProfile[manager.id] = managerMargin;
          }
        });

        console.log('✅ [SalesTarget] Achieved Revenue by Profile:', achievedRevByProfile);
        console.log('✅ [SalesTarget] Achieved Margin by Profile:', achievedMarByProfile);
        
        setAchievedByProfileRevenue(achievedRevByProfile);
        setAchievedByProfileMargin(achievedMarByProfile);
      } catch (e) {
        console.error('❌ [SalesTarget] Error computing actuals:', e);
        setAchievedByProfileRevenue({});
        setAchievedByProfileMargin({});
      } finally {
        setLoadingAchieved(false);
      }
    };

    computeActuals();
  }, [selectedPeriod, accountManagers]);

  // Filter targets by selected period
  const filteredTargets = useMemo(() => {
    // If no targets, return empty
    if (targets.length === 0) {
      return [];
    }
    
    // If no selectedPeriod, return all targets
    if (!selectedPeriod) {
      return targets;
    }
    
    const { start, end } = getQuarterRange(selectedPeriod);
    if (!start || !end) {
      // Invalid period, return all targets
      return targets;
    }
    
    // Filter targets that overlap with the selected period
    const filtered = targets.filter(target => {
      const targetStart = target.period_start;
      const targetEnd = target.period_end;
      
      if (!targetStart || !targetEnd) {
        return false;
      }
      
      // Target overlaps if: target starts before period ends AND target ends after period starts
      // Convert to Date objects for comparison to avoid string comparison issues
      const targetStartDate = new Date(targetStart);
      const targetEndDate = new Date(targetEnd);
      const periodStartDate = new Date(start);
      const periodEndDate = new Date(end);
      
      const overlaps = targetStartDate <= periodEndDate && targetEndDate >= periodStartDate;
      return overlaps;
    });
    
    // If filtered is empty but we have targets, return all targets (fallback)
    // This ensures data is always shown
    if (filtered.length === 0 && targets.length > 0) {
      return targets;
    }
    
    return filtered;
  }, [targets, selectedPeriod]);

  // Auto-fix selectedPeriod if filtered targets is empty but we have targets
  useEffect(() => {
    if (filteredTargets.length === 0 && targets.length > 0 && selectedPeriod) {
      // Find the period that has the most targets
      const periodCounts = new Map<string, number>();
      targets.forEach((target: any) => {
        if (target.period_start) {
          const startDate = new Date(target.period_start);
          const month = startDate.getMonth() + 1;
          const year = startDate.getFullYear();
          let quarter = 1;
          if (month >= 1 && month <= 3) quarter = 1;
          else if (month >= 4 && month <= 6) quarter = 2;
          else if (month >= 7 && month <= 9) quarter = 3;
          else if (month >= 10 && month <= 12) quarter = 4;
          const period = `Q${quarter} ${year}`;
          periodCounts.set(period, (periodCounts.get(period) || 0) + 1);
        }
      });
      
      // Find period with most targets
      let maxCount = 0;
      let bestPeriod = '';
      periodCounts.forEach((count, period) => {
        if (count > maxCount) {
          maxCount = count;
          bestPeriod = period;
        }
      });
      
      if (bestPeriod && bestPeriod !== selectedPeriod) {
        setSelectedPeriod(bestPeriod);
      }
    }
  }, [filteredTargets.length, targets.length, selectedPeriod]);

  // Calculate department metrics from real data
  const departmentMetrics = useMemo(() => {
    const targetMargin = filteredTargets.filter((target) => target.measure === "margin");
    const totalTarget = targetMargin.reduce((sum, target) => sum + Number(target.amount), 0);
    
    // Calculate achieved from real data
    const totalAchieved = Object.values(achievedByProfileMargin).reduce((sum, val) => sum + val, 0);
    const gap = totalTarget - totalAchieved;

    return {
      target: totalTarget,
      achieved: totalAchieved,
      gap: gap,
      percentage: totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0,
    };
  }, [filteredTargets, achievedByProfileMargin]);

  const departmentMetricsRevenue = useMemo(() => {
    const targetRevenue = filteredTargets.filter((target) => target.measure === "revenue");
    const totalTarget = targetRevenue.reduce((sum, target) => sum + Number(target.amount), 0);
    
    // Calculate achieved from real data
    const totalAchieved = Object.values(achievedByProfileRevenue).reduce((sum, val) => sum + val, 0);
    const gap = totalTarget - totalAchieved;

    return {
      target: totalTarget,
      achieved: totalAchieved,
      gap: gap,
      percentage: totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0,
    };
  }, [filteredTargets, achievedByProfileRevenue]);

  // Transform targets data for team performance chart
  const amPerformanceData = useMemo(() => {
    if (!filteredTargets || filteredTargets.length === 0) return [];
    
    const dataByAM = new Map<string, { name: string; target: number; achieved: number; role: string }>();
    
    accountManagers.forEach((am) => {
      const amTargets = filteredTargets.filter(t => t.assigned_to === am.id);
      const revenueTarget = amTargets
        .filter(t => t.measure === 'revenue')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      // For managers, achieved = sum of all AM/Sales that report to them
      let revenueAchieved = achievedByProfileRevenue[am.id] || 0;
      if (am.role === 'manager') {
        const teamMembers = accountManagers.filter(
          (member) => member.manager_id === am.id || 
                      (member.role !== 'manager' && member.entity_id === am.entity_id && member.division_id === am.division_id)
        );
        revenueAchieved = teamMembers.reduce((sum, member) => sum + (achievedByProfileRevenue[member.id] || 0), 0);
      }
      
      const roleLabel = am.role === "manager" ? "MGR" : am.role === "head" ? "HEAD" : "AM";
      const displayName = `${am.full_name} (${roleLabel})`;
      
      dataByAM.set(am.id, {
        name: displayName,
        target: revenueTarget,
        achieved: revenueAchieved,
        role: am.role || 'account_manager',
      });
    });

    const roleOrder = { head: 0, manager: 1, account_manager: 2 };
    return Array.from(dataByAM.values())
      .sort((a, b) => {
        const roleCompare = (roleOrder[a.role as keyof typeof roleOrder] || 3) - 
                           (roleOrder[b.role as keyof typeof roleOrder] || 3);
        return roleCompare !== 0 ? roleCompare : b.achieved - a.achieved;
      });
  }, [filteredTargets, accountManagers, achievedByProfileRevenue]);

  // Calculate attainment percentage
  const attainmentData = useMemo(() => {
    const achievementRate = departmentMetrics.target > 0
      ? (departmentMetrics.achieved / departmentMetrics.target) * 100
      : 0;
    return [
      {
        name: "Achieved",
        value: Math.round(achievementRate),
        fill: achievementRate >= 100 ? "hsl(142, 76%, 36%)" : achievementRate >= 80 ? "hsl(38, 92%, 50%)" : "hsl(var(--primary))",
      },
      {
        name: "Remaining",
        value: Math.round(Math.max(0, 100 - achievementRate)),
        fill: "hsl(var(--muted))",
      },
    ];
  }, [departmentMetrics]);

  // Calculate table data for margin
  const amTableDataMargin = useMemo(() => {
    const roleOrder = { head: 0, manager: 1, account_manager: 2 };
    
    return accountManagers.map((am) => {
      const amTargets = filteredTargets.filter(t => t.assigned_to === am.id && t.measure === 'margin');
      const totalTarget = amTargets.reduce((sum, t) => sum + Number(t.amount), 0);
      
      // For managers, achieved = sum of all AM/Sales that report to them
      // Note: achievedByProfileMargin already contains aggregated data for managers from computeActuals
      let achieved = achievedByProfileMargin[am.id] || 0;
      
      const gap = totalTarget - achieved;
      
      // Calculate monthly and quarterly targets based on period
      let monthlyTarget = 0;
      let quarterlyTarget = 0;
      
      if (amTargets.length > 0) {
        amTargets.forEach(target => {
          const periodStart = new Date(target.period_start);
          const periodEnd = new Date(target.period_end);
          if (!isNaN(periodStart.getTime()) && !isNaN(periodEnd.getTime())) {
            const monthsDiff = (periodEnd.getFullYear() - periodStart.getFullYear()) * 12 +
                             (periodEnd.getMonth() - periodStart.getMonth()) + 1;
            const safeMonths = Math.max(monthsDiff, 1);
            monthlyTarget += Number(target.amount) / safeMonths;
            
            // Quarterly target = total target for the quarter (3 months)
            // If period is 3 months, quarterly = total. If longer, divide by quarters
            if (safeMonths >= 3) {
              quarterlyTarget += Number(target.amount) / Math.ceil(safeMonths / 3);
            } else {
              quarterlyTarget += Number(target.amount); // Less than 3 months, use full amount
            }
          }
        });
      } else {
        // If no targets, quarterly target should be 0
        quarterlyTarget = 0;
      }
      
      let status = "No Target";
      if (totalTarget > 0) {
        if (gap <= 0) status = "On Track";
        else if (achieved > totalTarget * 1.05) status = "Ahead";
        else status = "Behind";
      }
      
      return {
        am: am.full_name,
        amId: am.id,
        role: am.role || "account_manager",
        monthlyTarget,
        quarterlyTarget: quarterlyTarget || 0,
        achieved,
        gap,
        status,
        measure: "margin",
      };
    }).sort((a, b) => {
      const roleCompare = (roleOrder[a.role as keyof typeof roleOrder] || 3) - 
                         (roleOrder[b.role as keyof typeof roleOrder] || 3);
      if (roleCompare !== 0) return roleCompare;
      return b.quarterlyTarget - a.quarterlyTarget;
    });
  }, [filteredTargets, accountManagers, achievedByProfileMargin]);

  // Calculate table data for revenue
  const amTableDataRevenue = useMemo(() => {
    const roleOrder = { head: 0, manager: 1, account_manager: 2 };
    
    return accountManagers.map((am) => {
      const amTargets = filteredTargets.filter(t => t.assigned_to === am.id && t.measure === 'revenue');
      const totalTarget = amTargets.reduce((sum, t) => sum + Number(t.amount), 0);
      
      // For managers, achieved = sum of all AM/Sales that report to them
      // Note: achievedByProfileRevenue already contains aggregated data for managers from computeActuals
      let achieved = achievedByProfileRevenue[am.id] || 0;
      
      const gap = totalTarget - achieved;
      
      // Calculate monthly and quarterly targets based on period
      let monthlyTarget = 0;
      let quarterlyTarget = 0;
      
      if (amTargets.length > 0) {
        amTargets.forEach(target => {
          const periodStart = new Date(target.period_start);
          const periodEnd = new Date(target.period_end);
          if (!isNaN(periodStart.getTime()) && !isNaN(periodEnd.getTime())) {
            const monthsDiff = (periodEnd.getFullYear() - periodStart.getFullYear()) * 12 +
                             (periodEnd.getMonth() - periodStart.getMonth()) + 1;
            const safeMonths = Math.max(monthsDiff, 1);
            monthlyTarget += Number(target.amount) / safeMonths;
            
            // Quarterly target = total target for the quarter (3 months)
            // If period is 3 months, quarterly = total. If longer, divide by quarters
            if (safeMonths >= 3) {
              quarterlyTarget += Number(target.amount) / Math.ceil(safeMonths / 3);
            } else {
              quarterlyTarget += Number(target.amount); // Less than 3 months, use full amount
            }
          }
        });
      } else {
        // If no targets, quarterly target should be 0
        quarterlyTarget = 0;
      }
      
      let status = "No Target";
      if (totalTarget > 0) {
        if (gap <= 0) status = "On Track";
        else if (achieved > totalTarget * 1.05) status = "Ahead";
        else status = "Behind";
      }
      
      return {
        am: am.full_name,
        amId: am.id,
        role: am.role || "account_manager",
        monthlyTarget,
        quarterlyTarget: quarterlyTarget || 0,
        achieved,
        gap,
        status,
        measure: "revenue",
      };
    }).sort((a, b) => {
      const roleCompare = (roleOrder[a.role as keyof typeof roleOrder] || 3) - 
                         (roleOrder[b.role as keyof typeof roleOrder] || 3);
      if (roleCompare !== 0) return roleCompare;
      return b.quarterlyTarget - a.quarterlyTarget;
    });
  }, [filteredTargets, accountManagers, achievedByProfileRevenue]);

  const pageTitle = profile?.role === "head" ? "Manager Target" : "Sales Target";
  const isLoading = loading || loadingAchieved;

  // Debug logging
  useEffect(() => {
    console.log('📊 [SalesTarget] Current state:', {
      profile: profile ? { id: profile.id, role: profile.role, entity_id: profile.entity_id, division_id: profile.division_id } : null,
      targetsCount: targets.length,
      filteredTargetsCount: filteredTargets.length,
      accountManagersCount: accountManagers.length,
      selectedPeriod,
      availablePeriods: availablePeriods.length,
      availablePeriodsList: availablePeriods,
      achievedRevenue: Object.keys(achievedByProfileRevenue).length,
      achievedMargin: Object.keys(achievedByProfileMargin).length,
      loading,
      loadingAchieved,
    });
    
    if (targets.length > 0) {
      console.log('   Targets sample:', targets.slice(0, 3).map((t: any) => ({
        id: t.id,
        assigned_to: t.assigned_to,
        measure: t.measure,
        amount: t.amount,
        period_start: t.period_start,
        period_end: t.period_end
      })));
    }
    
    if (accountManagers.length > 0) {
      console.log('   Account Managers:', accountManagers.map((am: any) => ({
        id: am.id,
        name: am.full_name,
        role: am.role
      })));
    }
  }, [targets.length, filteredTargets.length, accountManagers.length, selectedPeriod, availablePeriods.length, profile, loading, loadingAchieved]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{pageTitle}</h1>
          <p className="text-muted-foreground">
            Monitor and manage sales targets for {selectedPeriod || 'selected period'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button className="gap-2" onClick={() => setIsAddTargetOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Target
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Period</span>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {availablePeriods.length > 0 ? (
                  availablePeriods.map((period) => (
                    <SelectItem key={period} value={period}>
                      {period}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="Q1 2026">Q1 2026</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Key Metrics - Margin */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Margin Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(departmentMetrics.target)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Progress value={departmentMetrics.percentage} className="h-2" />
              <span className="text-xs text-muted-foreground">
                {departmentMetrics.percentage.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Margin Achieved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(departmentMetrics.achieved)}
            </div>
            <div className="flex items-center gap-1 mt-2">
              {departmentMetrics.percentage >= 100 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-orange-600" />
              )}
              <span className="text-xs text-muted-foreground">
                {departmentMetrics.achieved > 0 ? 'Real data from projects' : 'No projects yet'}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Margin Gap
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${departmentMetrics.gap > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(Math.abs(departmentMetrics.gap))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {departmentMetrics.gap > 0 ? 'Remaining to achieve' : 'Target exceeded'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Key Metrics - Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(departmentMetricsRevenue.target)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Progress value={departmentMetricsRevenue.percentage} className="h-2" />
              <span className="text-xs text-muted-foreground">
                {departmentMetricsRevenue.percentage.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue Achieved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(departmentMetricsRevenue.achieved)}
            </div>
            <div className="flex items-center gap-1 mt-2">
              {departmentMetricsRevenue.percentage >= 100 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-orange-600" />
              )}
              <span className="text-xs text-muted-foreground">
                {departmentMetricsRevenue.achieved > 0 ? 'Real data from projects' : 'No projects yet'}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue Gap
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${departmentMetricsRevenue.gap > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(Math.abs(departmentMetricsRevenue.gap))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {departmentMetricsRevenue.gap > 0 ? 'Remaining to achieve' : 'Target exceeded'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Bar Chart */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Team Performance - Revenue</CardTitle>
              <CardDescription>Target vs Achieved by team member</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-80">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-muted-foreground">Loading chart data...</span>
                  </div>
                ) : amPerformanceData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={amPerformanceData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        fontSize={11}
                      />
                      <YAxis fontSize={12} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelStyle={{ color: '#000' }}
                      />
                      <Legend />
                      <Bar dataKey="target" fill="hsl(var(--muted))" name="Target" />
                      <Bar dataKey="achieved" fill="hsl(var(--primary))" name="Achieved" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-muted-foreground">No data available</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Donut Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Margin Attainment</CardTitle>
            <CardDescription className="text-center">Achievement percentage</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="relative">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={attainmentData}
                    cx={100}
                    cy={100}
                    innerRadius={60}
                    outerRadius={90}
                    startAngle={90}
                    endAngle={450}
                    dataKey="value"
                  >
                    {attainmentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-3xl font-bold">
                    {attainmentData[0]?.value || 0}%
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Achieved</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Tables */}
      {/* Margin Table */}
      <Card>
        <CardHeader>
          <CardTitle>Margin Performance</CardTitle>
          <CardDescription>Detailed breakdown by team member</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Monthly Target</TableHead>
                <TableHead className="text-right">Quarterly Target</TableHead>
                <TableHead className="text-right">Achieved</TableHead>
                <TableHead className="text-right">Gap</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    Loading targets...
                  </TableCell>
                </TableRow>
              ) : amTableDataMargin.length > 0 ? (
                amTableDataMargin.map((row, index) => {
                  const roleLabel =
                    row.role === "manager"
                      ? "Manager"
                      : row.role === "head"
                      ? "Head"
                      : "Account Manager";

                  const bgClass =
                    row.role === "head"
                      ? "bg-muted/50"
                      : row.role === "manager"
                      ? "bg-muted/30"
                      : "";

                  const progress = row.quarterlyTarget > 0 
                    ? (row.achieved / row.quarterlyTarget) * 100 
                    : 0;

                  return (
                    <TableRow key={row.amId || index} className={bgClass}>
                      <TableCell className="font-medium">{row.am}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{roleLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.monthlyTarget)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(row.quarterlyTarget)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.achieved)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          row.gap > 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {formatCurrency(Math.abs(row.gap))}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "On Track" || row.status === "Ahead"
                              ? "default"
                              : row.status === "No Target"
                              ? "outline"
                              : "destructive"
                          }
                          className={
                            row.status === "Ahead"
                              ? "bg-green-600"
                              : row.status === "On Track"
                              ? "bg-blue-600"
                              : ""
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress value={progress} className="w-24 h-2" />
                          <span className="text-xs w-12 text-right">
                            {progress.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    No team members found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Revenue Table */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Performance</CardTitle>
          <CardDescription>Detailed breakdown by team member</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Monthly Target</TableHead>
                <TableHead className="text-right">Quarterly Target</TableHead>
                <TableHead className="text-right">Achieved</TableHead>
                <TableHead className="text-right">Gap</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    Loading targets...
                  </TableCell>
                </TableRow>
              ) : amTableDataRevenue.length > 0 ? (
                amTableDataRevenue.map((row, index) => {
                  const roleLabel =
                    row.role === "manager"
                      ? "Manager"
                      : row.role === "head"
                      ? "Head"
                      : "Account Manager";

                  const bgClass =
                    row.role === "head"
                      ? "bg-muted/50"
                      : row.role === "manager"
                      ? "bg-muted/30"
                      : "";

                  const progress = row.quarterlyTarget > 0 
                    ? (row.achieved / row.quarterlyTarget) * 100 
                    : 0;

                  return (
                    <TableRow key={row.amId || index} className={bgClass}>
                      <TableCell className="font-medium">{row.am}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{roleLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.monthlyTarget)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(row.quarterlyTarget)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.achieved)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          row.gap > 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {formatCurrency(Math.abs(row.gap))}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "On Track" || row.status === "Ahead"
                              ? "default"
                              : row.status === "No Target"
                              ? "outline"
                              : "destructive"
                          }
                          className={
                            row.status === "Ahead"
                              ? "bg-green-600"
                              : row.status === "On Track"
                              ? "bg-blue-600"
                              : ""
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress value={progress} className="w-24 h-2" />
                          <span className="text-xs w-12 text-right">
                            {progress.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    No team members found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Target Modal */}
      <AddTargetModal
        open={isAddTargetOpen}
        onOpenChange={setIsAddTargetOpen}
        onTargetAdded={() => {
          fetchTargets();
          if (selectedPeriod) {
            setTimeout(() => fetchTargets(selectedPeriod), 100);
          }
        }}
      />
    </div>
  );
}

export default SalesTarget;

