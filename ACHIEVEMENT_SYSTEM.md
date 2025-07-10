# Achievement Tag System Documentation

## Overview

The Achievement Tag System is a comprehensive feature that automatically awards visual achievement tags to drivers based on their performance and racing patterns. Tags are displayed on driver profiles with tooltips containing detailed descriptions.

## Features

- **9 Unique Achievement Tags** with different rarity levels
- **Automatic Calculation** after event completion
- **Visual Display** on driver profiles with hover tooltips
- **Persistent Storage** - achievements are never removed
- **Real-time Notifications** when new achievements are awarded
- **Modular Architecture** for easy expansion

## Achievement Tags

### 🧨 Lane Bias Index *(Rare)*
**Description:** Wins primarily from a lane that statistically underperforms  
**Criteria:** Driver wins mostly from lanes with below-average win rates

### 🧍‍♂️ Anti-Social Racer *(Common)*
**Description:** Fewest unique opponents - keeps drawing the same people  
**Criteria:** Faces significantly fewer unique opponents than average

### 🎯 Bracket Comeback of the Day *(Epic)*
**Description:** Deepest lower-bracket run - dropped early, climbed to final  
**Criteria:** Extensive lower bracket performance (future implementation)

### 🔁 Rematch Count *(Common)*
**Description:** Most rematches in a single event  
**Criteria:** Has the highest number of rematches (≥3) in an event

### 🔪 Silent Killer *(Rare)*
**Description:** Most eliminations, no podium  
**Criteria:** Eliminates many opponents without placing (future implementation)

### 😬 Lane Loyalty Violation *(Common)*
**Description:** Never raced in the same lane twice  
**Criteria:** Uses a different lane in every single heat (≥3 races)

### 🧹 Clean Sweep *(Legendary)*
**Description:** Perfect upper-bracket run  
**Criteria:** Wins every match in upper bracket (≥3 consecutive wins)

### 🧱 Unbreakable Wall *(Epic)*
**Description:** Eliminated the most opponents  
**Criteria:** Statistically the biggest eliminator (future implementation)

### 🍀 Luckiest Draw *(Rare)*
**Description:** No rematches + preferred lane usage  
**Criteria:** Perfect bracket draw with no rematches (≥3 races)

## Technical Implementation

### Server-Side (Python/Flask)

#### Database Storage
- `achievements.json` - Stores earned achievements
- Each achievement has: `participantId`, `tagId`, `eventId`, `earnedDate`, `details`

#### API Endpoints
- `GET /api/achievements` - Retrieve achievements (optional participantId filter)
- `POST /api/achievements` - Manually award achievement
- `POST /api/calculate-achievements` - Calculate achievements for an event

#### Achievement Calculation
The `calculate_event_achievements()` function analyzes race data and awards achievements based on statistical analysis of:
- Lane usage patterns
- Opponent matching history
- Win/loss records
- Bracket performance

### Client-Side (JavaScript)

#### Achievement Manager Module
- `modules/achievement-manager.js` - Main achievement management class
- Handles API communication, HTML generation, and notifications

#### Integration Points
- **Race UI** - Automatically calculates achievements when events complete
- **Driver Profiles** - Displays earned achievement tags
- **Real-time Notifications** - Shows popup when new achievements are earned

### User Interface

#### Driver Profile Display
```html
<div class="achievement-tags">
    <div class="achievement-tag rare" data-tag-id="lane-bias-index">
        <span class="achievement-emoji">🧨</span>
        <span class="achievement-title">Lane Bias Index</span>
        <div class="achievement-tooltip">
            <div>Wins primarily from a lane that statistically underperforms</div>
            <div class="achievement-details">
                Earned: 6/22/2025<br>
                Details: Won primarily from lane 3 (underperforming lane)
            </div>
        </div>
    </div>
</div>
```

#### Achievement Rarity Classes
- `.achievement-tag.common` - Blue gradient background
- `.achievement-tag.rare` - Red gradient background  
- `.achievement-tag.epic` - Purple gradient background
- `.achievement-tag.legendary` - Gold gradient background with dark text

## Usage Instructions

### Automatic Calculation
Achievements are automatically calculated when:
1. A race heat is completed
2. All races in an event are finished
3. The system detects event completion

### Manual Calculation
For testing or admin purposes:
```javascript
// In browser console on races page
raceUI.manuallyCalculateAchievements();

// Or via direct API call
fetch('/api/calculate-achievements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: 'your-event-id' })
});
```

### Viewing Achievements
1. Navigate to **Driver Profiles** page
2. Select any driver from the grid or dropdown
3. Achievement tags appear below driver information
4. Hover over tags to see detailed tooltips

## Adding New Achievements

### 1. Define Achievement Tag
Add to `achievementTags` object in both:
- `server.py` (calculation function)
- `modules/achievement-manager.js` (client-side)

```javascript
'new-achievement-id': {
    title: '🎪 Achievement Title',
    description: 'Detailed description of what this achievement represents',
    rarity: 'epic', // common, rare, epic, legendary
    category: 'performance' // for organization
}
```

### 2. Add Calculation Logic
In `calculate_event_achievements()` function in `server.py`:

```python
# Your achievement criteria logic
if your_criteria_met and 'new-achievement-id' not in existing_tags:
    new_achievements.append({
        'participantId': participant_id,
        'tagId': 'new-achievement-id',
        'eventId': event_id,
        'earnedDate': datetime.now().isoformat(),
        'details': 'Specific details about how it was earned'
    })
```

### 3. Test
1. Run races that should trigger your achievement
2. Check console logs for calculation results
3. Verify achievement appears on driver profile

## Configuration

### Achievement Thresholds
Most achievement criteria can be adjusted in the calculation function:
- Minimum races required (currently 3)
- Statistical thresholds (e.g., 0.7x average for anti-social)
- Rematch count minimums

### Display Settings
Achievement display can be customized via CSS:
- Tag colors and gradients
- Tooltip positioning and styling
- Animation effects

## Troubleshooting

### Achievements Not Calculating
1. Check server logs for calculation errors
2. Verify event has completed races
3. Ensure race data includes required fields (lane, participantId, results)

### Achievements Not Displaying
1. Check browser console for JavaScript errors
2. Verify Achievement Manager is loaded
3. Confirm achievement data is fetched from API

### Missing Achievement Tags
1. Verify tagId exists in achievement definitions
2. Check for typos in achievement IDs
3. Ensure client and server definitions match

## Future Enhancements

- **Bracket-specific achievements** (requires enhanced bracket tracking)
- **Season-long achievements** (cross-event performance)
- **Team-based achievements** (collaborative accomplishments)
- **Achievement levels** (bronze/silver/gold variants)
- **Achievement sharing** (social media integration)
- **Achievement statistics** (rarity percentages, leaderboards) 