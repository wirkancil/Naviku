// ============================================================================
// DEPRECATED: useDepartments
// ============================================================================
// Tabel 'departments' sudah tidak ada setelah migration ke Entity + Team.
// Sekarang struktur: Entity → Team (divisions) → User
// 
// Gunakan:
// - useEntities() untuk entity
// - useDivisions() untuk team (divisions = team)
// ============================================================================

import { useState } from 'react';

export interface Department {
  id: string;
  name: string;
  division_id: string | null;
  created_at: string;
}

/**
 * @deprecated Tabel departments sudah tidak ada. Gunakan useDivisions() untuk team.
 */
export const useDepartments = () => {
  console.warn('⚠️ useDepartments() is DEPRECATED. Table "departments" no longer exists. Use useDivisions() for teams instead.');
  
  const [departments] = useState<Department[]>([]);
  const [loading] = useState(false);
  const [error] = useState<string>('Departments table no longer exists. Use teams (divisions) instead.');

  const createDepartment = async () => {
    throw new Error('Departments table no longer exists. Use useDivisions() to create teams.');
  };

  const updateDepartment = async () => {
    throw new Error('Departments table no longer exists. Use useDivisions() to update teams.');
  };

  const deleteDepartment = async () => {
    throw new Error('Departments table no longer exists. Use useDivisions() to delete teams.');
  };

  const fetchDepartments = async () => {
    console.warn('⚠️ fetchDepartments called but departments table no longer exists');
  };

  return {
    departments,
    loading,
    error,
    refetch: fetchDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
  };
};