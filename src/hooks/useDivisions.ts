import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Division {
  id: string;
  name: string;
  organization_id: string | null;
  entity_id: string | null;
  head_id: string | null;
  created_at: string;
}

export function useDivisions() {
  const { user } = useAuth();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDivisions = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .order('name');

      if (error) throw error;

      setDivisions(data || []);
    } catch (err: any) {
      console.error('Error fetching divisions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDivisions();
    }
  }, [user]);

  return {
    divisions,
    loading,
    error,
    // CRUD functions (now with entity_id and head_id support)
    createDivision: async (name: string, entityId?: string | null, headId?: string | null) => {
      const { error } = await supabase.from('divisions').insert({ 
        name, 
        entity_id: entityId,
        head_id: headId 
      });
      if (error) throw error;
      await fetchDivisions();
    },
    updateDivision: async (id: string, payload: { name?: string; entity_id?: string | null; head_id?: string | null }) => {
      const { error } = await supabase.from('divisions').update(payload).eq('id', id);
      if (error) throw error;
      await fetchDivisions();
    },
    deleteDivision: async (id: string) => {
      const { error } = await supabase.from('divisions').delete().eq('id', id);
      if (error) throw error;
      await fetchDivisions();
    },
    refetch: fetchDivisions,
  };
}