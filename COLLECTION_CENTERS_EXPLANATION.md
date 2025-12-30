# Collection Centers - Current Status & Integration Guide

## Current Status

**Collection Centers are currently NOT linked to any functional workflow.**

### What Exists:
1. ✅ `collection_centers` table in database (if migration is run)
2. ✅ `ManageCollectionCenters` component for CRUD operations
3. ✅ `collection_center_id` columns added to:
   - `patients` table
   - `patient_tests` table

### What's Missing:
1. ❌ Collection center selection when registering patients
2. ❌ Collection center selection when creating tests
3. ❌ Collection center filtering/reporting
4. ❌ Collection center assignment in patient/test forms
5. ❌ Reports showing which collection center samples came from

## What Collection Centers Should Do

Collection centers are meant to track **where samples were collected** from. This is useful for:

1. **Sample Tracking**: Know which location collected each sample
2. **Reporting**: Generate reports by collection center
3. **Performance Analysis**: See which centers are busiest
4. **Patient Assignment**: Link patients to their preferred collection center
5. **Billing**: Track revenue by collection center

## Integration Points Needed

### 1. Patient Registration (`ManagePatients.tsx`)
- Add collection center dropdown when creating/editing patients
- Store `collection_center_id` in patients table
- Show collection center in patient details

### 2. Test Creation (`ManageTests.tsx`)
- Add collection center dropdown when creating tests
- Store `collection_center_id` in patient_tests table
- Show collection center in test details

### 3. Reports & Analytics
- Filter tests by collection center
- Revenue by collection center
- Sample volume by collection center
- Collection center performance metrics

### 4. Patient Portal
- Show collection center where patient registered
- Show collection center where tests were collected

## Quick Integration Example

To integrate collection centers into test creation:

```typescript
// In ManageTests.tsx, add to formData:
const [formData, setFormData] = useState({
  // ... existing fields
  collection_center_id: "",
});

// In handleSubmit, add to testsToInsert:
const testsToInsert = selectedTests.map((testName) => ({
  // ... existing fields
  collection_center_id: formData.collection_center_id || null,
}));

// In the form, add collection center selector:
<Select
  value={formData.collection_center_id}
  onValueChange={(value) => setFormData({ ...formData, collection_center_id: value })}
>
  <SelectTrigger>
    <SelectValue placeholder="Select collection center (optional)" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">None</SelectItem>
    {collectionCenters.map((center) => (
      <SelectItem key={center.id} value={center.id}>
        {center.name} ({center.code})
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

## Next Steps

1. **Decide if collection centers are needed**: If you're a single lab, you might not need this feature
2. **If needed, integrate step by step**:
   - Start with test creation (most important)
   - Then patient registration
   - Then reporting/filtering
3. **Run the migration first**: Make sure the `collection_centers` table exists

