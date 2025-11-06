import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

export interface TeamMember {
  id: string;
  user_id: string;
  full_name: string;
}

export const useManagerTeam = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (!profile) {
        setLoading(false);
        return;
      }

      // Only fetch for manager role
      if (profile.role !== 'manager') {
        setTeamMembers([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        console.log('🔍 [useManagerTeam] Fetching team members for manager:', {
          profileId: profile.id,
          entity_id: profile.entity_id,
          division_id: profile.division_id,
          role: profile.role
        });

        // Try explicit mapping via manager_team_members (manager_id references user_profiles.id)
        const { data: teamMap, error } = await supabase
          .from('manager_team_members')
          .select('account_manager_id')
          .eq('manager_id', profile.id);

        if (error) {
          console.warn('⚠️ [useManagerTeam] manager_team_members query error:', error);
        }

        const amIds = (teamMap || []).map((m: any) => m.account_manager_id);
        console.log('📋 [useManagerTeam] Explicit mapping found:', amIds.length, 'members');

        if (amIds.length === 0) {
          // Fallback: derive team by entity + team (division_id) AND manager_id for manager-level visibility
          // Include ALL roles that report to manager: account_manager, staff, sales
          // Strategy: Query users who have manager_id OR (entity_id + division_id match)
          
          let fallbackProfiles: any[] = [];
          
          // PRIORITY 1: Query users with explicit manager_id assignment
          const { data: managerAssignedProfiles, error: managerError } = await supabase
            .from('user_profiles')
            .select('id, full_name, user_id, role, entity_id, division_id, manager_id')
            .in('role', ['account_manager', 'staff', 'sales'])
            .eq('is_active', true)
            .eq('manager_id', profile.id);
          
          if (managerError) {
            console.warn('⚠️ [useManagerTeam] Manager ID query error:', managerError);
          } else {
            fallbackProfiles = (managerAssignedProfiles || []);
            console.log('📋 [useManagerTeam] Found', fallbackProfiles.length, 'users with explicit manager_id');
          }

          // PRIORITY 2: Query users in same entity + division (if manager has entity + division)
          if (profile.division_id && profile.entity_id) {
            const { data: teamProfiles, error: teamError } = await supabase
              .from('user_profiles')
              .select('id, full_name, user_id, role, entity_id, division_id, manager_id')
              .in('role', ['account_manager', 'staff', 'sales'])
              .eq('is_active', true)
              .eq('entity_id', profile.entity_id)
              .eq('division_id', profile.division_id);
            
            if (teamError) {
              console.warn('⚠️ [useManagerTeam] Team query error:', teamError);
            } else {
              // Merge with existing results, avoiding duplicates
              const existingIds = new Set(fallbackProfiles.map(p => p.id));
              const newProfiles = (teamProfiles || []).filter(p => !existingIds.has(p.id));
              fallbackProfiles = [...fallbackProfiles, ...newProfiles];
              console.log('📋 [useManagerTeam] Found', newProfiles.length, 'additional users in same team');
            }
          } else if (profile.entity_id) {
            // Fallback to entity level only
            const { data: entityProfiles, error: entityError } = await supabase
              .from('user_profiles')
              .select('id, full_name, user_id, role, entity_id, division_id, manager_id')
              .in('role', ['account_manager', 'staff', 'sales'])
              .eq('is_active', true)
              .eq('entity_id', profile.entity_id);
            
            if (entityError) {
              console.warn('⚠️ [useManagerTeam] Entity query error:', entityError);
            } else {
              const existingIds = new Set(fallbackProfiles.map(p => p.id));
              const newProfiles = (entityProfiles || []).filter(p => !existingIds.has(p.id));
              fallbackProfiles = [...fallbackProfiles, ...newProfiles];
              console.log('📋 [useManagerTeam] Found', newProfiles.length, 'additional users in same entity');
            }
          }

          console.log('🔍 [useManagerTeam] Total fallback profiles found:', fallbackProfiles.length, {
            manager_id: profile.id,
            entity_id: profile.entity_id,
            division_id: profile.division_id
          });

          console.log('📊 [useManagerTeam] Fallback query found:', fallbackProfiles?.length || 0, 'profiles');
          console.log('📋 [useManagerTeam] Profiles data:', fallbackProfiles);

          const mappedFallback: TeamMember[] = (fallbackProfiles || [])
            .filter((p: any) => {
              const hasUserId = !!p.user_id;
              if (!hasUserId) {
                console.warn('⚠️ [useManagerTeam] Profile without user_id:', p.id, p.full_name);
                return false;
              }
              
              // VALIDASI: Pastikan team member sesuai dengan entity dan division Manager
              const matchesEntity = p.entity_id === profile.entity_id;
              const matchesDivision = p.division_id === profile.division_id;
              
              if (!matchesEntity || !matchesDivision) {
                console.warn('⚠️ [useManagerTeam] Profile tidak sesuai entity/division:', {
                  name: p.full_name,
                  profile_entity: p.entity_id,
                  profile_division: p.division_id,
                  manager_entity: profile.entity_id,
                  manager_division: profile.division_id,
                  matches_entity: matchesEntity,
                  matches_division: matchesDivision
                });
                return false;
              }
              
              return true;
            })
            .map((p: any) => ({ 
              id: p.id, 
              user_id: p.user_id, 
              full_name: p.full_name || 'Unknown'
            }));

          console.log('✅ [useManagerTeam] Mapped team members (after validation):', mappedFallback.length);
          console.log('📋 [useManagerTeam] Team members details:', mappedFallback.map(m => ({
            name: m.full_name,
            id: m.id
          })));
          
          setTeamMembers(mappedFallback);
          return;
        }

        // Hydrate full_name and user_id from user_profiles for explicit mapping
        const { data: profiles, error: pError } = await supabase
          .from('user_profiles')
          .select('id, full_name, user_id')
          .in('id', amIds);

        if (pError) {
          console.error('❌ [useManagerTeam] Profile hydration error:', pError);
          throw pError;
        }

        console.log('📊 [useManagerTeam] Hydrated profiles:', profiles?.length || 0);

        // VALIDASI: Untuk explicit mapping, juga perlu verifikasi entity + division
        // Ambil data lengkap untuk validasi
        const { data: fullProfiles, error: fullError } = await supabase
          .from('user_profiles')
          .select('id, full_name, user_id, entity_id, division_id')
          .in('id', amIds);
        
        if (fullError) {
          console.error('❌ [useManagerTeam] Full profile fetch error:', fullError);
        }

        const mappedMembers: TeamMember[] = (fullProfiles || profiles || [])
          .filter((p: any) => {
            const hasUserId = !!p.user_id;
            if (!hasUserId) {
              console.warn('⚠️ [useManagerTeam] Profile without user_id:', p.id, p.full_name);
              return false;
            }
            
            // VALIDASI: Pastikan team member sesuai dengan entity dan division Manager
            // (Hanya jika ada data entity_id dan division_id)
            if (p.entity_id && p.division_id && profile.entity_id && profile.division_id) {
              const matchesEntity = p.entity_id === profile.entity_id;
              const matchesDivision = p.division_id === profile.division_id;
              
              if (!matchesEntity || !matchesDivision) {
                console.warn('⚠️ [useManagerTeam] Explicit mapping profile tidak sesuai entity/division:', {
                  name: p.full_name,
                  profile_entity: p.entity_id,
                  profile_division: p.division_id,
                  manager_entity: profile.entity_id,
                  manager_division: profile.division_id
                });
                // Tetap include karena ada explicit mapping (mungkin valid)
                // Tapi log warning untuk debugging
              }
            }
            
            return true;
          })
          .map((p: any) => ({ 
            id: p.id, 
            user_id: p.user_id, 
            full_name: p.full_name || 'Unknown'
          }));

        console.log('✅ [useManagerTeam] Final team members (explicit mapping):', mappedMembers.length);
        console.log('📋 [useManagerTeam] Team members details:', mappedMembers.map(m => ({
          name: m.full_name,
          id: m.id
        })));
        
        setTeamMembers(mappedMembers);
      } catch (err) {
        console.error('❌ [useManagerTeam] Error fetching team members:', err);
        setTeamMembers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTeamMembers();
  }, [user, profile]);

  return { teamMembers, loading };
};