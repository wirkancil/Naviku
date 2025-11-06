# Admin Quick Start: Entity + Team Management

**Panduan Praktis untuk Admin** mengelola Entity (Perusahaan) dan Team (TIM) dalam struktur baru.

---

## 📋 Struktur Baru

```
Entity (Perusahaan)
  └── Team (TIM)
       ├── Head (Kepala Tim)
       ├── Manager (Sales Manager)
       └── Sales (Account Manager / Sales Rep)
```

**Contoh:**
```
Prosnep
  ├── TIM A
  │    ├── Head A
  │    ├── Manager A → Sales Alpha, Sales Beta
  │    └── Manager B → Sales Gamma, Sales Delta
  └── TIM B
       ├── Head B
       └── Manager C → Sales Epsilon, Sales Zeta

Semut Merah
  └── TIM A
       ├── Head A
       └── Manager A → Sales Alpha, Sales Beta
```

---

## 🎯 Role & Akses Data

| Role     | Akses Data                                                   |
|----------|--------------------------------------------------------------|
| **Admin**    | Semua data di semua entity dan semua tim                 |
| **Head**     | Semua data di entity mereka (semua tim dalam entity)     |
| **Manager**  | Data sales dalam tim mereka saja                          |
| **Sales**    | Hanya data milik mereka sendiri                           |

---

## 🚀 Step-by-Step Setup

### **Step 1: Create Entity (Perusahaan)**

1. Login sebagai **Admin**
2. Buka menu **Settings** → **Entity Management**
3. Klik **+ New Entity**
4. Isi form:
   - **Entity Name**: `Prosnep` atau `Semut Merah`
   - **Entity Code**: `PROS` atau `SM` (untuk slug/prefix)
5. Klik **Create**

**Database:**
```sql
INSERT INTO public.entities (name, code, is_active)
VALUES ('Prosnep', 'PROS', true);
```

---

### **Step 2: Create Team (TIM)**

1. Buka menu **Settings** → **Team Management** (dulu Division Management)
2. Klik **+ New Team**
3. Isi form:
   - **Entity**: Pilih entity (Prosnep/Semut Merah)
   - **Team Name**: `TIM A`, `TIM B`, dll
   - **Team Code**: `PROS_A`, `SM_B`, dll
   - **Assign Head**: (opsional, bisa assign nanti)
4. Klik **Create**

**Database:**
```sql
INSERT INTO public.divisions (name, code, entity_id, head_id, is_active)
VALUES (
  'TIM A', 
  'PROS_A', 
  '<entity_id>',  -- Prosnep ID
  NULL,           -- Assign head later or now
  true
);
```

---

### **Step 3: Create Head User**

1. Buka menu **Settings** → **User Management**
2. Klik **+ New User**
3. **Step 1: Basic Info**
   - **Full Name**: `John Doe`
   - **Email**: `john.doe@prosnep.com`
   - **Password**: (auto-generate or manual)
4. **Step 2: Role Selection**
   - Pilih: **Head (Team Leader)**
5. **Step 3: Assignment**
   - **Entity**: Pilih `Prosnep`
   - **Assign to Team**: Pilih `TIM A` (hanya team tanpa head yang muncul)
6. Klik **Create**

**Database:**
```sql
-- Create user profile
INSERT INTO public.user_profiles (
  full_name, email, role, 
  entity_id, division_id, manager_id
)
VALUES (
  'John Doe', 
  'john.doe@prosnep.com', 
  'head',
  '<entity_prosnep_id>',
  NULL,  -- Head tidak assigned ke team via division_id
  NULL
);

-- Assign head to team
UPDATE public.divisions 
SET head_id = '<john_profile_id>' 
WHERE id = '<team_a_id>';
```

**Hasil:**
- ✅ TIM A sekarang punya Head = John Doe
- ✅ John bisa lihat semua data di entity Prosnep

---

### **Step 4: Create Manager User**

1. **User Management** → **+ New User**
2. **Basic Info**:
   - Name: `Manager A`
   - Email: `manager.a@prosnep.com`
3. **Role**: **Manager (Sales Manager)**
4. **Assignment**:
   - **Entity**: `Prosnep`
   - **Team**: `TIM A` (team dalam entity Prosnep)
5. **Create**

**Database:**
```sql
INSERT INTO public.user_profiles (
  full_name, email, role,
  entity_id, division_id, manager_id
)
VALUES (
  'Manager A',
  'manager.a@prosnep.com',
  'manager',
  '<entity_prosnep_id>',
  '<team_a_id>',  -- Manager assigned ke TIM A
  NULL            -- Atau bisa point ke head_id jika ada hierarchy
);
```

**Hasil:**
- ✅ Manager A sekarang member of TIM A
- ✅ Manager A bisa lihat data sales dalam TIM A

---

### **Step 5: Create Sales User**

1. **User Management** → **+ New User**
2. **Basic Info**:
   - Name: `Sales Alpha`
   - Email: `sales.alpha@prosnep.com`
