# Implementation Checklist: Entity + Team Migration

**Status:** Prepared, Ready for Review & Testing  
**Created:** 5 November 2025

---

## 📦 Deliverables Created

### ✅ **Database Migrations (3 files)**

1. **`20251105000000_simplify_to_entity_team.sql`**
   - Schema transformation: Division/Department → Entity/Team
   - Adds head_id, entity_id to divisions (teams)
   - Drops departments and old teams tables
   - Adds validation triggers
   - Adds indexes for performance

2. **`20251105000100_update_rls_entity_team.sql`**
   - Updates ALL RLS policies for entity-based scoping
   - Policies for: opportunities, pipeline_items, user_profiles, sales_activities, entities, divisions
   - Implements hierarchy: Admin → Head → Manager → Sales

3. **`20251105000200_update_rpc_entity_team.sql`**
   - Updates RPC functions: get_entity_scoped_opportunities, get_entity_scoped_targets
   - Removes department_id logic, adds entity_id logic
   - Maintains backward compatibility with existing hooks

### ✅ **Documentation (3 files)**

4. **`ENTITY_TEAM_MIGRATION_SUMMARY.md`**
   - Complete overview of changes
   - Before/after structure comparison
   - Data access examples
   - Migration phases

5. **`ADMIN_QUICK_START_ENTITY_TEAM.md`**
   - Step-by-step guide for Admin
   - UI flows and examples
   - Common tasks and troubleshooting
   - Validation rules

6. **`test_entity_team_migration.sql`**
   - Complete test script
   - Creates test data (entities, teams, users, opportunities)
   - Verification queries
   - RLS simulation tests

### ✅ **This Checklist**
7. **`IMPLEMENTATION_CHECKLIST.md`** (this file)

---

## 🎯 Pre-Migration Checklist

### **Phase 0: Preparation**

- [ ] **Backup Production Database**
  ```bash
  # Create full backup
  pg_dump -h <host> -U <user> -d <database> > backup_$(date +%Y%m%d).sql
  ```

- [ ] **Verify Existing Data**
  - [ ] Check entities table exists and has data
  - [ ] Check user_profiles.entity_id is filled for all non-admin users
  - [ ] Check existing divisions/departments structure
  - [ ] Document current user assignments

- [ ] **Create Test Environment**
  - [ ] Clone production database to staging
  - [ ] OR use local Supabase instance for testing

- [ ] **Review Migration Files**
  - [ ] Read `20251105000000_simplify_to_entity_team.sql`
  - [ ] Read `20251105000100_update_rls_entity_team.sql`
  - [ ] Read `20251105000200_update_rpc_entity_team.sql`
  - [ ] Understand what will change

---

## 🧪 Testing Phase (Dev/Staging)

### **Phase 1: Run Migrations in Test Environment**

- [ ] **Apply Schema Migration**
  ```bash
  # If using Supabase CLI
  supabase migration apply 20251105000000_simplify_to_entity_team.sql
  
  # Or manually via SQL editor
  ```
  - [ ] Verify no errors
  - [ ] Check tables structure changed correctly
  - [ ] Check data migrated from departments → divisions

- [ ] **Apply RLS Update**
  ```bash
  supabase migration apply 20251105000100_update_rls_entity_team.sql
  ```
  - [ ] Verify policies created
  - [ ] Check policy comments

- [ ] **Apply RPC Update**
  ```bash
  supabase migration apply 20251105000200_update_rpc_entity_team.sql
  ```
  - [ ] Verify functions updated
  - [ ] Check function signatures

- [ ] **Run Test Script**
  ```bash
  # Run test_entity_team_migration.sql
  psql -h <host> -U <user> -d <database> -f test_entity_team_migration.sql
  ```
  - [ ] Verify test data created
  - [ ] Check verification queries pass
  - [ ] Review test results

### **Phase 2: Manual Testing**

- [ ] **Test as Admin**
  - [ ] Login as admin user
  - [ ] Can see all entities
  - [ ] Can see all teams across entities
  - [ ] Can see all opportunities
  - [ ] Can create entity
  - [ ] Can create team
  - [ ] Can create/edit users

- [ ] **Test as Head**
  - [ ] Create test head user (Entity: Prosnep)
  - [ ] Assign to Team A via divisions.head_id
  - [ ] Login as head
  - [ ] Can see all opportunities in Prosnep entity
  - [ ] Cannot see opportunities in Semut Merah entity
  - [ ] Cannot see Team management (admin only)
  - [ ] Can see team members

- [ ] **Test as Manager**
  - [ ] Create test manager (Entity: Prosnep, Team: TIM A)
  - [ ] Login as manager
  - [ ] Can see opportunities from TIM A sales only
  - [ ] Cannot see opportunities from TIM B
  - [ ] Cannot see opportunities from other entities
  - [ ] Can create opportunities
  - [ ] Can edit team opportunities

- [ ] **Test as Sales**
  - [ ] Create test sales (Entity: Prosnep, Team: TIM A, Manager: Manager A)
  - [ ] Login as sales
  - [ ] Can see only own opportunities
  - [ ] Cannot see other sales opportunities
  - [ ] Can create opportunities
  - [ ] Can edit own opportunities
  - [ ] Cannot edit other's opportunities

