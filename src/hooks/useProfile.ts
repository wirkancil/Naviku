import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface UserProfile {
  id: string;
  user_id?: string; // auth uid reference (optional for mock/admin)
  full_name: string | null;
  role: 'account_manager' | 'staff' | 'manager' | 'head' | 'admin';
  // Keep optional for UI compatibility, but not persisted in DB
  department?: string | null;
  created_at: string;
  preferences: any | null;
  division_id: string | null; // Now represents team_id semantically
  // department_id: string | null; // REMOVED - no longer exists in database
  team_id: string | null;
  is_active: boolean;
  // Phase 1 enhancements
  title_id: string | null;
  region_id: string | null;
  region_code: string | null;
  currency_code: string;
  locale: string;
  timezone: string;
  fiscal_calendar_id: string | null;
  external_id: string | null;
  tenant_id: string | null;
  user_status: 'active' | 'inactive' | 'resigned' | 'terminated' | 'leave';
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  updated_at: string | null;
  // Phase 1 hierarchy fields
  entity_id: string | null;
}

export const useProfile = () => {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [titleName, setTitleName] = useState<string | null>(null);
  const [regionName, setRegionName] = useState<string | null>(null);

  const fetchProfile = async (currentUser: User) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      // Jika tidak ada row, buat profil default
      if (error && (error as any).code !== 'PGRST116') {
        throw error;
      }

      if (!data) {
        // Check admin by ID or email allowlist
        const adminEmailsEnv = (import.meta as any).env?.VITE_ADMIN_EMAILS as string | undefined;
        const adminEmailList = (adminEmailsEnv || 'admin@gmail.com,hidayat.suli@gmail.com')
          .split(',')
          .map((e: string) => e.trim().toLowerCase())
          .filter(Boolean);
        const currentEmail = (currentUser.email || '').toLowerCase();

        const isAdminUser = currentUser.id === '3212a172-b6c8-417c-811a-735cc0033041' ||
          (currentEmail && adminEmailList.includes(currentEmail));
        
        if (isAdminUser) {
          // Try to bootstrap admin profile on the server (security definer)
          try {
            await supabase.rpc('ensure_admin_profile');
            const { data: createdProfile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('user_id', currentUser.id)
              .maybeSingle();
            if (createdProfile) {
              setProfile(createdProfile as any);
              setTitleName(null);
              setRegionName(null);
              setLoading(false);
              return;
            }
          } catch (e) {
            console.warn('ensure_admin_profile failed, using local mock profile');
          }

          // Fallback: local mock admin profile without DB insert
          const adminProfile: UserProfile = {
            id: currentUser.id,
            user_id: currentUser.id,
            full_name: 'System Administrator',
            role: 'admin',
            department: null,
            created_at: new Date().toISOString(),
            preferences: null,
            division_id: null,
            department_id: null,
            team_id: null,
            is_active: true,
            title_id: null,
            region_id: null,
            region_code: null,
            currency_code: 'USD',
            locale: 'en-US',
            timezone: 'UTC',
            fiscal_calendar_id: null,
            external_id: null,
            tenant_id: null,
            user_status: 'active',
            is_deleted: false,
            deleted_at: null,
            deleted_by: null,
            updated_at: null,
            entity_id: null,
          };
          setProfile(adminProfile);
          setTitleName(null);
          setRegionName(null);
        } else {
          // Non-admin: biarkan error agar UI menampilkan pesan yang sesuai
          setError('User profile not found');
        }
      } else {
        // Data exists: load profile
        setProfile(data as any);
        setTitleName(null);
        setRegionName(null);

        // If this user is allowlisted admin but role isn't admin, promote via RPC
        try {
          const adminEmailsEnv = (import.meta as any).env?.VITE_ADMIN_EMAILS as string | undefined;
          const adminEmailList = (adminEmailsEnv || 'admin@gmail.com,hidayat.suli@gmail.com')
            .split(',')
            .map((e: string) => e.trim().toLowerCase())
            .filter(Boolean);
          const currentEmail = (currentUser.email || '').toLowerCase();
          const isAdminUser = currentUser.id === '3212a172-b6c8-417c-811a-735cc0033041' ||
            (currentEmail && adminEmailList.includes(currentEmail));

          if (isAdminUser && String((data as any).role) !== 'admin') {
            await supabase.rpc('ensure_admin_profile');
            const { data: promotedProfile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('user_id', currentUser.id)
              .maybeSingle();
            if (promotedProfile) {
              setProfile(promotedProfile as any);
            }
          }
        } catch (e) {
          console.warn('admin promotion check failed', e);
        }
      }


      // Fetch title and region names if available
      if (data?.title_id) {
        const { data: titleData } = await supabase
          .from('titles')
          .select('name')
          .eq('id', data.title_id)
          .single();
        setTitleName(titleData?.name || null);
      } else {
        setTitleName(null);
      }

      if (data?.region_id) {
        const { data: regionData } = await supabase
          .from('regions')
          .select('name')
          .eq('id', data.region_id)
          .single();
        setRegionName(regionData?.name || null);
      } else {
        setRegionName(null);
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      // Fallback: if this is the special admin user, provide mock admin profile even on error
      if (user && user.id === '3212a172-b6c8-417c-811a-735cc0033041') {
      const adminProfile: UserProfile = {
        id: user.id,
        user_id: user.id,
        full_name: 'System Administrator',
        role: 'admin',
        department: null,
        created_at: new Date().toISOString(),
        preferences: null,
        division_id: null,
        department_id: null,
        team_id: null,
          is_active: true,
          title_id: null,
          region_id: null,
          region_code: null,
          currency_code: 'USD',
          locale: 'en-US',
          timezone: 'UTC',
          fiscal_calendar_id: null,
          external_id: null,
          tenant_id: null,
          user_status: 'active',
          is_deleted: false,
          deleted_at: null,
          deleted_by: null,
          updated_at: null,
          entity_id: null,
        };
        setProfile(adminProfile);
        setTitleName(null);
        setRegionName(null);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user || !profile) return { error: 'No user or profile found' };

    try {
      // Remove non-DB fields to avoid PostgREST schema errors
      const { department, ...safeUpdates } = updates as any;
      const { data, error } = await supabase
        .from('user_profiles')
        .update(safeUpdates as any)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      setProfile(data as any);
      return { data, error: null };
    } catch (err: any) {
      console.error('Error updating profile:', err);
      return { data: null, error: err.message };
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        
        const { data: existingProfile, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();


        if (error) {
          console.error('Error fetching profile:', error);
          throw error;
        }

        if (existingProfile) {
          setProfile(existingProfile);
        } else {
          // Create default profile for new users
          const defaultProfile = {
            id: user.id,
            user_id: user.id,
            full_name: user.email?.split('@')[0] || 'User',
            role: 'account_manager' as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };


          const { data: newProfile, error: insertError } = await supabase
            .from('user_profiles')
            .insert([defaultProfile])
            .select()
            .single();

          if (insertError) {
            console.error('Error creating profile:', insertError);
            throw insertError;
          }

          setProfile(newProfile);
        }

        // Handle admin user bootstrapping
        if (user.email === 'admin@thrive.com') {
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ role: 'admin' })
            .eq('user_id', user.id);

          if (updateError) {
            console.error('Error updating admin role:', updateError);
          } else {
            // Refresh profile after role update
            const { data: updatedProfile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('user_id', user.id)
              .single();
            
            if (updatedProfile) {
              setProfile(updatedProfile);
            }
          }
        }

      } catch (error) {
        console.error('Profile fetch error:', error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      if (user) {
        fetchProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    }
  }, [user, authLoading]);

  // Helper functions for role checking
  const hasRole = (requiredRole: UserProfile['role']) => {
    return profile?.role === requiredRole;
  };

  const canAccessDivisionData = () => {
    return profile?.role === 'head' || profile?.role === 'manager' || profile?.role === 'admin';
  };

  const canAccessDepartmentData = () => {
    return profile?.role === 'manager' || profile?.role === 'admin';
  };

  const canManageRoles = () => {
    return profile?.role === 'manager' || profile?.role === 'admin';
  };

  // Phase 1 role helpers
  const isAdmin = () => profile?.role === 'admin';
  const isHead = () => profile?.role === 'head';  
  const isManager = () => profile?.role === 'manager';
  const isAccountManager = () => profile?.role === 'account_manager';

  // Enhanced display helper for role + title + region
  const getDisplayName = () => {
    if (!profile) return '';
    const parts = [];
    if (profile.full_name) parts.push(profile.full_name);
    return parts.join(' - ');
  };

  const getRoleDisplayName = () => {
    if (!profile) return '';
    const parts = [];
    
    // Add role display name
    const roleNames = {
      'admin': 'System Administrator',
      'head': 'Level Head', 
      'manager': 'Level Manager',
      'account_manager': 'Field Sales Staff'
    } as const;
    parts.push(roleNames[profile.role] || profile.role);
    
    // Add actual title name if available
    if (titleName) {
      parts.push(titleName);
    }
    
    // Add actual region name if available
    if (regionName) {
      parts.push(regionName);
    }
    
    return parts.join(' – ');
  };

  return {
    profile,
    loading: loading || authLoading,
    error,
    updateProfile,
    refetch: () => user && fetchProfile(user),
    // Helper functions
    hasRole,
    canAccessDivisionData,
    canAccessDepartmentData,
    canManageRoles,
    // Phase 1 helpers
    isAdmin,
    isHead,
    isManager,
    isAccountManager,
    getDisplayName,
    getRoleDisplayName,
  };
};