3. **Role**: **Sales (Account Manager)**
4. **Assignment**:
   - **Entity**: `Prosnep`
   - **Team**: `TIM A`
   - **Manager**: `Manager A` (dropdown hanya show manager dalam TIM A)
5. **Create**

**Database:**
```sql
-- Create sales profile
INSERT INTO public.user_profiles (
  full_name, email, role,
  entity_id, division_id, manager_id
)
VALUES (
  'Sales Alpha',
  'sales.alpha@prosnep.com',
  'account_manager',  -- or 'sales'
  '<entity_prosnep_id>',
  '<team_a_id>',
  '<manager_a_profile_id>'  -- FK to manager
);

-- Add to manager_team_members mapping
INSERT INTO public.manager_team_members (manager_id, account_manager_id)
VALUES (
  '<manager_a_profile_id>',
  '<sales_alpha_profile_id>'
);
```

**Hasil:**
- ✅ Sales Alpha sekarang member of TIM A
- ✅ Sales Alpha managed by Manager A
- ✅ Sales Alpha hanya bisa lihat data mereka sendiri
- ✅ Manager A bisa lihat data Sales Alpha

---

## 🔄 User Assignment Cascade (Otomatis)

Ketika assign user, sistem otomatis handle:

### **Cascade untuk Head:**
1. User.role = `head`
2. User.entity_id = selected entity
3. User.division_id = NULL (head tidak assigned ke team di user_profiles)
4. **divisions.head_id = user.id** ← Assignment via team table

### **Cascade untuk Manager:**
1. User.role = `manager`
2. User.entity_id = selected entity
3. User.division_id = selected team
4. User.manager_id = NULL atau point ke head (opsional)

### **Cascade untuk Sales:**
1. User.role = `sales` atau `account_manager`
2. User.entity_id = selected entity
3. User.division_id = selected team
4. User.manager_id = selected manager (required)
5. **manager_team_members** record created (explicit mapping)

---

## 🎨 UI Flows (Frontend)

### **Entity Management Page:**
```
┌────────────────────────────────────────────┐
│ Entities Management           [+ New]     │
├────────────────────────────────────────────┤
│                                            │
│ 📦 Prosnep                  [Edit] [Del]  │
│    Code: PROS                              │
│    Teams: 2                                │
│    Users: 15                               │
│                                            │
│ 📦 Semut Merah              [Edit] [Del]  │
│    Code: SM                                │
│    Teams: 1                                │
│    Users: 8                                │
└────────────────────────────────────────────┘
```

### **Team Management Page:**
```
┌────────────────────────────────────────────┐
│ Teams Management              [+ New]     │
├────────────────────────────────────────────┤
│ Filter: [Prosnep ▼]                       │
├────────────────────────────────────────────┤
│                                            │
│ 📦 Prosnep                                 │
│   👥 TIM A                  [Edit] [Del]  │
│      Head: John Doe                        │
│      Managers: 2 | Sales: 5                │
│                                            │
│   👥 TIM B                  [Edit] [Del]  │
│      Head: Jane Smith                      │
│      Managers: 1 | Sales: 3                │
└────────────────────────────────────────────┘
```

### **User Management Page:**
```
┌──────────────────────────────────────────────────────────┐
│ Users Management                            [+ New]     │
├──────────────────────────────────────────────────────────┤
│ Filters:                                                 │
│ Entity: [All ▼] Team: [All ▼] Role: [All ▼]            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ Name         Email            Role    Entity  Team  Mgr  │
│──────────────────────────────────────────────────────────│
│ John Doe     john@...         head    Prosnep -     -    │
│ Manager A    mgr@...          manager Prosnep TIM A -    │
│ Sales Alpha  sales@...        sales   Prosnep TIM A Mgr A│
│                                                          │
│                                      [Edit] [Delete]     │
└──────────────────────────────────────────────────────────┘
```

---

## ✅ Validation Rules (Auto-enforced)

### **Admin:**
```sql
✅ entity_id = NULL
✅ division_id = NULL
✅ manager_id = NULL
```

### **Head:**
```sql
✅ entity_id = REQUIRED
✅ division_id = NULL (assigned via divisions.head_id)
✅ manager_id = NULL
❌ Cannot assign head if entity_id is NULL
```

### **Manager:**
```sql
✅ entity_id = REQUIRED
✅ division_id = REQUIRED (team assignment)
✅ manager_id = NULL or head_id (optional)
❌ Cannot assign manager without entity
❌ Cannot assign manager without team
❌ Team must belong to the same entity
```

### **Sales:**
```sql
✅ entity_id = REQUIRED
✅ division_id = REQUIRED (team assignment)
✅ manager_id = REQUIRED (who manages them)
❌ Cannot assign sales without entity
❌ Cannot assign sales without team
❌ Cannot assign sales without manager
❌ Manager must be in the same team
```

---

## 🔍 Common Tasks