- [ ] **Test Cross-Entity Isolation**
  - [ ] Create users in both Prosnep and Semut Merah
  - [ ] Verify Prosnep users cannot see Semut Merah data
  - [ ] Verify Semut Merah users cannot see Prosnep data
  - [ ] Admin can see both

### **Phase 3: Performance Testing**

- [ ] **Check Query Performance**
  ```sql
  -- Test opportunity query with EXPLAIN ANALYZE
  EXPLAIN ANALYZE
  SELECT * FROM opportunities
  WHERE owner_id IN (
    SELECT user_id FROM user_profiles 
    WHERE entity_id = '<test_entity_id>'
  );
  ```
  - [ ] Check index usage
  - [ ] Check execution time acceptable (<100ms for typical queries)

- [ ] **Check RPC Performance**
  ```sql
  EXPLAIN ANALYZE
  SELECT * FROM get_entity_scoped_opportunities();
  ```
  - [ ] Verify no sequential scans on large tables
  - [ ] Check join efficiency

- [ ] **Load Testing (Optional)**
  - [ ] Create 1000+ test opportunities
  - [ ] Create 100+ test users
  - [ ] Test dashboard load time
  - [ ] Test filter operations

---

## 🚀 Production Migration

### **Phase 4: Production Deployment**

**⚠️ Schedule maintenance window if possible**

- [ ] **Pre-Deployment**
  - [ ] Notify all users of upcoming changes
  - [ ] Schedule low-traffic time window
  - [ ] Backup production database (again)
  - [ ] Prepare rollback plan

- [ ] **Deployment Steps**
  
  1. [ ] **Enable Maintenance Mode** (optional)
     - Set frontend to maintenance page
     - Or allow read-only access
  
  2. [ ] **Apply Migrations**
     ```bash
     # Connect to production
     # Apply in order:
     1. 20251105000000_simplify_to_entity_team.sql
     2. 20251105000100_update_rls_entity_team.sql
     3. 20251105000200_update_rpc_entity_team.sql
     ```
  
  3. [ ] **Verify Migration Success**
     - [ ] Check for errors in migration logs
     - [ ] Verify table structure
     - [ ] Verify policies exist
     - [ ] Verify RPC functions updated
  
  4. [ ] **Quick Smoke Test**
     - [ ] Login as admin → can see data
     - [ ] Login as head → scoped to entity
     - [ ] Login as manager → scoped to team
     - [ ] Login as sales → see own data
     - [ ] Create test opportunity → success
     - [ ] Delete test opportunity → success
  
  5. [ ] **Disable Maintenance Mode**
     - Re-enable normal access

- [ ] **Post-Deployment Monitoring**
  - [ ] Monitor error logs (first 1 hour)
  - [ ] Monitor performance metrics
  - [ ] Watch for user-reported issues
  - [ ] Check database connection pool
  - [ ] Verify no RLS policy violations

### **Phase 5: User Communication & Training**

- [ ] **Announce Changes**
  - [ ] Email to all users about new structure
  - [ ] Highlight what changed (Division → Team)
  - [ ] Link to admin guide

- [ ] **Admin Training**
  - [ ] Walk through Entity Management
  - [ ] Walk through Team Management
  - [ ] Practice user assignment flow
  - [ ] Review common tasks from guide

- [ ] **User Onboarding**
  - [ ] Update user documentation
  - [ ] Update screenshots if needed
  - [ ] Address terminology changes (Division → Team)

---

## 🔧 Frontend Updates (Separate Task)

**Note:** These can be done in parallel or after migration

- [ ] **Update Components**
  - [ ] Rename `DivisionDepartmentManagement.tsx` → `TeamManagement.tsx`
  - [ ] Update labels: "Division" → "Team"
  - [ ] Remove "Department" references
  - [ ] Update user assignment forms
  - [ ] Update filters (entity + team dropdowns)

- [ ] **Update Hooks**
  - [ ] Review `useEntityScopedData.ts` (should work with new RPC)
  - [ ] Remove department-related hooks
  - [ ] Update team selection hooks

- [ ] **Update Constants**
  - [ ] Update terminology in `lib/constants.ts`
  - [ ] Update any hardcoded labels

- [ ] **Update Types**
  - [ ] Regenerate types: `supabase gen types typescript`
  - [ ] Update local type definitions if needed

---

## ✅ Post-Migration Validation

### **Data Integrity Checks**

- [ ] **Check User Assignments**
  ```sql
  -- All non-admin users should have entity_id
  SELECT COUNT(*) FROM user_profiles 
  WHERE role != 'admin' AND entity_id IS NULL;
  -- Should return 0
  
  -- All managers should have team (division_id)
  SELECT COUNT(*) FROM user_profiles 
  WHERE role = 'manager' AND division_id IS NULL;
  -- Should return 0
  
  -- All sales should have manager
  SELECT COUNT(*) FROM user_profiles 
  WHERE role IN ('sales', 'account_manager') AND manager_id IS NULL;
  -- Should return 0 or low number
  ```

