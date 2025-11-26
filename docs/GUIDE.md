# EPC17 User Guide

This document consolidates user guides, quick start information, and permission documentation for the EPC17 application.

---

## Table of Contents
1. [Analytics Quick Start](#analytics-quick-start)
2. [Analytics Troubleshooting](#analytics-troubleshooting)
3. [User Permission Matrix](#user-permission-matrix)

---

## Analytics Quick Start

### For Users

#### Accessing Analytics

1. **Main Analytics Dashboard**
   - Click **Analytics** in the sidebar navigation
   - View overall statistics, top performers, and events distribution

2. **Driver Profiles**
   - Click **Driver Profiles** in the sidebar navigation
   - Select a driver from the dropdown
   - View comprehensive driver statistics and performance

#### Using the Analytics Dashboard

**Overall Tab**
- View system-wide statistics (revenue, drivers, entries, races)
- See top 10 performers with win rates
- Check events distribution by status

**Events Tab**
1. Select an event from the dropdown
2. View event-specific stats (participants, revenue, races)
3. See class breakdown table
4. Analyze lane performance chart

**Series Tab**
1. Select a series from the dropdown
2. View aggregate stats across all events
3. See list of events in the series

**Lanes Tab**
- View overall lane statistics
- Compare lane win rates
- See lane usage distribution

#### Using Driver Profiles

1. **Select a Driver**: Choose from the dropdown in the hero section
2. **Filter by Event** (Optional): Select a specific event or keep "All Events"
3. **View Tabs**:
   - **Overview**: Lane performance and position distribution
   - **Performance**: Performance by event with win rate comparison
   - **Classes**: Performance by class with detailed breakdown
   - **History**: Recent 20 races with details
4. **Export**: Click PDF or PNG button to export the profile

### For Developers

#### Using the Analytics Engine

```javascript
// 1. Create an instance
const analytics = new AnalyticsEngine();

// 2. Fetch data
const overallStats = await analytics.getOverallStats();
const eventStats = await analytics.getEventStats('event-123');
const driverStats = await analytics.getDriverStats('driver-456');

// 3. Clear cache when needed
analytics.clearCache(); // Clear all
analytics.clearCache('event_123'); // Clear specific
```

#### Creating Charts

```javascript
// Bar Chart
ChartHelpers.createBarChart(
  'myChartCanvas',           // Canvas ID
  ['Lane 1', 'Lane 2'],      // Labels
  [45.5, 38.2],             // Data
  {
    label: 'Win Rate (%)',   // Legend label
    color: ChartHelpers.Colors.orangeWarm // Custom color
  }
);

// Pie Chart
ChartHelpers.createPieChart(
  'pieChart',
  ['1st', '2nd', '3rd'],
  [50, 30, 20],
  { cutout: '50%' } // Make it a donut chart
);

// Line Chart
ChartHelpers.createLineChart(
  'lineChart',
  ['Jan', 'Feb', 'Mar'],
  [10, 25, 40],
  { fill: true } // Fill area under line
);
```

#### API Endpoints

```javascript
// Available endpoints:
// GET /api/stats/overall
// GET /api/stats/event/<event_id>
// GET /api/stats/driver/<driver_id>?eventId=<optional>
// GET /api/stats/lane/<event_id>
// GET /api/stats/class/<event_id>/<class_name>
// GET /api/stats/time/<event_id>
// GET /api/stats/series/<series_id>
// GET /api/stats/top-performers?limit=10&eventId=<optional>
```

#### Common Use Cases

**Show Top Performers**:
```javascript
const analytics = new AnalyticsEngine();
const topDrivers = await analytics.getTopPerformers(5);

topDrivers.topPerformers.forEach(driver => {
  console.log(`${driver.driverName}: ${driver.winRate}% win rate`);
});
```

**Display Event Summary**:
```javascript
const eventId = 'event-123';
const stats = await analytics.getEventStats(eventId);

console.log(`Event: ${stats.eventName}`);
console.log(`Participants: ${stats.totalParticipants}`);
console.log(`Revenue: $${stats.totalRevenue}`);
```

---

## Analytics Troubleshooting

### Common Issue: ERR_BLOCKED_BY_CLIENT

#### Symptom
When loading analytics data, you see errors like:
```
GET http://localhost:5000/api/analytics/... net::ERR_BLOCKED_BY_CLIENT
```

#### Cause
Browser extensions (ad blockers, privacy tools) block requests containing "analytics" in the URL.

#### Solutions

**Solution 1: Disable Browser Extensions (Recommended)**
1. Chrome/Edge: Click Extensions icon → Disable ad blockers
2. Firefox: Menu → Add-ons → Disable tracking protection for this site
3. Refresh the page (F5)

**Solution 2: Use Incognito/Private Mode**
- Chrome/Edge: Ctrl+Shift+N
- Firefox: Ctrl+Shift+P
- Safari: Cmd+Shift+N

**Solution 3: Whitelist the Server**
- uBlock Origin: Click icon → Disable for this site
- AdBlock Plus: Toggle "Enabled on this site" to OFF

### Other Common Issues

**Issue: "No data available"**
- **Cause**: Database empty or no races completed
- **Solution**: 
  1. Verify events exist
  2. Check participants are registered
  3. Ensure races have been completed
  4. Click "Refresh" button

**Issue: Charts not rendering**
- **Cause**: Chart.js library not loaded
- **Solution**:
  1. Check browser console for errors
  2. Verify Chart.js loaded: `console.log(typeof Chart)`
  3. Clear browser cache (Ctrl+Shift+Delete)
  4. Hard refresh (Ctrl+F5)

**Issue: Export to PDF/PNG fails**
- **Cause**: Export libraries not loaded
- **Solution**:
  1. Check internet connection (libraries load from CDN)
  2. Verify libraries: `console.log(typeof html2canvas)`
  3. Try refreshing the page

**Issue: Slow performance with large datasets**
- **Cause**: Many drivers (500+) or events (100+)
- **Solution**:
  1. Wait for cache to warm up
  2. Use event/series filters
  3. Clear cache if data seems stale

**Issue: Data not updating after race completion**
- **Cause**: Cache hasn't expired (2-minute TTL)
- **Solution**: Click "Refresh" button or clear cache manually

### Browser-Specific Issues

**Chrome/Edge**
- Issue: Request blocked even without extensions
- Solution: Check Privacy settings → Change to "Standard protection"

**Firefox**
- Issue: Enhanced Tracking Protection blocks requests
- Solution: Click shield icon → Toggle tracking protection OFF

**Safari**
- Issue: Cross-site tracking prevention
- Solution: Preferences → Privacy → Uncheck "Prevent cross-site tracking"

### Network Issues

**Cannot connect to server**
- Verify server is running: `python server.py`
- Check URL matches server address
- Verify firewall settings
- Check server logs for errors

**404 Not Found**
- Verify server version (D0L11R1.41+)
- Restart server
- Check server.py includes analytics endpoints

**500 Internal Server Error**
- Check server terminal for Python errors
- Verify database exists: `data/epc17.db`
- Check database integrity: `sqlite3 data/epc17.db "PRAGMA integrity_check;"`

---

## User Permission Matrix

### Permission Categories

#### Feature Permissions (8)
These control access to application features and pages.

| Permission | Page Access | Description |
|------------|-------------|-------------|
| `series` | `/series.html` | Create and manage race series |
| `events` | `/events.html` | Create and manage events |
| `registration` | `/registration.html` | Register participants for events |
| `races` | `/races.html` | Manage race brackets and results |
| `drivers profile` | `/driver-profile.html` | View driver profiles and stats |
| `analytics` | `/analytics.html` | View analytics and statistics |
| `live display` | `/live-display.html` | Live race display screen |
| `animator` | `/animator.html` | Animator/Commentator tools |

#### Administrative Permission (1)

| Permission | Page Access | Description |
|------------|-------------|-------------|
| `admin_power` | `/users.html` | User management and system settings |

### User Types

#### 1. Hardcoded Admin
- **Username**: `Admin`
- **Password**: `Admin321`
- **Permissions**: ALL (automatic)
- **Can Be Deleted**: No
- **Special Privileges**: Bypasses all permission checks

#### 2. Feature User
- **Permissions**: One or more feature permissions
- **Cannot Access**: User management
- **Use Case**: Event coordinators, registration staff, analysts

#### 3. Admin User
- **Permissions**: `admin_power` only
- **Cannot Access**: Feature pages (unless also granted)
- **Use Case**: User management without operational access

#### 4. Full Access User
- **Permissions**: All feature permissions + `admin_power`
- **Can Access**: Everything
- **Use Case**: Managers, supervisors

### Common Permission Setups

#### Event Coordinator
```json
{
  "permissions": ["events", "registration"],
  "allowedEvents": ["event-id-1", "event-id-2"]
}
```
**Access**: Can manage events and register participants, only for assigned events.

#### Race Director
```json
{
  "permissions": ["events", "races", "live display"],
  "allowedEvents": []
}
```
**Access**: Can manage events, run races, control live display for all events.

#### Data Analyst
```json
{
  "permissions": ["analytics", "drivers profile"],
  "allowedEvents": []
}
```
**Access**: Read-only access to analytics and driver data across all events.

#### System Administrator
```json
{
  "permissions": ["admin_power"],
  "allowedEvents": []
}
```
**Access**: Can manage users and settings, but no operational access.

### Event Scoping Behavior

#### All Events Access
```json
"allowedEvents": []
```
- User sees and can interact with ALL events
- No filtering applied
- Most common for administrators

#### Specific Events Access
```json
"allowedEvents": ["winter-2024", "summer-2024"]
```
- User only sees assigned events in dropdowns
- API calls filtered by event ID
- Prevents accidental cross-event operations

### UI Behavior by Permission

Navigation links appear/disappear based on permissions:

| Link | Required Permission | Notes |
|------|---------------------|-------|
| Series | `series` | Create/edit series |
| Events | `events` | Create/edit events |
| Registration | `registration` | Register participants |
| Races | `races` | Manage brackets |
| Driver Profile | `drivers profile` | View profiles |
| Analytics | `analytics` | View statistics |
| Live Display | `live display` | Display screen |
| Animator | `animator` | Commentator tools |
| Users | `admin_power` or Admin | User management |

### "All Permissions" Checkbox

- Located at top of permissions section in user form
- Checking it: Selects all 8 feature permissions
- Unchecking it: Deselects all 8 feature permissions
- Does NOT affect `admin_power` checkbox

### Security Notes

**Client-Side Protection (UX)**:
- Navigation links hidden for unauthorized pages
- Page redirects before content loads
- **NOT secure** - can be bypassed

**Server-Side Protection (Security)**:
- Every route checks permissions
- Every API endpoint validates permissions
- Session-based authentication
- **Secure** - cannot be bypassed

### Troubleshooting Permission Issues

**User Cannot See Page Link**:
- Check user's permissions in database
- Re-login to refresh session
- Verify permission name matches exactly

**User Can See Link But Gets "Access Denied"**:
- Clear browser cache
- Logout and login again
- Check server logs for actual permission

**User Has Permission But Cannot Access**:
- Check `allowedEvents` array
- Verify session in browser DevTools
- Check server permission requirements

### Best Practices

**For System Administrators**:
1. **Least Privilege**: Grant minimum permissions needed
2. **Event Scoping**: Use for multi-event organizations
3. **Regular Audits**: Review user list periodically
4. **Document**: Keep notes on user permissions

**For Application Users**:
1. **Secure Passwords**: Use strong passwords
2. **Report Issues**: Contact admin if permissions seem wrong
3. **Logout**: Logout when done on shared computers
4. **Don't Share**: Keep credentials private

---

**Last Updated**: 2025-10-18  
**Current Version**: D0L11R1.41

