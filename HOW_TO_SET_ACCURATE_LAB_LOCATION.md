# How to Accurately Show Lab Location on Map

## Overview

The landing page map now fetches lab location data from your database. To show the accurate location, you need to:

1. **Add latitude/longitude coordinates** to your lab record
2. **Run the migration** to add coordinate columns
3. **Update your lab data** with accurate coordinates

## Step 1: Run the Migration

The migration adds `latitude` and `longitude` columns to the `labs` table:

```bash
# The migration file is already created:
# supabase/migrations/20250101000000_add_lab_coordinates.sql

# Apply it via Supabase Dashboard:
# 1. Go to Database → Migrations
# 2. Click "New Migration"
# 3. Copy the SQL from the migration file
# 4. Run it

# OR via CLI:
supabase db push
```

## Step 2: Get Accurate Coordinates and Map URL

### Method 1: Get Embed URL Directly from Google Maps (RECOMMENDED - Most Accurate)

This is the **best and most accurate** method:

1. Open [Google Maps](https://www.google.com/maps)
2. Search for your exact lab address: **"Old Post Office Building, Budgam, Jammu and Kashmir"**
3. **Pinpoint the exact location** by dragging the map marker to your building
4. Click the **"Share"** button (left sidebar)
5. Select **"Embed a map"** tab
6. Choose map size: **Medium** (400px height)
7. **Copy the entire iframe src URL** (it will look like: `https://www.google.com/maps/embed?pb=!1m18!1m12!...`)
8. Use this URL directly in the code (see Method 3 below)

**OR** get coordinates:

1. Right-click on the exact location marker
2. Click on the coordinates that appear (e.g., `34.0151, 74.7719`)
3. Copy the coordinates - format: `latitude, longitude`

### Method 2: Using Google Maps on Mobile

1. Open Google Maps app
2. Navigate to your lab location
3. Long-press on the exact location
4. The coordinates will appear in the search bar
5. Copy them

### Method 2: Using Google Maps on Mobile

1. Open Google Maps app
2. Navigate to your lab location
3. Long-press on the exact location
4. The coordinates will appear in the search bar
5. Copy them

### Method 3: Using GPS Coordinates from Your Phone

If you're at the lab location:
1. Open Google Maps on your phone
2. Tap the blue dot (your location)
3. The coordinates will be shown at the bottom
4. Copy them

## Step 3: Update Lab Data in Database

### Option 1: Use Coordinates (Automatic URL Generation)

The code will automatically generate the map URL from coordinates.

### Option A: Via Supabase Dashboard

1. Go to **Database** → **Tables** → **labs**
2. Find your main lab (type = 'main')
3. Click **Edit** on the row
4. Enter:
   - **latitude**: `34.0151` (example - use your actual latitude)
   - **longitude**: `74.7719` (example - use your actual longitude)
5. Click **Save**

### Option B: Via SQL Editor

```sql
-- Update your main lab with accurate coordinates
UPDATE public.labs
SET 
  latitude = 34.0151,  -- Replace with your actual latitude
  longitude = 74.7719  -- Replace with your actual longitude
WHERE type = 'main' AND is_active = true
LIMIT 1;
```

### Option C: Use Direct Embed URL (Most Accurate - Recommended)

If you got the embed URL directly from Google Maps (Method 1 above), you can:

1. Open `src/components/ContactSection.tsx`
2. Find the `getMapUrl()` function
3. Replace the default return URL with your embed URL:

```typescript
// Replace this line in getMapUrl():
return "https://www.google.com/maps/embed?pb=!1m18!1m12!..."; // Your embed URL from Google Maps
```

This method is **most accurate** because Google Maps generates the exact embed URL for your location.

### Option D: Via Admin Panel (if ManageLabs supports it)

1. Go to **Admin Dashboard** → **Labs**
2. Edit your main lab
3. Add latitude and longitude fields
4. Save

## Step 4: Verify the Map

1. Refresh your landing page
2. Scroll to the Contact section
3. The map should now show the exact location
4. If coordinates are set, it will use them (most accurate)
5. If not, it will fall back to address-based search

## Coordinate Format

- **Latitude**: Decimal degrees (e.g., `34.0151`)
  - Range: -90 to 90
  - Positive = North, Negative = South
  - For Budgam, J&K: approximately `34.0151`

- **Longitude**: Decimal degrees (e.g., `74.7719`)
  - Range: -180 to 180
  - Positive = East, Negative = West
  - For Budgam, J&K: approximately `74.7719`

## Example Coordinates for Common Locations

- **Budgam, J&K (approximate)**: `34.0151, 74.7719`
- **Srinagar, J&K**: `34.0837, 74.7973`
- **Jammu, J&K**: `32.7266, 74.8570`

**Note**: These are approximate. Always get the exact coordinates for your specific building.

## Troubleshooting

### Map shows wrong location
- Verify coordinates are correct (check on Google Maps)
- Make sure you're updating the **main lab** (type = 'main')
- Clear browser cache and refresh

### Map doesn't load
- Check if coordinates are in correct format (decimal, not degrees/minutes/seconds)
- Verify the lab record exists and is active
- Check browser console for errors

### Want to use address instead of coordinates?
- Leave latitude/longitude as NULL
- The system will automatically use address-based search
- Make sure address, city, state fields are filled in the lab record

## Best Practices

1. **Use coordinates for accuracy**: Coordinates are more accurate than address search
2. **Update all labs**: If you have multiple labs, update coordinates for each
3. **Test the location**: After updating, verify on the map that it's correct
4. **Keep address updated**: Even with coordinates, keep address fields updated for fallback

## Need Help?

If you need help finding coordinates:
1. Share your exact lab address
2. I can help you find the coordinates
3. Or use the Google Maps method above - it's the easiest!

