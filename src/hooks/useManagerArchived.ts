import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ManagerArchived {
  manager_id: string;
  manager_name: string;
  entity_id: string | null;
  division_id: string | null;
  revenue: number;
  margin: number;
  project_count: number;
}

export interface UseManagerArchivedOptions {
  period?: string; // e.g., "Q1 2026"
  startDate?: Date;
  endDate?: Date;
  managerId?: string; // Untuk single manager
}

/**
 * Hook untuk mengambil archived manager
 * Untuk HEAD: melihat archived dari semua manager di tim/entity mereka
 * Untuk MANAGER: melihat archived mereka sendiri
 */
export function useManagerArchived(options: UseManagerArchivedOptions = {}) {
  const { period, startDate, endDate, managerId } = options;

  return useQuery({
    queryKey: ['manager-archived', period, startDate, endDate, managerId],
    queryFn: async () => {
      // Jika single manager, gunakan get_manager_archived
      if (managerId) {
        const { data, error } = await supabase.rpc('get_manager_archived', {
          p_manager_id: managerId,
          p_period: period || null,
          p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
          p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
        });

        if (error) throw error;

        // get_manager_archived returns a single row
        if (data && data.length > 0) {
          return {
            revenue: Number(data[0].revenue || 0),
            margin: Number(data[0].margin || 0),
            project_count: Number(data[0].project_count || 0),
          };
        }

        return {
          revenue: 0,
          margin: 0,
          project_count: 0,
        };
      }

      // Untuk HEAD: gunakan get_head_manager_archived
      const { data, error } = await supabase.rpc('get_head_manager_archived', {
        p_period: period || null,
        p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
        p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
      });

      if (error) throw error;

      return (data || []) as ManagerArchived[];
    },
    enabled: true, // Always enabled
  });
}