- [ ] **Check Team Assignments**
  ```sql
  -- All teams should have entity
  SELECT COUNT(*) FROM divisions WHERE entity_id IS NULL;
  -- Should return 0
  
  -- Check orphaned head assignments
  SELECT d.name, d.head_id, up.full_name
  FROM divisions d
  LEFT JOIN user_profiles up ON up.id = d.head_id
  WHERE d.head_id IS NOT NULL AND up.id IS NULL;
  -- Should return 0 rows
  ```

- [ ] **Check Opportunity Access**
  ```sql
  -- Check all opportunities have owners with entity
  SELECT COUNT(*) 
  FROM opportunities o
  LEFT JOIN user_profiles up ON up.user_id = o.owner_id
  WHERE up.entity_id IS NULL;
  -- Should return 0
  ```

### **Functional Validation**

- [ ] **CRUD Operations**
  - [ ] Create opportunity (all roles)
  - [ ] Read opportunities (verify scoping)
  - [ ] Update opportunities (verify permissions)
  - [ ] Delete opportunities (verify permissions)

- [ ] **Hierarchy Validation**
  - [ ] Manager can see their sales' opportunities
  - [ ] Manager cannot see other manager's sales
  - [ ] Head can see all entity opportunities
  - [ ] Sales cannot see other sales' data

- [ ] **Admin Functions**
  - [ ] Create entity
  - [ ] Create team
  - [ ] Assign head to team
  - [ ] Create users with proper assignments
  - [ ] Deactivate users

---

## 🐛 Troubleshooting

### **Common Issues**

**Issue 1: User cannot see any data**
```sql
-- Check user profile and assignments
SELECT 
  up.full_name,
  up.role,
  up.entity_id,
  e.name as entity_name,
  up.division_id,
  d.name as team_name,
  up.manager_id
FROM user_profiles up
LEFT JOIN entities e ON e.id = up.entity_id
LEFT JOIN divisions d ON d.id = up.division_id
WHERE up.email = '<user_email>';
```
- **Fix:** Verify entity_id, division_id, manager_id set correctly

**Issue 2: RLS policy violation**
```
Error: new row violates row-level security policy
```
- **Fix:** Check user has proper role and assignments
- Verify entity/team exists
- Check RLS policies with EXPLAIN

**Issue 3: Manager cannot see sales data**
```sql
-- Check manager_team_members mapping
SELECT 
  m.full_name as manager,
  s.full_name as sales
FROM manager_team_members mtm
JOIN user_profiles m ON m.id = mtm.manager_id
JOIN user_profiles s ON s.id = mtm.account_manager_id
WHERE m.email = '<manager_email>';
```
- **Fix:** Add mapping to manager_team_members
- Verify sales.division_id = manager.division_id

**Issue 4: Performance slow**
- Check indexes exist (run script from migration)
- Analyze query plans with EXPLAIN
- Consider materialized views for complex aggregations

---

## 📊 Success Criteria

### **Migration is successful if:**

- [x] ✅ All migrations applied without errors
- [ ] ✅ All existing data preserved and accessible
- [ ] ✅ Admin can see all data
- [ ] ✅ Head sees only entity data
- [ ] ✅ Manager sees only team data
- [ ] ✅ Sales sees only own data
- [ ] ✅ Cross-entity isolation working
- [ ] ✅ No RLS violations in logs
- [ ] ✅ Performance acceptable (<100ms queries)
- [ ] ✅ All CRUD operations work
- [ ] ✅ Users can login and access system
- [ ] ✅ No critical bugs reported

---

## 🔄 Rollback Plan

**If critical issues occur:**

### **Option A: Restore from Backup**
```bash
# Stop application
# Restore backup
pg_restore -h <host> -U <user> -d <database> backup_YYYYMMDD.sql
# Restart application
```

### **Option B: Reverse Migrations** (if backup not available)
1. Create reverse migration script:
   - Re-create departments table
   - Add back department_id to user_profiles
   - Restore old RLS policies
   - Restore old RPC functions

2. Migrate data back to old structure

**Note:** Prepare reverse migration BEFORE production deployment

---

## 📞 Support & Contact

**During Migration:**
- Monitor: Database logs, application logs, user reports
- Have database admin available for emergency fixes
- Document any issues encountered

**Post-Migration:**
- Collect user feedback
- Monitor performance for 1 week
- Address issues promptly
- Update documentation based on learnings

---

## 🎉 Completion

**When all items checked:**

- [ ] Migration successful in production ✅
- [ ] All users can access their data ✅
- [ ] No critical bugs ✅
- [ ] Performance acceptable ✅
- [ ] Documentation updated ✅
- [ ] Users trained ✅

**Congratulations! Entity + Team migration complete!** 🎊

---

**Next Steps After Migration:**
1. Monitor for 1 week
2. Collect feedback
3. Optimize based on usage patterns
4. Consider future enhancements (team_heads for multi-team heads, etc.)
5. Update related documentation

---

**Document Version:** 1.0  
**Last Updated:** 5 November 2025  
**Status:** Ready for Review & Testing

