# EPC17 Testing Guide

This document consolidates all testing guides and procedures for the EPC17 application.

---

## Table of Contents
1. [Race Completion Performance Testing](#race-completion-performance-testing)
2. [Ranking System Testing](#ranking-system-testing)
3. [User Management Testing](#user-management-testing)
4. [Stress Testing](#stress-testing)

---

## Race Completion Performance Testing

**Version**: D0L11R1.39  
**Purpose**: Verify performance improvements and data integrity after optimization  
**Estimated Testing Time**: 30-45 minutes

### Pre-Testing Checklist
- ✅ Backup current database (`data/epc17.db`)
- ✅ Clear browser cache
- ✅ Open browser DevTools Console (F12)
- ✅ Open Performance tab in DevTools
- ✅ Have test event with 20+ participants ready

### Test 1: Single Race Completion

**Objective**: Verify basic race completion works with performance improvements

**Steps**:
1. Navigate to `races.html`
2. Select a test event with active races
3. Open browser DevTools Console (F12)
4. Select all drivers in a single race (mark positions)
5. Click "Complete Heat" button
6. Observe the UI response

**Expected Results**:
- ✅ Processing indicator appears immediately
- ✅ UI responds in <200ms (no freeze)
- ✅ Heat status changes to "Completed" immediately
- ✅ Console shows Phase 1 and Phase 2 messages
- ✅ Background tasks complete within 1-2 seconds
- ✅ Toast message shows "Heat completed successfully!"
- ✅ Next race can be started immediately

**Data Integrity Checks**:
- ✅ Heat marked as "Completed" in bracket
- ✅ Winner determined correctly
- ✅ Participant win/loss counts updated
- ✅ Bracket saved to database

### Test 2: Rapid Multiple Completions

**Objective**: Verify system handles multiple rapid completions without issues

**Steps**:
1. Select an event with 5+ incomplete races
2. Open DevTools Performance tab
3. Start Performance recording
4. Complete 5 races as quickly as possible
5. Stop Performance recording

**Expected Results**:
- ✅ Each race completes in <200ms UI response
- ✅ No UI freezing or lag
- ✅ Processing indicators show for each race
- ✅ Background tasks queue properly
- ✅ All 5 races marked "Completed" correctly
- ✅ No error messages in console

### Test 3: Final Race Completion

**Objective**: Verify event completion status updates correctly in background

**Steps**:
1. Select an event with only 1-2 races remaining
2. Complete the second-to-last race
3. Observe class is NOT marked complete yet
4. Complete the final race
5. Wait 2-3 seconds for background processing
6. Check event status

**Expected Results**:
- ✅ Final race completes with <200ms UI response
- ✅ Class marked "Complete" after background processing
- ✅ Winner determined correctly
- ✅ Event status updates if all classes complete

### Test 4: Large Participant Count (100+ Drivers)

**Objective**: Verify performance with large datasets

**Steps**:
1. Select large event (100+ participants)
2. Open DevTools Performance tab and Console
3. Start Performance recording
4. Complete a race
5. Check console for performance metrics

**Expected Results**:
- ✅ UI still responds in <200ms
- ✅ Statistics processing happens in background
- ✅ No main thread blocking
- ✅ Background task coordinator handles load

### Test 5: Slow Network Conditions

**Objective**: Verify behavior with slow network

**Steps**:
1. Open DevTools → Network tab
2. Set throttling to "Slow 3G"
3. Complete a race
4. Observe behavior during slow network save

**Expected Results**:
- ✅ UI responds immediately even with slow network
- ✅ Save may take longer, but UI remains responsive
- ✅ User can scroll, view other races during save
- ✅ Retry logic kicks in if save fails

### Test 6: Browser Compatibility

**Browsers to Test**:
1. Chrome/Edge (latest) - Should use `requestIdleCallback`
2. Firefox (latest) - Should use `requestIdleCallback`
3. Older browsers - Should fall back to `setTimeout`

**Expected Results**:
- ✅ Modern browsers: Uses `requestIdleCallback`
- ✅ Older browsers: Falls back to `setTimeout`
- ✅ All browsers: Performance improvement achieved
- ✅ All browsers: No errors or warnings

### Test 7: Data Integrity Verification

**Objective**: Ensure no data loss or corruption

**Steps**:
1. Complete 10 races across multiple classes
2. Verify heat status, participant stats, bracket structure
3. Refresh the page
4. Verify all data persists correctly

**Expected Results**:
- ✅ All heats marked "Completed" persist
- ✅ Participant win/loss counts accurate
- ✅ No duplicate bracket entries
- ✅ Statistics match manual calculation

---

## Ranking System Testing

**Purpose**: Verify ranking calculations and statistics updates

### Test Scenarios

#### Test 1: Basic Win/Loss Tracking
**Steps**:
1. Create a new participant
2. Record 5 races (3 wins, 2 losses)
3. Check participant statistics

**Expected**:
- Total races: 5
- Total wins: 3
- Total losses: 2
- Win rate: 60%

#### Test 2: Class-Specific Performance
**Steps**:
1. Record races in multiple classes for one participant
2. Check class-specific statistics

**Expected**:
- Separate win rates per class
- Correct race counts per class
- Proper position tracking per class

#### Test 3: Lane Performance
**Steps**:
1. Record races with different lane assignments
2. Check lane-specific statistics

**Expected**:
- Win rates calculated per lane
- Position distribution per lane
- Average positions per lane

#### Test 4: Win Streak Tracking
**Steps**:
1. Record 5 consecutive wins
2. Record 1 loss
3. Record 3 more wins

**Expected**:
- Best streak: 5
- Current streak: 3
- Streak resets after loss

#### Test 5: Recent Form Analysis
**Steps**:
1. Record 15 races
2. Check recent positions array

**Expected**:
- Only last 10 races tracked
- Recent win rate calculated correctly
- Older races not affecting recent form

---

## User Management Testing

**Purpose**: Verify authentication and authorization system

### Test 1: Admin Login
**Steps**:
1. Login with username "Admin" and password "Admin321"
2. Verify all navigation links visible

**Expected**:
- ✅ Login successful
- ✅ All pages accessible
- ✅ User management accessible

### Test 2: Feature User Permissions
**Steps**:
1. Create user with "events" and "registration" permissions
2. Login as that user
3. Check navigation links

**Expected**:
- ✅ Only Events and Registration links visible
- ✅ Other pages redirect to Access Denied
- ✅ API calls to unauthorized endpoints return 403

### Test 3: Event Scoping
**Steps**:
1. Create user with specific event access
2. Login as that user
3. Check event selectors

**Expected**:
- ✅ Only assigned events appear in dropdowns
- ✅ Cannot access other events via API
- ✅ Analytics filtered to assigned events only

### Test 4: Permission Changes
**Steps**:
1. User logged in with "events" permission
2. Admin removes "events" permission
3. User refreshes page or navigates

**Expected**:
- ✅ Events link disappears
- ✅ Events page redirects to Access Denied
- ✅ Session updated with new permissions

### Test 5: Admin Protection
**Steps**:
1. Try to delete Admin user
2. Try to remove permissions from Admin user

**Expected**:
- ✅ Delete blocked with error message
- ✅ Permission changes blocked
- ✅ Admin retains all permissions

---

## Stress Testing

**Purpose**: Verify system performance under high load

### Stress Test Data Generator

The `stress_test_generator.py` script creates comprehensive test data:
- 152 events (52 upcoming, 100 completed)
- 200 participants
- ~4,300 individual races
- Full bracket progression
- Comprehensive statistics

### Running Stress Tests

```bash
# Generate stress test data
python stress_test_generator.py

# The script will:
# 1. Generate realistic participant names
# 2. Create series and seasons
# 3. Generate events with various bracket types
# 4. Simulate race completions
# 5. Calculate statistics
# 6. Import to database
# 7. Run validation checks
```

### Stress Test Validation

After importing stress test data:

1. **Event Loading Test**
   - Navigate to Events page
   - Should load 152 events quickly (<2s)
   - Pagination should work smoothly

2. **Participant Search Test**
   - Navigate to Participants page
   - Search for common names
   - Should return results quickly (<500ms)

3. **Analytics Performance Test**
   - Navigate to Analytics dashboard
   - Load overall stats
   - Should complete in <3s with caching

4. **Driver Profile Test**
   - Select a driver with 20+ races
   - Load profile with all tabs
   - Should render in <2s

5. **Race Completion Test**
   - Select event with 100+ participants
   - Complete a race
   - Should respond in <200ms

### Performance Benchmarks

With stress test data:
- Event list load: <2 seconds
- Analytics initial load: <3 seconds
- Analytics cached load: <500ms
- Driver profile load: <2 seconds
- Race completion UI: <200ms
- Race completion full: <2 seconds

---

## General Testing Best Practices

### Before Each Testing Session
1. Backup database (`data/epc17.db`)
2. Clear browser cache
3. Open DevTools console
4. Document test environment (browser, OS, version)

### During Testing
1. Monitor console for errors
2. Check network tab for API failures
3. Verify data persistence after refresh
4. Test on multiple browsers
5. Test on mobile devices

### After Testing
1. Document all issues found
2. Categorize by severity (Critical/Major/Minor)
3. Include reproduction steps
4. Attach screenshots/console logs
5. Verify fixes don't break existing functionality

---

**Last Updated**: 2025-10-18  
**Current Version**: D0L11R1.41