### **Pindahkan Sales ke Manager lain (dalam tim sama):**
```sql
UPDATE public.user_profiles
SET manager_id = '<new_manager_id>'
WHERE id = '<sales_id>';

-- Update mapping
DELETE FROM public.manager_team_members 
WHERE account_manager_id = '<sales_id>';

INSERT INTO public.manager_team_members (manager_id, account_manager_id)
VALUES ('<new_manager_id>', '<sales_id>');
```

### **Pindahkan Sales ke Team lain:**
```sql
UPDATE public.user_profiles
SET 
  division_id = '<new_team_id>',
  manager_id = '<new_manager_in_new_team_id>'
WHERE id = '<sales_id>';

-- Update mapping
DELETE FROM public.manager_team_members 
WHERE account_manager_id = '<sales_id>';

INSERT INTO public.manager_team_members (manager_id, account_manager_id)
VALUES ('<new_manager_id>', '<sales_id>');
```

### **Ganti Head di Team:**
```sql
-- Remove old head assignment
UPDATE public.divisions
SET head_id = NULL
WHERE head_id = '<old_head_id>';

-- Assign new head
UPDATE public.divisions
SET head_id = '<new_head_id>'
WHERE id = '<team_id>';
```

### **Deactivate User (Soft Delete):**
```sql
UPDATE public.user_profiles
SET 
  is_active = false,
  updated_at = NOW()
WHERE id = '<user_id>';

-- Historical data tetap ada, tapi user tidak bisa login
```

---

## 🛡️ Data Isolation Rules

### **Cross-Entity Isolation:**
```
✅ Head di Prosnep TIDAK bisa lihat data Semut Merah
✅ Manager di TIM A TIDAK bisa lihat data TIM B
✅ Sales HANYA lihat data mereka sendiri
```

### **Test Isolation:**
```sql
-- As Head A (Prosnep, TIM A):
-- Should see: All opportunities in Prosnep entity
-- Should NOT see: Opportunities in Semut Merah

-- As Manager A (Prosnep, TIM A):
-- Should see: Opportunities from Sales in TIM A
-- Should NOT see: Opportunities from TIM B

-- As Sales Alpha:
-- Should see: Only opportunities where owner_id = sales_alpha_user_id
```

---

## ⚠️ Common Mistakes

### **❌ Mistake 1: Assign Manager tanpa Team**
```
Error: Manager role must have team (division_id) assigned
Fix: Pilih team saat create/edit manager
```

### **❌ Mistake 2: Assign Sales tanpa Manager**
```
Warning: Sales role should have manager_id assigned
Fix: Pilih manager dalam team yang sama
```

### **❌ Mistake 3: Assign Head ke Team berbeda Entity**
```
Error: Team tidak dalam entity yang dipilih
Fix: Pastikan head.entity_id = team.entity_id
```

### **❌ Mistake 4: Manager dan Sales di Team berbeda**
```
Error: Manager tidak dalam team yang dipilih
Fix: Manager harus dalam team yang sama dengan sales
```

---

## 📊 Monitoring & Reports

### **Entity Summary:**
```sql
SELECT 
  e.name as entity,
  COUNT(DISTINCT d.id) as teams,
  COUNT(DISTINCT up.id) as users,
  COUNT(DISTINCT CASE WHEN up.role = 'head' THEN up.id END) as heads,
  COUNT(DISTINCT CASE WHEN up.role = 'manager' THEN up.id END) as managers,
  COUNT(DISTINCT CASE WHEN up.role IN ('sales', 'account_manager') THEN up.id END) as sales
FROM public.entities e
LEFT JOIN public.divisions d ON d.entity_id = e.id
LEFT JOIN public.user_profiles up ON up.entity_id = e.id
WHERE e.is_active = true
GROUP BY e.id, e.name
ORDER BY e.name;
```

### **Team Summary:**
```sql
SELECT 
  e.name as entity,
  d.name as team,
  h.full_name as head,
  COUNT(DISTINCT CASE WHEN up.role = 'manager' THEN up.id END) as managers,
  COUNT(DISTINCT CASE WHEN up.role IN ('sales', 'account_manager') THEN up.id END) as sales
FROM public.divisions d
JOIN public.entities e ON e.id = d.entity_id
LEFT JOIN public.user_profiles h ON h.id = d.head_id
LEFT JOIN public.user_profiles up ON up.division_id = d.id
WHERE d.is_active = true
GROUP BY e.name, d.name, h.full_name
ORDER BY e.name, d.name;
```

---

## 🎯 Next Steps

1. ✅ Create entities (Prosnep, Semut Merah)
2. ✅ Create teams (TIM A, TIM B per entity)
3. ✅ Create head users and assign to teams
4. ✅ Create manager users in teams
5. ✅ Create sales users under managers
6. ✅ Test data isolation per role
7. ✅ Train users on new structure

---

## 📞 Support

Jika ada pertanyaan atau issues:
1. Check validation errors di form
2. Verify entity → team → user hierarchy
3. Check RLS policies via test queries
4. Review `ENTITY_TEAM_MIGRATION_SUMMARY.md` untuk detail teknis

---

**Selamat mengelola Entity dan Team! 🎉**

