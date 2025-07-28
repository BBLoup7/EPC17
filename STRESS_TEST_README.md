# EPC17 Stress Test Data Generator

This tool generates high-volume test data for performance testing the EPC17 application without modifying any existing code.

## What It Generates

- **4 Series** with realistic racing classes and configurations (doubled from 2)
- **40 Events** (10 per series) with 100-350 drivers each (increased range)
- **12,000+ Drivers** participating in 1-10 events each (doubled load)
- **3-7 Classes per event** with drivers participating in 1-3 classes each
- **Diverse participant names** from 10+ cultural backgrounds
- **Fixed class pricing** at $50, $100, $200, or $400
- **Fair racing settings**: Free run disabled, double elimination only
- **2-4 lane tracks** for realistic racing scenarios

## Usage

### Generate Stress Test Data
```bash
node stress-test-generator.js generate
```

This will:
1. Backup your existing data to `data/stress-test-backup/`
2. Generate new stress test data
3. Save it to your data files
4. Create a summary report

### Restore Original Data
```bash
node stress-test-generator.js cleanup
```

This will:
1. Restore your original data from backup
2. Remove the backup directory
3. Remove the summary file

## Generated Data Summary

After generation, you'll see a summary like:
```
📈 Generated Data Summary:
   Series: 4
   Events: 40
   Drivers: 12,000
   Total Participants: 90,000+
   Average per Event: 2,250
```

## Files Created/Modified

- `data/series.json` - 2 new series with classes
- `data/events.json` - 20 new events with participants
- `data/participants.json` - 5,000+ drivers with realistic data
- `stress-test-summary.json` - Generation summary
- `data/stress-test-backup/` - Backup of original data

## Data Characteristics

### Drivers
- **Diverse names** from 10+ cultural backgrounds (English, French, Spanish, Italian, German, Scandinavian, Eastern European, Asian, Middle Eastern, African)
- Valid email addresses and phone numbers
- Random participation in 1-10 events
- 1-3 classes per driver
- Complete sled configurations
- Realistic statistics and performance data

### Events
- 100-350 participants per event (increased diversity)
- 3-7 racing classes per event
- **Fixed pricing**: $50, $100, $200, or $400 per class
- **Fair racing**: Free run disabled, double elimination only
- **2-4 lane tracks** for realistic racing
- Realistic locations across Quebec
- Valid dates throughout 2025

### Series
- 5-10 classes per series
- **Fixed pricing structure** for consistent testing
- Proper season dates and rules



## Safety Features

- **Automatic Backup**: Your original data is always backed up
- **No Code Changes**: Only modifies data files, never application code
- **Easy Cleanup**: One command restores everything to original state
- **Validation**: Generates valid JSON that matches your app's data structure

## Performance Testing

This data set will stress test:
- Event loading and filtering
- Driver registration and management
- Class assignment and management
- Statistics calculations
- UI rendering with large datasets
- Search and filtering performance
- Memory usage with large participant lists

## Data Validation

After generating stress test data, you can validate it's working properly:

1. **Load the helper script** in your browser console or include it in your HTML:
   ```html
   <script src="stress-test-helper.js"></script>
   ```

2. **Run validation** in the browser console:
   ```javascript
   const helper = new StressTestHelper();
   helper.runFullValidation();
   ```

3. **Check the console** for validation results and any warnings about missing participants.

## Troubleshooting

If you see "Participant not found" errors:

1. **Force data reload** in the browser console:
   ```javascript
   await window.dataManager.loadFromStorage(null, true);
   ```

2. **Check participant lookup**:
   ```javascript
   const participants = window.dataManager.getParticipantsArray();
   console.log('Total participants:', participants.length);
   ```

3. **Validate specific participant**:
   ```javascript
   const participant = window.dataManager.getParticipant('participant-id-here');
   console.log('Found participant:', participant);
   ```

## Cleanup After Testing

When you're done testing, simply run:
```bash
node stress-test-generator.js cleanup
```

This will completely restore your original data and remove all traces of the stress test. 