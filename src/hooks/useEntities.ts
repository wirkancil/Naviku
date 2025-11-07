import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';

export interface Entity {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useEntities = () => {
  const { profile } = useProfile();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntities = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .order('name');

      if (error) throw error;
      setEntities(data || []);
    } catch (err: any) {
      console.error('Error fetching entities:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createEntity = async (name: string, code?: string) => {
    if (!profile?.role || profile.role !== 'admin') {
      throw new Error('Only admins can create entities');
    }

    try {
      // Use RPC function to bypass RLS issues
      const { data: entityId, error: rpcError } = await supabase.rpc('admin_create_entity', {
        p_name: name,
        p_code: code || null
      });

      if (rpcError) {
        console.error('Error creating entity via RPC:', rpcError);
        throw rpcError;
      }

      // Fetch the created entity
      const { data, error: fetchError } = await supabase
        .from('entities')
        .select('*')
        .eq('id', entityId)
        .single();

      if (fetchError) {
        console.error('Error fetching created entity:', fetchError);
        // Still return success if RPC succeeded
        await fetchEntities();
        return { data: null, error: null };
      }

      await fetchEntities();
      return { data, error: null };
    } catch (err: any) {
      console.error('Error creating entity:', err);
      return { data: null, error: err.message };
    }
  };

  const updateEntity = async (id: string, updates: { name?: string; code?: string; is_active?: boolean }) => {
    if (!profile?.role || profile.role !== 'admin') {
      throw new Error('Only admins can update entities');
    }

    try {
      // Use RPC function to bypass RLS issues
      const { data: success, error: rpcError } = await supabase.rpc('admin_update_entity', {
        p_entity_id: id,
        p_name: updates.name || null,
        p_code: updates.code || null,
        p_is_active: updates.is_active ?? null
      });

      if (rpcError) {
        console.error('Error updating entity via RPC:', rpcError);
        throw rpcError;
      }

      if (!success) {
        throw new Error('Entity not found or update failed');
      }

      // Fetch the updated entity
      const { data, error: fetchError } = await supabase
        .from('entities')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching updated entity:', fetchError);
        // Still return success if RPC succeeded
        await fetchEntities();
        return { data: null, error: null };
      }

      await fetchEntities();
      return { data, error: null };
    } catch (err: any) {
      console.error('Error updating entity:', err);
      return { data: null, error: err.message };
    }
  };

  const deleteEntity = async (id: string) => {
    if (!profile?.role || profile.role !== 'admin') {
      throw new Error('Only admins can delete entities');
    }

    try {
      // Use RPC function to bypass RLS issues
      const { data: success, error: rpcError } = await supabase.rpc('admin_delete_entity', {
        p_entity_id: id
      });

      if (rpcError) {
        console.error('Error deleting entity via RPC:', rpcError);
        throw rpcError;
      }

      if (!success) {
        throw new Error('Entity not found or delete failed');
      }

      await fetchEntities();
      return { error: null };
    } catch (err: any) {
      console.error('Error deleting entity:', err);
      return { error: err.message };
    }
  };

  useEffect(() => {
    fetchEntities();
  }, []);

  return {
    entities,
    loading,
    error,
    createEntity,
    updateEntity,
    deleteEntity,
    refetch: fetchEntities,
  };
};