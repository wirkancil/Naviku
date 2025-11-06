import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ⚠️ DEPRECATED: This hook queries the old 'teams' table which no longer exists
// The new hierarchy is: Entity → Team (which was 'divisions')
// Use useDivisions instead for team management

interface Team {
  id: string;
  name: string;
  department_id: string;
  created_at: string;
}

export const useTeams = (departmentId?: string) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = async (deptId?: string) => {
    console.warn('⚠️ useTeams is DEPRECATED. The "teams" table no longer exists. Use useDivisions instead.');
    setLoading(false);
    setError('This feature has been migrated to the new Entity-Team structure. Please use Team Management instead.');
    setTeams([]);
  };

  useEffect(() => {
    fetchTeams(departmentId);
  }, [departmentId]);

  return {
    teams,
    loading,
    error,
    refetch: () => fetchTeams(departmentId),
  };
};
