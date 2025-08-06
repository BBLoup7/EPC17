# EPC17 Testing Suite

This directory contains comprehensive test files for validating various components of the EPC17 racing event management system.

## Test Files

### HTML Test Pages

#### `event-completion-test.html`
- **Purpose**: Tests the event completion detection system
- **Features**: 
  - Validates automatic status transitions (upcoming → active → completed)
  - Tests heat completion flow
  - Manual override functionality
  - Event status monitoring
- **Usage**: Open in browser to test event completion logic

#### `event-status-test.html`
- **Purpose**: Tests the event status management system
- **Features**:
  - Validates DataManager status methods
  - Tests RaceManager integration
  - Event bus integration testing
  - Real-time status updates
- **Usage**: Open in browser to test event status functionality

#### `debug-logging-test.html`
- **Purpose**: Tests the debug logging system
- **Features**:
  - Log level configuration testing
  - Performance mode validation
  - Category suppression testing
  - Console output verification
- **Usage**: Open in browser to test debug logging functionality

#### `sorting-test.html`
- **Purpose**: Tests data sorting and filtering functionality
- **Features**:
  - Participant list sorting
  - Event filtering
  - Search functionality
  - Performance validation
- **Usage**: Open in browser to test sorting and filtering

### JavaScript Test Files

#### `participant-loading-test.js`
- **Purpose**: Tests participant data loading and validation
- **Features**:
  - Large dataset loading (12,000+ participants)
  - Participant lookup validation
  - ID format verification
  - Server limit testing
- **Usage**: Include in HTML or run in browser console

#### `class-matching-test.js`
- **Purpose**: Tests class assignment and matching logic
- **Features**:
  - Class assignment validation
  - Participant-class matching
  - Bracket generation testing
  - Class completion detection
- **Usage**: Include in HTML or run in browser console

## Running Tests

### Browser-Based Tests
1. Open any `.html` file in a web browser
2. Follow the on-screen instructions
3. Check browser console for detailed results

### JavaScript Tests
1. Include the `.js` file in your HTML page
2. Or run directly in browser console
3. Check console output for test results

## Test Data Requirements

Most tests require:
- Active EPC17 server running on `localhost:5000`
- Sample data in the `data/` directory
- Modern web browser with JavaScript enabled

## Stress Testing

For performance testing with large datasets, use the stress test tools in the `stress-test/` directory:
- `stress-test-generator.js` - Generate large test datasets
- `stress-test-helper.js` - Validation and analysis tools

## Debugging

If tests fail:
1. Check browser console for error messages
2. Verify server is running and accessible
3. Ensure test data is properly loaded
4. Check network connectivity

## Contributing

When adding new features to EPC17:
1. Create corresponding test files in this directory
2. Follow the naming convention: `feature-name-test.html` or `feature-name-test.js`
3. Include comprehensive test coverage
4. Update this README with test descriptions 